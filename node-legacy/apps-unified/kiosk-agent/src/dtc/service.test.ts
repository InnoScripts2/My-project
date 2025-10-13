import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { DtcService } from './service.js';

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dtc-service-'));
  dbPath = join(tempDir, 'kiosk.db');

  const db = new Database(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE dtc_packages (
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
      status TEXT NOT NULL,
      PRIMARY KEY (package_id, version)
    );
    CREATE TABLE dtc_records (
      package_id TEXT NOT NULL,
      version TEXT NOT NULL,
      brand TEXT NOT NULL,
      code TEXT NOT NULL,
      description_ru TEXT,
      description_en TEXT,
      severity TEXT,
      PRIMARY KEY (package_id, version, brand, code),
      FOREIGN KEY (package_id, version)
        REFERENCES dtc_packages(package_id, version)
        ON DELETE CASCADE
    );
  `);

  const insertPackage = db.prepare(`
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRecord = db.prepare(`
    INSERT INTO dtc_records (
      package_id,
      version,
      brand,
      code,
      description_ru,
      description_en,
      severity
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertPackage.run(
    'dtc.landrover.2025.q4-dev',
    '2025.10.1',
    'fcf4b533b3ee9f21ed1583499002f243a148579dbace03d9952a798b91b5ef3a',
    'primary',
    3,
    '1.0.0',
    '2025-10-12T00:00:00Z',
    'Land Rover catalogs',
    '2025-10-13T10:00:00Z',
    'manual',
    'active'
  );
  insertRecord.run(
    'dtc.landrover.2025.q4-dev',
    '2025.10.1',
    'LANDROVER',
    'P0420',
    'Эффективность катализатора ниже порога',
    'Catalyst System Efficiency Below Threshold (Bank 1)',
    'warning'
  );
  insertRecord.run(
    'dtc.landrover.2025.q4-dev',
    '2025.10.1',
    'GLOBAL',
    'P0420',
    'Низкая эффективность катализатора',
    'Catalyst System Efficiency',
    'warning'
  );
  insertRecord.run(
    'dtc.landrover.2025.q4-dev',
    '2025.10.1',
    'LANDROVER',
    'U1A04-68',
    'Ошибка связи с модулем кузова',
    'Body Control Module Communication Error',
    'critical'
  );

  db.close();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('listActivePackages returns imported package metadata', () => {
  const service = new DtcService({ databasePath: dbPath });
  const packages = service.listActivePackages();
  service.close();

  assert.equal(packages.length, 1);
  const entry = packages[0]!;
  assert.equal(entry.packageId, 'dtc.landrover.2025.q4-dev');
  assert.equal(entry.records, 3);
  assert.equal(entry.notes, 'Land Rover catalogs');
});

test('lookup returns brand-specific match and falls back to generic', () => {
  const service = new DtcService({ databasePath: dbPath });
  const result = service.lookup(['p0420', 'U1A04-68', 'INVALID'], { brand: 'LandRover' });
  service.close();

  assert.deepEqual(result.invalidCodes, ['INVALID']);
  assert.equal(result.entries.length, 2);

  const first = result.entries.find((entry) => entry.code === 'P0420');
  assert(first);
  assert.equal(first.matches.length, 2);
  assert.equal(first.matches[0]?.brand, 'LANDROVER');
  assert.equal(first.matches[0]?.descriptionEn, 'Catalyst System Efficiency Below Threshold (Bank 1)');

  const second = result.entries.find((entry) => entry.code === 'U1A04-68');
  assert(second);
  assert.equal(second.matches.length, 1);
  assert.equal(second.matches[0]?.severity, 'critical');
});

test('lookup returns empty results when database missing', () => {
  const service = new DtcService({ databasePath: join(tempDir, 'missing.db') });
  const result = service.lookup(['P0420']);
  service.close();

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.matches.length, 0);
});
