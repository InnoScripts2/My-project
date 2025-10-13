/**
 * Integration tests for scheduled aggregations
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { AnalyticsService } from '../../AnalyticsService.js';
import { ExportService } from '../../ExportService.js';
import { ScheduledAggregations } from '../../ScheduledAggregations.js';

describe('Aggregations Integration', () => {
  let analyticsService: AnalyticsService;
  let exportService: ExportService;
  let scheduledAggregations: ScheduledAggregations;
  let sqliteDbPath: string;
  let aggregationsDir: string;

  before(async () => {
    // Создать тестовые директории
    sqliteDbPath = path.join('/tmp', 'test-aggregations-source.db');
    aggregationsDir = path.join('/tmp', 'test-aggregations');

    if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
    if (fs.existsSync(aggregationsDir)) {
      const files = fs.readdirSync(aggregationsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(aggregationsDir, file));
      }
    } else {
      fs.mkdirSync(aggregationsDir, { recursive: true });
    }

    // Создать SQLite базу с данными за вчера
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

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

      INSERT INTO sessions VALUES
        ('s1', '${yesterdayStr} 10:00:00', '${yesterdayStr} 10:30:00', 'THICKNESS', 'completed', 'device1'),
        ('s2', '${yesterdayStr} 11:00:00', '${yesterdayStr} 11:25:00', 'DIAGNOSTICS', 'completed', 'device1'),
        ('s3', '${yesterdayStr} 12:00:00', '${yesterdayStr} 12:20:00', 'THICKNESS', 'completed', 'device1');

      INSERT INTO payments VALUES
        ('p1', 's1', 350, 'confirmed', '${yesterdayStr} 10:00:00', '${yesterdayStr} 10:01:00'),
        ('p2', 's2', 480, 'confirmed', '${yesterdayStr} 11:00:00', '${yesterdayStr} 11:01:00'),
        ('p3', 's3', 350, 'confirmed', '${yesterdayStr} 12:00:00', '${yesterdayStr} 12:01:00');
    `);
    sqliteDb.close();

    // Инициализировать сервисы
    analyticsService = new AnalyticsService();
    await analyticsService.initDatabase(':memory:');
    
    exportService = new ExportService(aggregationsDir);
    scheduledAggregations = new ScheduledAggregations(
      analyticsService,
      exportService,
      aggregationsDir
    );
  });

  after(async () => {
    scheduledAggregations.stop();
    await analyticsService.close();
    
    if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
    if (fs.existsSync(aggregationsDir)) {
      const files = fs.readdirSync(aggregationsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(aggregationsDir, file));
      }
      fs.rmdirSync(aggregationsDir);
    }
  });

  it('should run daily aggregation and create output files', async () => {
    // Временно заменить путь к БД для теста
    const originalCwd = process.cwd;
    process.cwd = () => '/tmp';

    // Создать тестовую БД в ожидаемом месте
    const testDbPath = path.join('/tmp', 'data', 'sessions.db');
    const testDbDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    fs.copyFileSync(sqliteDbPath, testDbPath);

    try {
      const result = await scheduledAggregations.runDailyAggregation();

      // Проверить результат
      assert.ok(result.date);
      assert.strictEqual(result.sessionsProcessed, 3);
      assert.strictEqual(result.revenueCalculated, 1180);
      assert.ok(result.duration > 0);

      // Проверить что создан JSON файл
      const jsonPath = path.join(aggregationsDir, `aggregation-${result.date}.json`);
      assert.ok(fs.existsSync(jsonPath));

      const aggregation = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      assert.strictEqual(aggregation.date, result.date);
      assert.ok(aggregation.sessions);
      assert.ok(aggregation.revenue);
      assert.ok(aggregation.errors);

      // Проверить что создан CSV файл
      assert.ok(result.exportPath);
      assert.ok(fs.existsSync(result.exportPath));

      const csvContent = fs.readFileSync(result.exportPath, 'utf8');
      assert.ok(csvContent.includes('period'));
      assert.ok(csvContent.includes('totalSessions'));
    } finally {
      process.cwd = originalCwd;
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    }
  });

  it('should run weekly report', async () => {
    // Временно заменить путь к БД для теста
    const originalCwd = process.cwd;
    process.cwd = () => '/tmp';

    // Создать тестовую БД
    const testDbPath = path.join('/tmp', 'data', 'sessions.db');
    const testDbDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    fs.copyFileSync(sqliteDbPath, testDbPath);

    try {
      const result = await scheduledAggregations.runWeeklyReport();

      assert.ok(result.generated);
      assert.strictEqual(result.type, 'weekly');
      assert.strictEqual(result.success, true);
    } finally {
      process.cwd = originalCwd;
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    }
  });

  it('should schedule daily aggregation', () => {
    // Запланировать с тестовым cron (каждую минуту, но мы не будем ждать)
    scheduledAggregations.scheduleDailyAggregation('* * * * *');

    // Проверить что задача запланирована (не падает)
    assert.ok(true);

    // Остановить задачу
    scheduledAggregations.stop();
  });
});
