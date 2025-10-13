import { existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
type BetterSqliteDatabase = Database.Database;
import { config } from '../config/loader.js';

export interface DtcPackageInfo {
  packageId: string;
  version: string;
  checksum: string;
  keyId: string;
  records: number;
  appMinVersion: string;
  createdAtUtc: string;
  notes: string | null;
  installedAtUtc: string;
  source: string;
}

export interface DtcLookupMatch {
  code: string;
  brand: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  severity: string | null;
  packageId: string;
  version: string;
  installedAtUtc: string;
}

export interface DtcLookupEntry {
  code: string;
  matches: DtcLookupMatch[];
}

export interface DtcLookupOptions {
  brand?: string;
  limitPerCode?: number;
}

export interface DtcLookupResult {
  entries: DtcLookupEntry[];
  invalidCodes: string[];
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..', '..');

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9\-\/\.]{1,10}$/;

function normalizeBrand(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
}

function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  if (!CODE_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function isSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as any).code;
  const message = String((error as any).message || '');
  return code === 'SQLITE_ERROR' && message.includes('no such table');
}

export class DtcService {
  private db: BetterSqliteDatabase | null = null;
  private readonly databasePath: string;

  constructor(options: { databasePath?: string } = {}) {
    this.databasePath = this.resolveDatabasePath(options.databasePath);
  }

  listActivePackages(): DtcPackageInfo[] {
    const db = this.openDatabase();
    if (!db) return [];
    try {
      const rows = db
        .prepare(
          `SELECT package_id AS packageId,
                  version,
                  checksum,
                  key_id AS keyId,
                  records,
                  app_min_version AS appMinVersion,
                  created_at_utc AS createdAtUtc,
                  notes,
                  installed_at_utc AS installedAtUtc,
                  source
             FROM dtc_packages
            WHERE status = 'active'
            ORDER BY installed_at_utc DESC`
        )
        .all() as DtcPackageInfo[];
      return rows;
    } catch (error) {
      if (isSchemaMissing(error)) {
        return [];
      }
      throw error;
    }
  }

  lookup(codes: string[], options: DtcLookupOptions = {}): DtcLookupResult {
    const normalizedCodes: string[] = [];
    const invalidCodes: string[] = [];
    const seen = new Set<string>();

    for (const code of codes) {
      if (typeof code !== 'string') {
        invalidCodes.push(String(code));
        continue;
      }
      const normalized = normalizeCode(code);
      if (!normalized) {
        invalidCodes.push(code.trim().toUpperCase() || code);
        continue;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        normalizedCodes.push(normalized);
      }
    }

    if (normalizedCodes.length === 0) {
      return { entries: normalizedCodes.map((code) => ({ code, matches: [] })), invalidCodes };
    }

    const db = this.openDatabase();
    if (!db) {
      return {
        entries: normalizedCodes.map((code) => ({ code, matches: [] })),
        invalidCodes,
      };
    }

    const brand = normalizeBrand(options.brand);
    const limitPerCode = typeof options.limitPerCode === 'number' && options.limitPerCode > 0 ? options.limitPerCode : undefined;

    try {
      const placeholders = normalizedCodes.map(() => '?').join(',');
      const orderClause = brand ? 'ORDER BY r.code, (r.brand = ?) DESC, p.installed_at_utc DESC' : 'ORDER BY r.code, p.installed_at_utc DESC';
      const sql = `SELECT r.code,
                          r.brand,
                          r.description_ru AS descriptionRu,
                          r.description_en AS descriptionEn,
                          r.severity,
                          p.package_id AS packageId,
                          p.version,
                          p.installed_at_utc AS installedAtUtc
                     FROM dtc_records r
                     JOIN dtc_packages p
                       ON p.package_id = r.package_id
                      AND p.version = r.version
                    WHERE p.status = 'active'
                      AND r.code IN (${placeholders})
                    ${orderClause}`;
      const stmt = db.prepare(sql);
      const rows = brand ? stmt.all(...normalizedCodes, brand) : stmt.all(...normalizedCodes);

      const grouped = new Map<string, DtcLookupMatch[]>();
      for (const row of rows as DtcLookupMatch[]) {
        const list = grouped.get(row.code);
        if (list) {
          list.push(row);
        } else {
          grouped.set(row.code, [row]);
        }
      }

      const entries: DtcLookupEntry[] = [];
      for (const code of normalizedCodes) {
        const matches = grouped.get(code) ?? [];
        if (matches.length > 1 && limitPerCode) {
          entries.push({ code, matches: matches.slice(0, limitPerCode) });
        } else {
          entries.push({ code, matches });
        }
      }

      return { entries, invalidCodes };
    } catch (error) {
      if (isSchemaMissing(error)) {
        return {
          entries: normalizedCodes.map((code) => ({ code, matches: [] })),
          invalidCodes,
        };
      }
      throw error;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private openDatabase(): BetterSqliteDatabase | null {
    if (this.db) {
      return this.db;
    }

    if (!existsSync(this.databasePath)) {
      return null;
    }

    try {
      this.db = new Database(this.databasePath, { readonly: true, fileMustExist: true });
      this.db.pragma('foreign_keys = ON');
      return this.db;
    } catch (error) {
      if (error && typeof error === 'object' && (error as any).code === 'SQLITE_CANTOPEN') {
        return null;
      }
      throw error;
    }
  }

  private resolveDatabasePath(overridePath?: string): string {
    if (overridePath) {
      return resolve(overridePath);
    }
    const configured = config.get('SQLITE_PATH');
    if (!configured) {
      return resolve(PROJECT_ROOT, 'data', 'kiosk.db');
    }
    if (isAbsolute(configured)) {
      return configured;
    }
    return resolve(PROJECT_ROOT, configured);
  }
}

export const dtcService = new DtcService();
