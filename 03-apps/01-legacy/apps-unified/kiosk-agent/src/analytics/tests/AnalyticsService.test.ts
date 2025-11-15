/**
 * Unit tests for AnalyticsService
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'node:os';
import { AnalyticsService } from '../AnalyticsService.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const tempRoot = path.join(os.tmpdir(), 'kiosk-agent-tests', 'analytics');
  let testDbPath: string;

  before(async () => {
    fs.mkdirSync(tempRoot, { recursive: true });
    testDbPath = path.join(tempRoot, 'test-analytics.duckdb');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    service = new AnalyticsService();
    await service.initDatabase(testDbPath);
  });

  after(async () => {
    await service.close();
    if (testDbPath && fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should initialize database and create schema', async () => {
    // Проверить что можно выполнить запрос
    const result = await service.executeQuery('SELECT 1 as test');
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].test, 1);
  });

  it('should execute query and return results', async () => {
    // Вставить тестовые данные
    await service.executeQuery(
      `INSERT INTO sessions VALUES ('s1', '2025-01-15 10:00:00', '2025-01-15 10:30:00', 'THICKNESS', 'completed', 'device1')`
    );

    // Выполнить запрос
    const result = await service.executeQuery('SELECT * FROM sessions');
    
    assert.strictEqual(result.rowCount, 1);
    assert.strictEqual(result.rows[0].session_id, 's1');
    assert.strictEqual(result.rows[0].type, 'THICKNESS');
  });

  it('should get sessions report with filtering', async () => {
    // Вставить больше тестовых данных
    await service.executeQuery(
      `INSERT INTO sessions VALUES 
        ('s2', '2025-01-15 11:00:00', '2025-01-15 11:20:00', 'DIAGNOSTICS', 'completed', 'device1'),
        ('s3', '2025-01-15 12:00:00', NULL, 'THICKNESS', 'incomplete', 'device1')`
    );

    // Получить отчёт
    const report = await service.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);
    assert.ok(report[0].totalSessions >= 3);
  });

  it('should get revenue report', async () => {
    // Вставить платежи
    await service.executeQuery(
      `INSERT INTO payments VALUES 
        ('p1', 's1', 350, 'confirmed', '2025-01-15 10:00:00', '2025-01-15 10:01:00'),
        ('p2', 's2', 480, 'confirmed', '2025-01-15 11:00:00', '2025-01-15 11:01:00'),
        ('p3', 's3', 350, 'failed', '2025-01-15 12:00:00', NULL)`
    );

    // Получить отчёт по выручке
    const report = await service.getRevenueReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);
    assert.strictEqual(report[0].totalRevenue, 830);
    assert.strictEqual(report[0].failedPayments, 1);
  });

  it('should get errors report', async () => {
    // Вставить ошибки OBD
    await service.executeQuery(
      `INSERT INTO obd_dtc VALUES 
        (1, 's2', 'P0420', 'Catalyst System Efficiency Below Threshold', 'medium', '2025-01-15 11:00:00'),
        (2, 's2', 'P0171', 'System Too Lean (Bank 1)', 'high', '2025-01-15 11:00:00')`
    );

    // Получить отчёт по ошибкам
    const report = await service.getErrorsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      limit: 10,
    });

    assert.ok(report.topErrors.length > 0);
    assert.strictEqual(report.totalErrors, 2);
  });

  it('should filter sessions by type', async () => {
    const report = await service.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      type: 'THICKNESS',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);
    // Все сессии должны быть THICKNESS
    const totalThickness = report.reduce((sum, r) => sum + r.byType.THICKNESS, 0);
    const totalDiagnostics = report.reduce((sum, r) => sum + r.byType.DIAGNOSTICS, 0);
    assert.ok(totalThickness > 0);
    assert.strictEqual(totalDiagnostics, 0);
  });

  it('should filter sessions by status', async () => {
    const report = await service.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      status: 'completed',
      groupBy: 'day',
    });

    assert.ok(report.length > 0);
    // Все incomplete должны быть 0
    const totalIncomplete = report.reduce((sum, r) => sum + r.incompleteSessions, 0);
    assert.strictEqual(totalIncomplete, 0);
  });
});
