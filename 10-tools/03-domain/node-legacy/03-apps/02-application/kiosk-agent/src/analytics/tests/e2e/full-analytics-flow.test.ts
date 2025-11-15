/**
 * E2E tests for full analytics flow
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { AnalyticsService } from '../../AnalyticsService.js';
import { DashboardService } from '../../DashboardService.js';
import { ExportService } from '../../ExportService.js';

describe('Full Analytics Flow E2E', () => {
  let analyticsService: AnalyticsService;
  let dashboardService: DashboardService;
  let exportService: ExportService;
  let sqliteDbPath: string;
  let exportsDir: string;

  before(async () => {
    // Создать тестовые директории
    sqliteDbPath = path.join('/tmp', 'test-e2e-source.db');
    exportsDir = path.join('/tmp', 'test-e2e-exports');

    if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(exportsDir, file));
      }
    } else {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Создать SQLite базу с полным набором данных
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

      CREATE TABLE reports (
        report_id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        type VARCHAR,
        generated_at TIMESTAMP,
        delivered BOOLEAN
      );

      CREATE TABLE obd_dtc (
        id INTEGER PRIMARY KEY,
        session_id VARCHAR,
        dtc_code VARCHAR,
        description VARCHAR,
        severity VARCHAR,
        occurred_at TIMESTAMP
      );

      CREATE TABLE thickness_measurements (
        id INTEGER PRIMARY KEY,
        session_id VARCHAR,
        zone VARCHAR,
        value DECIMAL,
        measured_at TIMESTAMP
      );
    `);

    // Вставить 10 сессий за день
    const sessions = [];
    const payments = [];
    const dtcCodes = [];
    const measurements = [];

    for (let i = 1; i <= 10; i++) {
      const sessionId = `s${i}`;
      const type = i <= 5 ? 'THICKNESS' : 'DIAGNOSTICS';
      const amount = type === 'THICKNESS' ? 350 : 480;
      const hour = 8 + i;

      sessions.push(
        `('${sessionId}', '2025-01-15 ${hour}:00:00', '2025-01-15 ${hour}:30:00', '${type}', 'completed', 'device1')`
      );

      payments.push(
        `('p${i}', '${sessionId}', ${amount}, 'confirmed', '2025-01-15 ${hour}:00:00', '2025-01-15 ${hour}:01:00')`
      );

      if (type === 'DIAGNOSTICS') {
        // Добавить DTC коды для диагностики
        dtcCodes.push(
          `(${i}, '${sessionId}', 'P0420', 'Catalyst System Efficiency', 'medium', '2025-01-15 ${hour}:00:00')`
        );
      }

      if (type === 'THICKNESS') {
        // Добавить измерения толщиномера
        for (let z = 1; z <= 5; z++) {
          measurements.push(
            `(${(i - 1) * 5 + z}, '${sessionId}', 'zone${z}', ${100 + Math.random() * 50}, '2025-01-15 ${hour}:0${z}:00')`
          );
        }
      }
    }

    sqliteDb.exec(`
      INSERT INTO sessions VALUES ${sessions.join(',')};
      INSERT INTO payments VALUES ${payments.join(',')};
      ${dtcCodes.length > 0 ? `INSERT INTO obd_dtc VALUES ${dtcCodes.join(',')};` : ''}
      ${measurements.length > 0 ? `INSERT INTO thickness_measurements VALUES ${measurements.join(',')};` : ''}
    `);

    sqliteDb.close();

    // Инициализировать сервисы
    analyticsService = new AnalyticsService();
    await analyticsService.initDatabase(':memory:');
    
    dashboardService = new DashboardService(analyticsService);
    exportService = new ExportService(exportsDir);

    // Загрузить данные
    await analyticsService.loadData([
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
      {
        name: 'obd_dtc',
        type: 'sqlite',
        path: sqliteDbPath,
        tableName: 'obd_dtc',
      },
      {
        name: 'thickness_measurements',
        type: 'sqlite',
        path: sqliteDbPath,
        tableName: 'thickness_measurements',
      },
    ]);
  });

  after(async () => {
    await analyticsService.close();
    
    if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(exportsDir, file));
      }
      fs.rmdirSync(exportsDir);
    }
  });

  it('should complete full analytics flow', async () => {
    // 1. Получить sessions report
    const sessionsReport = await analyticsService.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      groupBy: 'day',
    });

    assert.strictEqual(sessionsReport.length, 1);
    assert.strictEqual(sessionsReport[0].totalSessions, 10);
    assert.strictEqual(sessionsReport[0].byType.THICKNESS, 5);
    assert.strictEqual(sessionsReport[0].byType.DIAGNOSTICS, 5);

    // 2. Получить revenue report
    const revenueReport = await analyticsService.getRevenueReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      groupBy: 'day',
    });

    assert.strictEqual(revenueReport.length, 1);
    const expectedRevenue = 5 * 350 + 5 * 480; // 1750 + 2400 = 4150
    assert.strictEqual(revenueReport[0].totalRevenue, expectedRevenue);

    // 3. Получить overview dashboard
    const overview = await dashboardService.getOverviewDashboard({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
    });

    assert.strictEqual(overview.totalSessions, 10);
    assert.strictEqual(overview.totalRevenue, expectedRevenue);
    assert.ok(overview.trendsChart.length > 0);

    // 4. Получить service performance dashboard
    const servicePerf = await dashboardService.getServicePerformanceDashboard({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
    });

    assert.strictEqual(servicePerf.thickness.totalSessions, 5);
    assert.strictEqual(servicePerf.diagnostics.totalSessions, 5);
    assert.strictEqual(servicePerf.thickness.revenue, 1750);
    assert.strictEqual(servicePerf.diagnostics.revenue, 2400);

    // 5. Получить financial dashboard
    const financial = await dashboardService.getFinancialDashboard({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
    });

    assert.strictEqual(financial.totalRevenue, expectedRevenue);
    assert.strictEqual(financial.revenueByService.THICKNESS, 1750);
    assert.strictEqual(financial.revenueByService.DIAGNOSTICS, 2400);
    assert.strictEqual(financial.paymentSuccess.total, 10);
    assert.strictEqual(financial.paymentSuccess.confirmed, 10);
    assert.strictEqual(financial.paymentSuccess.failed, 0);
    assert.strictEqual(financial.paymentSuccess.rate, 100);

    // 6. Экспортировать в CSV
    const csvPath = await exportService.exportToCsv(
      {
        rows: sessionsReport,
        columns: Object.keys(sessionsReport[0]),
        rowCount: sessionsReport.length,
        duration: 0,
      },
      'sessions-report.csv'
    );

    assert.ok(fs.existsSync(csvPath));

    // 7. Экспортировать в JSON
    const jsonPath = await exportService.exportToJson(
      {
        rows: revenueReport,
        columns: Object.keys(revenueReport[0]),
        rowCount: revenueReport.length,
        duration: 0,
      },
      'revenue-report.json'
    );

    assert.ok(fs.existsSync(jsonPath));

    // 8. Экспортировать в Excel
    const xlsxPath = await exportService.exportToExcel(
      {
        rows: [overview],
        columns: ['totalSessions', 'totalRevenue', 'activeDevices'],
        rowCount: 1,
        duration: 0,
      },
      'overview-dashboard.xlsx'
    );

    assert.ok(fs.existsSync(xlsxPath));
  });

  it('should handle filtering and aggregation', async () => {
    // Фильтровать только THICKNESS сессии
    const thicknessReport = await analyticsService.getSessionsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      type: 'THICKNESS',
      groupBy: 'day',
    });

    assert.strictEqual(thicknessReport[0].byType.THICKNESS, 5);
    assert.strictEqual(thicknessReport[0].byType.DIAGNOSTICS, 0);

    // Получить топ ошибок
    const errorsReport = await analyticsService.getErrorsReport({
      startDate: '2025-01-15T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z',
      limit: 10,
    });

    assert.ok(errorsReport.topErrors.length > 0);
    assert.strictEqual(errorsReport.topErrors[0].code, 'P0420');
    assert.strictEqual(errorsReport.topErrors[0].count, 5);
  });
});
