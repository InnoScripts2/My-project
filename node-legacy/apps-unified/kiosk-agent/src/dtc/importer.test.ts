import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { importDtcPackage, DtcImportError, type DtcManifest } from './importer.js';

let tempDir: string;
let databasePath: string;
let cacheDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dtc-importer-'));
  databasePath = join(tempDir, 'kiosk.db');
  cacheDir = join(tempDir, 'cache');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('importDtcPackage stores metadata and records (AGT-002)', async () => {
  const artifacts = createSignedPackage(tempDir);

  const result = await importDtcPackage({
    archivePath: artifacts.archivePath,
    signaturePath: artifacts.signaturePath,
    publicKeyPath: artifacts.publicKeyPath,
    databasePath,
    cacheDir,
    source: 'test-suite',
  });

  assert.equal(result.packageId, artifacts.manifest.packageId);
  assert.equal(result.recordsImported, artifacts.manifest.records);

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  const pkg = db.prepare('SELECT package_id AS packageId, checksum FROM dtc_packages').get() as { packageId: string; checksum: string };
  const recordCount = db.prepare('SELECT COUNT(*) AS count FROM dtc_records').get() as { count: number };
  db.close();

  assert.equal(pkg.packageId, artifacts.manifest.packageId);
  assert.equal(pkg.checksum, artifacts.manifest.checksum);
  assert.equal(recordCount.count, artifacts.manifest.records);

  const cachedManifest = join(cacheDir, artifacts.manifest.packageId, artifacts.manifest.version, 'manifest.json');
  assert.equal(existsSync(cachedManifest), true);
});

test('importDtcPackage rejects tampered archive (AGT-003)', async () => {
  const artifacts = createSignedPackage(tempDir);
  const original = readFileSync(artifacts.archivePath);
  writeFileSync(artifacts.archivePath, Buffer.concat([original, Buffer.from([0xff])]));
  await assert.rejects(
    () =>
      importDtcPackage({
        archivePath: artifacts.archivePath,
        signaturePath: artifacts.signaturePath,
        publicKeyPath: artifacts.publicKeyPath,
        databasePath,
        cacheDir,
      }),
    (error) => error instanceof DtcImportError && error.message === 'Signature verification failed'
  );
});

test('importDtcPackage blocks checksum mismatch despite valid signature', async () => {
  const artifacts = createSignedPackage(tempDir, { overrideChecksum: '0'.repeat(64) });

  await assert.rejects(
    () =>
      importDtcPackage({
        archivePath: artifacts.archivePath,
        signaturePath: artifacts.signaturePath,
        publicKeyPath: artifacts.publicKeyPath,
        databasePath,
        cacheDir,
      }),
    (error) => error instanceof DtcImportError && /Checksum mismatch/.test(error.message)
  );
});

test('importDtcPackage requires signature when unsigned packages are disabled (SEC-001)', async () => {
  const artifacts = createSignedPackage(tempDir);

  await assert.rejects(
    () =>
      importDtcPackage({
        archivePath: artifacts.archivePath,
        databasePath,
        cacheDir,
      }),
    (error) => error instanceof DtcImportError && error.message === 'Signature path is required for signed import'
  );
});

interface PackageArtifacts {
  archivePath: string;
  signaturePath: string;
  publicKeyPath: string;
  manifest: DtcManifest;
}

interface PackageOptions {
  overrideChecksum?: string;
}

function createSignedPackage(baseDir: string, options: PackageOptions = {}): PackageArtifacts {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const manifestBase: DtcManifest = {
    packageId: 'dtc.landrover.2025.q4-dev',
    version: '2025.10.1',
    checksum: '',
    records: 0,
    appMinVersion: '1.0.0',
    createdAtUtc: '2025-10-12T00:00:00Z',
    notes: 'Test Land Rover package',
    keyId: 'primary',
  };

  const records = [
    {
      code: 'P0420',
      description_ru: 'Эффективность катализатора ниже порога',
      description_en: 'Catalyst System Efficiency Below Threshold (Bank 1)',
      severity: 'warning',
    },
    {
      code: 'U1A04-68',
      description_ru: 'Ошибка связи с модулем кузова',
      description_en: 'Body Control Module Communication Error',
      severity: 'critical',
    },
  ];

  const entries = new Map<string, Buffer>();
  entries.set('data/dtc_LANDROVER.json', Buffer.from(JSON.stringify(records, null, 2), 'utf-8'));
  manifestBase.records = records.length;

  const canonicalManifest = deepSortJson({ ...manifestBase, checksum: '' });
  const canonicalManifestBytes = Buffer.from(stringifyCanonicalJson(canonicalManifest), 'utf-8');
  const canonicalEntries = new Map(entries);
  canonicalEntries.set('manifest.json', canonicalManifestBytes);
  const canonicalArchive = buildCanonicalArchive(canonicalEntries);
  const checksum = createHash('sha256').update(canonicalArchive).digest('hex');

  const finalManifestObject: DtcManifest = { ...manifestBase, checksum: options.overrideChecksum ?? checksum };
  const finalManifest = deepSortJson(finalManifestObject);
  const finalManifestBytes = Buffer.from(stringifyCanonicalJson(finalManifest), 'utf-8');
  const finalEntries = new Map(entries);
  finalEntries.set('manifest.json', finalManifestBytes);
  const archiveBuffer = buildCanonicalArchive(finalEntries);

  const archivePath = join(baseDir, 'landrover.obdresource');
  writeFileSync(archivePath, archiveBuffer);

  const signature = sign(null, archiveBuffer, privateKey);
  const signaturePath = join(baseDir, 'landrover.obdresource.sig');
  writeFileSync(signaturePath, signature);

  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }) as string;
  const publicKeyPath = join(baseDir, 'ed25519.pub');
  writeFileSync(publicKeyPath, publicKeyPem);

  return {
    archivePath,
    signaturePath,
    publicKeyPath,
    manifest: finalManifestObject,
  };
}

const ZIP_SIGNATURE_LOCAL = 0x04034b50;
const ZIP_SIGNATURE_CENTRAL = 0x02014b50;
const ZIP_SIGNATURE_END = 0x06054b50;
const ZIP_VERSION_EXTRACT = 20;
const ZIP_VERSION_MADE_BY = (3 << 8) | ZIP_VERSION_EXTRACT;
const CANONICAL_DOS_DATE = 0x5a01;
const CANONICAL_DOS_TIME = 0x0000;
const DEFAULT_PERMISSIONS = (0o644 << 16) >>> 0;
const CRC32_TABLE = createCrc32Table();

function stringifyCanonicalJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  return json.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function deepSortJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepSortJson(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const sorted: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      sorted[key] = deepSortJson(val);
    }
    return sorted as unknown as T;
  }
  return value;
}

function buildCanonicalArchive(entries: Map<string, Buffer>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  const sortedEntries = Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b));
  let offset = 0;

  for (const [name, data] of sortedEntries) {
    const nameBuffer = Buffer.from(name, 'utf-8');
    const crc32 = computeCrc32(data);
    const compressed = deflateRawSync(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_SIGNATURE_LOCAL, 0);
    localHeader.writeUInt16LE(ZIP_VERSION_EXTRACT, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(CANONICAL_DOS_TIME, 10);
    localHeader.writeUInt16LE(CANONICAL_DOS_DATE, 12);
    localHeader.writeUInt32LE(crc32 >>> 0, 14);
    localHeader.writeUInt32LE(compressed.length >>> 0, 18);
    localHeader.writeUInt32LE(data.length >>> 0, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_SIGNATURE_CENTRAL, 0);
    centralHeader.writeUInt16LE(ZIP_VERSION_MADE_BY, 4);
    centralHeader.writeUInt16LE(ZIP_VERSION_EXTRACT, 6);
    centralHeader.writeUInt16LE(0, 8);
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
    centralHeader.writeUInt32LE(DEFAULT_PERMISSIONS, 38);
    centralHeader.writeUInt32LE(offset >>> 0, 42);

    centralChunks.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectorySize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const centralDirectoryOffset = offset;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(ZIP_SIGNATURE_END, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(sortedEntries.length, 8);
  endRecord.writeUInt16LE(sortedEntries.length, 10);
  endRecord.writeUInt32LE(centralDirectorySize >>> 0, 12);
  endRecord.writeUInt32LE(centralDirectoryOffset >>> 0, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, endRecord]);
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function computeCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
