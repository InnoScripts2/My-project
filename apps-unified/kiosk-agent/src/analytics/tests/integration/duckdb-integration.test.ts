/**
 * Integration tests for DuckDB operations
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { AnalyticsService } from '../../AnalyticsService.js';

describe('DuckDB Integration', () => {
  let analyticsService: AnalyticsService;
  let sqliteDbPath: string;
  let duckDbPath: string;
  const tempRoot = path.join(os.tmpdir(), 'kiosk-agent-tests', 'duckdb-integration');

  before(async () => {
    // Создать тестовую SQLite базу с данными
    fs.mkdirSync(tempRoot, { recursive: true });
    sqliteDbPath = path.join(tempRoot, 'source.db');
    duckDbPath = path.join(tempRoot, 'analytics.duckdb');

    // Удалить если существуют
    if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
    if (fs.existsSync(duckDbPath)) fs.unlinkSync(duckDbPath);

    // Создать SQLite базу с тестовыми данными
    const sqliteDb = new Database(sqliteDbPath);

    sqliteDb.exec(`
      CREATE TABLE sessions (
        session_id VARCHAR PRIMARY KEY,
        created_at TIMESTAMP,
        completed_at TIMESTAMP,
        type VARCHAR,
        status VARCHAR,
        device VARCHAR
      );

      CREATE TABLE payments (
        payment_id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        amount DECIMAL,
        status VARCHAR,
        created_at TIMESTAMP,
        confirmed_at TIMESTAMP
      );

      INSERT INTO sessions VALUES
        ('s1', '2025-01-15 10:00:00', '2025-01-15 10:30:00', 'THICKNESS', 'completed', 'device1'),
        ('s2', '2025-01-15 11:00:00', '2025-01-15 11:25:00', 'DIAGNOSTICS', 'completed', 'device1'),
        ('s3', '2025-01-15 12:00:00', '2025-01-15 12:20:00', 'THICKNESS', 'completed', 'device1'),
        ('s4', '2025-01-16 10:00:00', NULL, 'DIAGNOSTICS', 'incomplete', 'device1');

      INSERT INTO payments VALUES
        ('p1', 's1', 350, 'confirmed', '2025-01-15 10:00:00', '2025-01-15 10:01:00'),
        ('p2', 's2', 480, 'confirmed', '2025-01-15 11:00:00', '2025-01-15 11:01:00'),
        ('p3', 's3', 350, 'confirmed', '2025-01-15 12:00:00', '2025-01-15 12:01:00'),
        ('p4', 's4', 480, 'failed', '2025-01-16 10:00:00', NULL);
    `);

    sqliteDb.close();

    // Инициализировать AnalyticsService
    analyticsService = new AnalyticsService();
    await analyticsService.initDatabase(duckDbPath);
  });

  after(async () => {
    await analyticsService.close();
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('should load data from SQLite database', async () => {
    const result = await analyticsService.loadData([
      {
        name: 'sessions',
        type: 'sqlite',
        path: sqliteDbPath,
        tableName: 'sessions',
      },
      {
        name: 'payments',
        type: 'sqlite',
        path: sqliteDbPath,
        tableName: 'payments',
      },
    ]);

    assert.strictEqual(result.tables.length, 2);
    assert.ok(result.tables.includes('sessions'));
    assert.ok(result.tables.includes('payments'));
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.loaded, 8); // 4 sessions + 4 payments
  });

  it('should execute complex JOIN query', async () => {
    const sql = `
      SELECT 
        s.session_id,
        s.type,
        s.status,
        p.amount,
        p.status as payment_status
      FROM sessions s
      LEFT JOIN payments p ON s.session_id = p.session_id
      WHERE s.created_at >= '2025-01-15' AND s.created_at <= '2025-01-16'
      ORDER BY s.created_at
    `;

    const result = await analyticsService.executeQuery(sql);

    assert.strictEqual(result.rowCount, 4);
    assert.ok(result.columns.includes('session_id'));
    assert.ok(result.columns.includes('type'));
    assert.ok(result.columns.includes('amount'));
    assert.ok(result.duration >= 0);
  });

  it('should calculate aggregated statistics', async () => {
    const sql = `
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN type = 'THICKNESS' THEN 1 ELSE 0 END) as thickness_count,
        SUM(CASE WHEN type = 'DIAGNOSTICS' THEN 1 ELSE 0 END) as diagnostics_count
      FROM sessions
    `;

    const result = await analyticsService.executeQuery(sql);

    assert.strictEqual(result.rowCount, 1);
    assert.strictEqual(result.rows[0].total_sessions, 4);
    assert.strictEqual(result.rows[0].completed, 3);
    assert.strictEqual(result.rows[0].thickness_count, 2);
    assert.strictEqual(result.rows[0].diagnostics_count, 2);
  });

  it('should generate sessions report with grouping', async () => {
    const report = await analyticsService.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-17T00:00:00Z',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);
    
    // Проверить первый день (2025-01-15)
    const day1 = report.find((r) => r.period.includes('2025-01-15'));
    assert.ok(day1);
    assert.strictEqual(day1.totalSessions, 3);
    assert.strictEqual(day1.completedSessions, 3);
    assert.strictEqual(day1.byType.THICKNESS, 2);
    assert.strictEqual(day1.byType.DIAGNOSTICS, 1);
  });

  it('should generate revenue report with JOIN', async () => {
    const report = await analyticsService.getRevenueReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-17T00:00:00Z',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);

    // Проверить первый день (2025-01-15)
    const day1 = report.find((r) => r.period.includes('2025-01-15'));
    assert.ok(day1);
    assert.strictEqual(day1.totalRevenue, 1180); // 350 + 480 + 350
    assert.strictEqual(day1.byService.THICKNESS, 700); // 350 + 350
    assert.strictEqual(day1.byService.DIAGNOSTICS, 480);
    assert.strictEqual(day1.failedPayments, 0);
  });

  it('should handle empty results gracefully', async () => {
    const report = await analyticsService.getSessionsReport({
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-02T00:00:00Z',
      groupBy: 'day',
    });

    assert.strictEqual(report.length, 0);
  });

  it('should filter by session type', async () => {
    const report = await analyticsService.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-17T00:00:00Z',
      type: 'THICKNESS',
      groupBy: 'day',
    });

    const day1 = report.find((r) => r.period.includes('2025-01-15'));
    assert.ok(day1);
    assert.strictEqual(day1.byType.THICKNESS, 2);
    assert.strictEqual(day1.byType.DIAGNOSTICS, 0);
  });

  it('should group by week', async () => {
    const report = await analyticsService.getSessionsReport({
      startDate: '2025-01-13T00:00:00Z',
      endDate: '2025-01-20T00:00:00Z',
      groupBy: 'week',
    });

    assert.ok(report.length > 0);
    // Все сессии должны быть в одной неделе
    assert.strictEqual(report[0].totalSessions, 4);
  });
});
