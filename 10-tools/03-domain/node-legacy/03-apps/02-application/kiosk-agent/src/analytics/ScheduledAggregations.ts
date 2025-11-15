/**
 * Scheduled Aggregations для автоматической агрегации данных
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { AnalyticsService } from './AnalyticsService.js';
import { ExportService } from './ExportService.js';
import { AggregationResult, ReportResult, DataSource } from './types.js';

export class ScheduledAggregations {
  private dailyTask?: cron.ScheduledTask;
  private weeklyTask?: cron.ScheduledTask;
  private aggregationsDir: string;

  constructor(
    private analyticsService: AnalyticsService,
    private exportService: ExportService,
    aggregationsDir?: string
  ) {
    this.aggregationsDir =
      aggregationsDir || path.join(process.cwd(), 'data', 'aggregations');

    // Создать директорию если не существует
    if (!fs.existsSync(this.aggregationsDir)) {
      fs.mkdirSync(this.aggregationsDir, { recursive: true });
    }
  }

  /**
   * Запланировать ежедневную агрегацию
   */
  scheduleDailyAggregation(cronExpression: string = '0 2 * * *'): void {
    if (this.dailyTask) {
      this.dailyTask.stop();
    }

    this.dailyTask = cron.schedule(cronExpression, async () => {
      try {
        const result = await this.runDailyAggregation();
        console.log('[ScheduledAggregations] Daily aggregation completed:', result);
      } catch (error) {
        console.error('[ScheduledAggregations] Daily aggregation failed:', error);
      }
    });

    console.log(
      `[ScheduledAggregations] Daily aggregation scheduled with cron: ${cronExpression}`
    );
  }

  /**
   * Запланировать еженедельный отчёт
   */
  scheduleWeeklyReport(cronExpression: string = '0 3 * * 1'): void {
    if (this.weeklyTask) {
      this.weeklyTask.stop();
    }

    this.weeklyTask = cron.schedule(cronExpression, async () => {
      try {
        const result = await this.runWeeklyReport();
        console.log('[ScheduledAggregations] Weekly report completed:', result);
      } catch (error) {
        console.error('[ScheduledAggregations] Weekly report failed:', error);
      }
    });

    console.log(
      `[ScheduledAggregations] Weekly report scheduled with cron: ${cronExpression}`
    );
  }

  /**
   * Выполнить ежедневную агрегацию
   */
  async runDailyAggregation(): Promise<AggregationResult> {
    const startTime = Date.now();

    // Определить дату вчерашнего дня
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const dateStr = yesterday.toISOString().split('T')[0];

    // Загрузить данные за вчера
    const sources: DataSource[] = [
      {
        name: 'sessions',
        type: 'sqlite',
        path: path.join(process.cwd(), 'data', 'sessions.db'),
        tableName: 'sessions',
      },
      {
        name: 'payments',
        type: 'sqlite',
        path: path.join(process.cwd(), 'data', 'sessions.db'),
        tableName: 'payments',
      },
      {
        name: 'reports',
        type: 'sqlite',
        path: path.join(process.cwd(), 'data', 'sessions.db'),
        tableName: 'reports',
      },
    ];

    await this.analyticsService.loadData(sources);

    // Выполнить агрегацию сессий
    const sessionsReport = await this.analyticsService.getSessionsReport({
      startDate: yesterday.toISOString(),
      endDate: today.toISOString(),
      groupBy: 'day',
    });

    // Выполнить агрегацию выручки
    const revenueReport = await this.analyticsService.getRevenueReport({
      startDate: yesterday.toISOString(),
      endDate: today.toISOString(),
      groupBy: 'day',
    });

    // Выполнить агрегацию ошибок
    const errorsReport = await this.analyticsService.getErrorsReport({
      startDate: yesterday.toISOString(),
      endDate: today.toISOString(),
      limit: 50,
    });

    // Сохранить результаты
    const aggregation = {
      date: dateStr,
      sessions: sessionsReport,
      revenue: revenueReport,
      errors: errorsReport,
      generatedAt: new Date().toISOString(),
    };

    const aggregationPath = path.join(
      this.aggregationsDir,
      `aggregation-${dateStr}.json`
    );
    fs.writeFileSync(aggregationPath, JSON.stringify(aggregation, null, 2));

    // Экспортировать в CSV
    const csvPath = path.join(this.aggregationsDir, `sessions-${dateStr}.csv`);
    await this.exportService.exportToCsv(
      {
        rows: sessionsReport,
        columns: Object.keys(sessionsReport[0] || {}),
        rowCount: sessionsReport.length,
        duration: 0,
      },
      csvPath
    );

    return {
      date: dateStr,
      sessionsProcessed: sessionsReport.reduce((sum, r) => sum + r.totalSessions, 0),
      revenueCalculated: revenueReport.reduce((sum, r) => sum + r.totalRevenue, 0),
      errorsAggregated: errorsReport.totalErrors,
      exportPath: csvPath,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Выполнить еженедельный отчёт
   */
  async runWeeklyReport(): Promise<ReportResult> {
    const startTime = Date.now();

    // Определить период последней недели
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Загрузить данные за неделю
    const sources: DataSource[] = [
      {
        name: 'sessions',
        type: 'sqlite',
        path: path.join(process.cwd(), 'data', 'sessions.db'),
        tableName: 'sessions',
      },
      {
        name: 'payments',
        type: 'sqlite',
        path: path.join(process.cwd(), 'data', 'sessions.db'),
        tableName: 'payments',
      },
    ];

    await this.analyticsService.loadData(sources);

    // Получить еженедельную статистику
    const sessionsReport = await this.analyticsService.getSessionsReport({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      groupBy: 'week',
    });

    const revenueReport = await this.analyticsService.getRevenueReport({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      groupBy: 'week',
    });

    // Создать отчёт
    const weeklyReport = {
      period: `${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`,
      sessions: sessionsReport,
      revenue: revenueReport,
      generatedAt: new Date().toISOString(),
    };

    const reportPath = path.join(
      this.aggregationsDir,
      `weekly-report-${startDate.toISOString().split('T')[0]}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(weeklyReport, null, 2));

    return {
      generated: new Date().toISOString(),
      type: 'weekly',
      emailsSent: 0, // Будет реализовано позже
      success: true,
    };
  }

  /**
   * Остановить все задачи
   */
  stop(): void {
    if (this.dailyTask) {
      this.dailyTask.stop();
    }
    if (this.weeklyTask) {
      this.weeklyTask.stop();
    }
  }
}
