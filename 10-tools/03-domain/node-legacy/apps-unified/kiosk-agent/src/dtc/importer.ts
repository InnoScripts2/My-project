import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPublicKey, KeyObject, verify as verifyEd25519 } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import Database from 'better-sqlite3';
import AdmZip from 'adm-zip';

export interface DtcManifest {
	packageId: string;
	version: string;
	checksum: string;
	records: number;
	appMinVersion: string;
	createdAtUtc: string;
	notes?: string;
	keyId: string;
	[key: string]: unknown;
}

export interface DtcImportOptions {
	archivePath: string;
	signaturePath?: string;
	publicKeyPath?: string;
	expectedKeyId?: string;
	databasePath?: string;
	cacheDir?: string;
	currentAppVersion?: string;
	source?: string;
	allowUnsigned?: boolean;
}

export interface DtcImportResult {
	packageId: string;
	version: string;
	recordsImported: number;
	brandsProcessed: number;
	databasePath: string;
	manifestPath: string;
	archivePath: string;
}

export class DtcImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DtcImportError';
	}
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..', '..');
const DEFAULT_DATABASE_PATH = join(PROJECT_ROOT, 'data', 'kiosk.db');
const DEFAULT_CACHE_DIR = join(PROJECT_ROOT, 'cache', 'dtc');
const DEFAULT_SOURCE = 'manual';

const ZIP_SIGNATURE_LOCAL = 0x04034b50;
const ZIP_SIGNATURE_CENTRAL = 0x02014b50;
const ZIP_SIGNATURE_END = 0x06054b50;
const ZIP_VERSION_EXTRACT = 20; // ZIP specification 2.0
const ZIP_VERSION_MADE_BY = (3 << 8) | ZIP_VERSION_EXTRACT; // Unix + version 2.0
const CANONICAL_DOS_DATE = 0x5a01; // 2025-01-01
const CANONICAL_DOS_TIME = 0x0000;
const DEFAULT_PERMISSIONS = (0o644 << 16) >>> 0;
const ZIP_FLAG_UTF8 = 0x0800;

const CRC32_TABLE = createCrc32Table();

export async function importDtcPackage(options: DtcImportOptions): Promise<DtcImportResult> {
	const archivePath = resolve(options.archivePath);
	const signaturePath = options.signaturePath ? resolve(options.signaturePath) : undefined;
	const publicKeyPath = options.publicKeyPath ? resolve(options.publicKeyPath) : undefined;
	const databasePath = resolve(options.databasePath ?? DEFAULT_DATABASE_PATH);
	const cacheDir = resolve(options.cacheDir ?? DEFAULT_CACHE_DIR);
	const sourceTag = options.source ?? DEFAULT_SOURCE;
	const allowUnsigned = options.allowUnsigned ?? false;

	if (!existsSync(archivePath)) {
		throw new DtcImportError(`Archive not found: ${archivePath}`);
	}

	if (!allowUnsigned) {
		if (!signaturePath) {
			throw new DtcImportError('Signature path is required for signed import');
		}
		if (!publicKeyPath) {
			throw new DtcImportError('Public key path is required for signed import');
		}
	}

	const archiveBytes = readFileSync(archivePath);
	const signatureBytes = signaturePath ? readFileSync(signaturePath) : null;
	const publicKey = publicKeyPath ? loadEd25519PublicKey(readFileSync(publicKeyPath)) : null;

	if (!allowUnsigned && publicKey && signatureBytes) {
		const verified = verifyEd25519(null, archiveBytes, publicKey, signatureBytes);
		if (!verified) {
			throw new DtcImportError('Signature verification failed');
		}
	}

	const zip = new AdmZip(archiveBytes);
	const payload = extractEntries(zip);
	const manifest = parseManifest(payload.get('manifest.json'));

	if (typeof manifest.packageId !== 'string' || !manifest.packageId.trim()) {
		throw new DtcImportError('Manifest is missing packageId');
	}
	if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
		throw new DtcImportError('Manifest is missing version');
	}
	if (typeof manifest.keyId !== 'string' || !manifest.keyId.trim()) {
		throw new DtcImportError('Manifest is missing keyId');
	}
	if (typeof manifest.checksum !== 'string' || manifest.checksum.length !== 64) {
		throw new DtcImportError('Manifest checksum is invalid');
	}
	if (typeof manifest.records !== 'number' || manifest.records <= 0) {
		throw new DtcImportError('Manifest record count is invalid');
	}
	if (typeof manifest.appMinVersion !== 'string' || !manifest.appMinVersion.trim()) {
		throw new DtcImportError('Manifest is missing appMinVersion');
	}
	if (options.expectedKeyId && manifest.keyId !== options.expectedKeyId) {
		throw new DtcImportError(`keyId mismatch: manifest=${manifest.keyId}, expected=${options.expectedKeyId}`);
	}

	const currentVersion = options.currentAppVersion ?? readCurrentAppVersion();
	if (!isVersionCompatible(currentVersion, manifest.appMinVersion)) {
		throw new DtcImportError(`Package requires app version ${manifest.appMinVersion} (current ${currentVersion})`);
	}

	const computedRecordCount = countRecords(payload);
	if (computedRecordCount !== manifest.records) {
		throw new DtcImportError(`Record count mismatch: manifest=${manifest.records}, computed=${computedRecordCount}`);
	}

	verifyManifestChecksum(manifest, payload);

	const dtcRecords = collectDtcRecords(payload);
	if (dtcRecords.total !== manifest.records) {
		throw new DtcImportError(`Collected record count mismatch: expected=${manifest.records}, collected=${dtcRecords.total}`);
	}

	ensureDirectoryExists(dirname(databasePath));
	ensureDirectoryExists(cacheDir);

	writeToDatabase({
		databasePath,
		manifest,
		records: dtcRecords.records,
		source: sourceTag,
	});

	persistArtifacts({
		cacheDir,
		manifest,
		archivePath,
		archiveBytes,
		manifestBytes: payload.get('manifest.json')!,
		signaturePath,
	});

	return {
		packageId: manifest.packageId,
		version: manifest.version,
		recordsImported: manifest.records,
		brandsProcessed: dtcRecords.records.size,
		databasePath,
		manifestPath: join(cacheDir, manifest.packageId, manifest.version, 'manifest.json'),
		archivePath: join(cacheDir, manifest.packageId, manifest.version, basename(archivePath)),
	};
}

function readCurrentAppVersion(): string {
	const pkgPath = join(PROJECT_ROOT, 'package.json');
	const raw = JSON.parse(readFileSync(pkgPath, 'utf-8'));
	const version = typeof raw.version === 'string' ? raw.version : '0.0.0';
	return version.trim() || '0.0.0';
}

function extractEntries(zip: AdmZip): Map<string, Buffer> {
	const entries = zip.getEntries();
	const map = new Map<string, Buffer>();
	for (const entry of entries) {
		if (entry.isDirectory) continue;
		const name = entry.entryName;
		map.set(name, entry.getData());
	}
	if (!map.has('manifest.json')) {
		throw new DtcImportError('manifest.json is missing from archive');
	}
	return map;
}

function parseManifest(bytes: Buffer | undefined): DtcManifest {
	if (!bytes) {
		throw new DtcImportError('Manifest payload missing');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString('utf-8'));
	} catch (error) {
		throw new DtcImportError(`Failed to parse manifest: ${(error as Error).message}`);
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new DtcImportError('Manifest must be a JSON object');
	}
	return parsed as DtcManifest;
}

function countRecords(entries: Map<string, Buffer>): number {
	let total = 0;
	for (const [name, blob] of entries) {
		if (!name.startsWith('data/') || !name.endsWith('.json')) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(blob.toString('utf-8'));
		} catch (error) {
			throw new DtcImportError(`Failed to parse ${name}: ${(error as Error).message}`);
		}
		total += extractRecordCount(parsed, name);
	}
	return total;
}

function extractRecordCount(payload: unknown, name: string): number {
	if (Array.isArray(payload)) {
		return payload.length;
	}
	if (payload && typeof payload === 'object') {
		const candidateKeys = ['records', 'items', 'entries'];
		for (const key of candidateKeys) {
			const value = (payload as Record<string, unknown>)[key];
			if (Array.isArray(value)) {
				return value.length;
			}
		}
		throw new DtcImportError(`Unsupported JSON structure in ${name}`);
	}
	throw new DtcImportError(`Unsupported JSON structure in ${name}`);
}

function verifyManifestChecksum(manifest: DtcManifest, entries: Map<string, Buffer>): void {
	const canonicalManifest = deepSortJson({ ...manifest, checksum: '' });
	const manifestBytes = Buffer.from(stringifyCanonicalJson(canonicalManifest), 'utf-8');
	const canonicalEntries = new Map(entries);
	canonicalEntries.set('manifest.json', manifestBytes);
	const canonicalArchive = buildCanonicalArchive(canonicalEntries);
	const checksum = createHash('sha256').update(canonicalArchive).digest('hex');
	if (checksum !== manifest.checksum) {
		throw new DtcImportError(`Checksum mismatch: manifest=${manifest.checksum}, computed=${checksum}`);
	}
}

function collectDtcRecords(entries: Map<string, Buffer>): {
	records: Map<string, DtcRecord[]>;
	total: number;
} {
	const result = new Map<string, DtcRecord[]>();
	let total = 0;
	for (const [name, blob] of entries) {
		if (!name.startsWith('data/') || !name.endsWith('.json')) {
			continue;
		}
		const brand = deriveBrand(name);
		let parsed: unknown;
		try {
			parsed = JSON.parse(blob.toString('utf-8'));
		} catch (error) {
			throw new DtcImportError(`Failed to parse ${name}: ${(error as Error).message}`);
		}
		const normalized = normalizeRecords(parsed, brand, name);
		total += normalized.length;
		const existing = result.get(brand);
		if (existing) {
			existing.push(...normalized);
		} else {
			result.set(brand, normalized);
		}
	}
	return { records: result, total };
}

function stringifyCanonicalJson(value: unknown): string {
	const json = JSON.stringify(value, null, 2);
	return json.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

interface DtcRecord {
	brand: string;
	code: string;
	descriptionRu: string | null;
	descriptionEn: string | null;
	severity: string | null;
}

function normalizeRecords(payload: unknown, brand: string, name: string): DtcRecord[] {
	const list: DtcRecord[] = [];
	const rows = Array.isArray(payload)
		? payload
		: (payload && typeof payload === 'object' && !Array.isArray(payload)
				? (payload as Record<string, unknown>).records ??
					(payload as Record<string, unknown>).items ??
					(payload as Record<string, unknown>).entries
				: null);

	if (!Array.isArray(rows)) {
		throw new DtcImportError(`Unsupported records format in ${name}`);
	}

	for (const row of rows) {
		if (!row || typeof row !== 'object') {
			continue;
		}
		const codeRaw = (row as Record<string, unknown>).code;
		if (typeof codeRaw !== 'string') {
			continue;
		}
		const code = codeRaw.trim().toUpperCase();
		if (!code) {
			continue;
		}
		const descriptionRu = extractOptionalString(row, 'description_ru');
		const descriptionEn = extractOptionalString(row, 'description_en');
		const severity = extractOptionalString(row, 'severity');

		list.push({
			brand,
			code,
			descriptionRu,
			descriptionEn,
			severity: normalizeSeverity(severity),
		});
	}
	return list;
}

function extractOptionalString(row: unknown, key: string): string | null {
	const value = (row as Record<string, unknown>)[key];
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length ? trimmed : null;
	}
	return null;
}

function normalizeSeverity(value: string | null): string | null {
	if (!value) return null;
	const normalized = value.toLowerCase();
	if (!normalized) return null;
	return normalized;
}

function deriveBrand(entryName: string): string {
	const base = entryName.slice('data/'.length);
	const withoutPrefix = base.startsWith('dtc_') ? base.slice(4) : base;
	const withoutSuffix = withoutPrefix.endsWith('.json')
		? withoutPrefix.slice(0, -5)
		: withoutPrefix;
	return withoutSuffix.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
}

function ensureDirectoryExists(path: string): void {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

interface PersistArtifactsOptions {
	cacheDir: string;
	manifest: DtcManifest;
	archivePath: string;
	archiveBytes: Buffer;
	manifestBytes: Buffer;
	signaturePath?: string;
}

function persistArtifacts(options: PersistArtifactsOptions): void {
	const targetDir = join(options.cacheDir, options.manifest.packageId, options.manifest.version);
	ensureDirectoryExists(targetDir);

	const archiveTarget = join(targetDir, basename(options.archivePath));
	writeFileSync(archiveTarget, options.archiveBytes);
	const manifestTarget = join(targetDir, 'manifest.json');
	writeFileSync(manifestTarget, options.manifestBytes);

	if (options.signaturePath) {
		const signatureTarget = join(targetDir, basename(options.signaturePath));
		copyFileSync(options.signaturePath, signatureTarget);
	}
}

interface WriteDatabaseOptions {
	databasePath: string;
	manifest: DtcManifest;
	records: Map<string, DtcRecord[]>;
	source: string;
}

function writeToDatabase(options: WriteDatabaseOptions): void {
	const db = new Database(options.databasePath);
	try {
		db.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA foreign_keys = ON;
			CREATE TABLE IF NOT EXISTS dtc_packages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				package_id TEXT NOT NULL,
				version TEXT NOT NULL,
				checksum TEXT NOT NULL,
				key_id TEXT NOT NULL,
				records INTEGER NOT NULL,
				app_min_version TEXT NOT NULL,
				created_at_utc TEXT NOT NULL,
				notes TEXT,
				installed_at_utc TEXT NOT NULL,
				source TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active',
				UNIQUE(package_id, version)
			);
			CREATE TABLE IF NOT EXISTS dtc_records (
				package_id TEXT NOT NULL,
				version TEXT NOT NULL,
				brand TEXT NOT NULL,
				code TEXT NOT NULL,
				description_ru TEXT,
				description_en TEXT,
				severity TEXT,
				PRIMARY KEY (package_id, version, brand, code)
			);
			CREATE INDEX IF NOT EXISTS idx_dtc_records_code ON dtc_records(code);
			CREATE INDEX IF NOT EXISTS idx_dtc_records_brand_code ON dtc_records(brand, code);
		`);

		const deactivatePrevious = db.prepare(
			`UPDATE dtc_packages SET status = 'superseded' WHERE package_id = ? AND version != ? AND status != 'superseded'`
		);
		const deletePrevious = db.prepare(
			`DELETE FROM dtc_records WHERE package_id = ?`
		);
		const upsertPackage = db.prepare(`
			INSERT INTO dtc_packages (
				package_id,
				version,
				checksum,
				key_id,
				records,
				app_min_version,
				created_at_utc,
				notes,
				installed_at_utc,
				source,
				status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
			ON CONFLICT(package_id, version) DO UPDATE SET
				checksum = excluded.checksum,
				key_id = excluded.key_id,
				records = excluded.records,
				app_min_version = excluded.app_min_version,
				created_at_utc = excluded.created_at_utc,
				notes = excluded.notes,
				installed_at_utc = excluded.installed_at_utc,
				source = excluded.source,
				status = 'active'
		`);

		const insertRecord = db.prepare(`
			INSERT OR REPLACE INTO dtc_records (
				package_id,
				version,
				brand,
				code,
				description_ru,
				description_en,
				severity
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		const transaction = db.transaction(() => {
			deactivatePrevious.run(options.manifest.packageId, options.manifest.version);
			deletePrevious.run(options.manifest.packageId);

			upsertPackage.run(
				options.manifest.packageId,
				options.manifest.version,
				options.manifest.checksum,
				options.manifest.keyId,
				options.manifest.records,
				options.manifest.appMinVersion,
				options.manifest.createdAtUtc,
				options.manifest.notes ?? null,
				new Date().toISOString(),
				options.source
			);

			for (const [brand, records] of options.records) {
				for (const record of records) {
					insertRecord.run(
						options.manifest.packageId,
						options.manifest.version,
						brand,
						record.code,
						record.descriptionRu,
						record.descriptionEn,
						record.severity
					);
				}
			}
		});

		transaction();
	} finally {
		db.close();
	}
}

function loadEd25519PublicKey(data: Buffer): KeyObject {
	const text = data.toString('utf-8').trim();
	if (text.includes('BEGIN PUBLIC KEY')) {
		return createPublicKey(text);
	}
	if (data.length === 32) {
		const prefix = Buffer.from('302a300506032b6570032100', 'hex');
		return createPublicKey({ key: Buffer.concat([prefix, data]), format: 'der', type: 'spki' });
	}
	if (data.length > 32) {
		return createPublicKey({ key: data, format: 'der', type: 'spki' });
	}
	throw new DtcImportError('Unsupported public key format');
}

function isVersionCompatible(current: string, required: string): boolean {
	const currentParts = parseVersionNumbers(current);
	const requiredParts = parseVersionNumbers(required);
	const length = Math.max(currentParts.length, requiredParts.length);
	for (let index = 0; index < length; index += 1) {
		const a = currentParts[index] ?? 0;
		const b = requiredParts[index] ?? 0;
		if (a > b) return true;
		if (a < b) return false;
	}
	return true;
}

function parseVersionNumbers(input: string): number[] {
	const matches = input.match(/\d+/g);
	if (!matches) {
		return [];
	}
	return matches.map((value) => Number.parseInt(value, 10));
}

function deepSortJson<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => deepSortJson(item)) as unknown as T;
	}
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b));
		const sorted: Record<string, unknown> = {};
		for (const [key, val] of entries) {
			sorted[key] = deepSortJson(val);
		}
		return sorted as unknown as T;
	}
	return value;
}

function buildCanonicalArchive(entries: Map<string, Buffer>): Buffer {
	const chunks: Buffer[] = [];
	const centralChunks: Buffer[] = [];
	const sorted = Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b));
	let offset = 0;

	for (const [name, data] of sorted) {
		const nameBuffer = Buffer.from(name, 'utf-8');
		const crc32 = computeCrc32(data);
		const compressed = deflateRawSync(data);
		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(ZIP_SIGNATURE_LOCAL, 0);
		localHeader.writeUInt16LE(ZIP_VERSION_EXTRACT, 4);
		localHeader.writeUInt16LE(ZIP_FLAG_UTF8, 6);
		localHeader.writeUInt16LE(8, 8);
		localHeader.writeUInt16LE(CANONICAL_DOS_TIME, 10);
		localHeader.writeUInt16LE(CANONICAL_DOS_DATE, 12);
		localHeader.writeUInt32LE(crc32 >>> 0, 14);
		localHeader.writeUInt32LE(compressed.length >>> 0, 18);
		localHeader.writeUInt32LE(data.length >>> 0, 22);
		localHeader.writeUInt16LE(nameBuffer.length, 26);
		localHeader.writeUInt16LE(0, 28);

		chunks.push(localHeader, nameBuffer, compressed);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(ZIP_SIGNATURE_CENTRAL, 0);
		centralHeader.writeUInt16LE(ZIP_VERSION_MADE_BY, 4);
		centralHeader.writeUInt16LE(ZIP_VERSION_EXTRACT, 6);
		centralHeader.writeUInt16LE(ZIP_FLAG_UTF8, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt16LE(CANONICAL_DOS_TIME, 12);
		centralHeader.writeUInt16LE(CANONICAL_DOS_DATE, 14);
		centralHeader.writeUInt32LE(crc32 >>> 0, 16);
		centralHeader.writeUInt32LE(compressed.length >>> 0, 20);
		centralHeader.writeUInt32LE(data.length >>> 0, 24);
		centralHeader.writeUInt16LE(nameBuffer.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(DEFAULT_PERMISSIONS >>> 0, 38);
		centralHeader.writeUInt32LE(offset >>> 0, 42);

		centralChunks.push(centralHeader, nameBuffer);

		offset += localHeader.length + nameBuffer.length + compressed.length;
	}

	const centralDirectorySize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const centralDirectoryOffset = offset;

	const endRecord = Buffer.alloc(22);
	endRecord.writeUInt32LE(ZIP_SIGNATURE_END, 0);
	endRecord.writeUInt16LE(0, 4);
	endRecord.writeUInt16LE(0, 6);
	endRecord.writeUInt16LE(sorted.length, 8);
	endRecord.writeUInt16LE(sorted.length, 10);
	endRecord.writeUInt32LE(centralDirectorySize >>> 0, 12);
	endRecord.writeUInt32LE(centralDirectoryOffset >>> 0, 16);
	endRecord.writeUInt16LE(0, 20);

	return Buffer.concat([...chunks, ...centralChunks, endRecord]);
}

function createCrc32Table(): Uint32Array {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) {
			c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[i] = c >>> 0;
	}
	return table;
}

function computeCrc32(buffer: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buffer.length; i += 1) {
		const byte = buffer[i];
		crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
