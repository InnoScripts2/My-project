/**
 * Analytics initialization and configuration
 */
import { AnalyticsService } from './AnalyticsService.js';
import { DashboardService } from './DashboardService.js';
import { ExportService } from './ExportService.js';
import { ScheduledAggregations } from './ScheduledAggregations.js';
export class AnalyticsModule {
    constructor(config) {
        this.config = {
            enabled: config.enabled ?? true,
            dbPath: config.dbPath ?? 'data/analytics.duckdb',
            aggregationCron: config.aggregationCron ?? '0 2 * * *',
            weeklyReportCron: config.weeklyReportCron ?? '0 3 * * 1',
            exportDir: config.exportDir ?? 'exports',
            aggregationsDir: config.aggregationsDir ?? 'data/aggregations',
            metricsRegistry: config.metricsRegistry ?? undefined,
        };
    }
    /**
     * Инициализация analytics модуля
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('[Analytics] Analytics module is disabled');
            return;
        }
        console.log('[Analytics] Initializing analytics module...');
        // Инициализировать AnalyticsService
        this.analyticsService = new AnalyticsService(this.config.metricsRegistry);
        await this.analyticsService.initDatabase(this.config.dbPath);
        // Инициализировать DashboardService
        this.dashboardService = new DashboardService(this.analyticsService);
        // Инициализировать ExportService
        this.exportService = new ExportService(this.config.exportDir, this.config.metricsRegistry);
        // Инициализировать ScheduledAggregations
        this.scheduledAggregations = new ScheduledAggregations(this.analyticsService, this.exportService, this.config.aggregationsDir);
        // Запланировать агрегации
        if (this.config.aggregationCron) {
            this.scheduledAggregations.scheduleDailyAggregation(this.config.aggregationCron);
        }
        if (this.config.weeklyReportCron) {
            this.scheduledAggregations.scheduleWeeklyReport(this.config.weeklyReportCron);
        }
        console.log('[Analytics] Analytics module initialized');
    }
    /**
     * Получить analytics service
     */
    getAnalyticsService() {
        return this.analyticsService;
    }
    /**
     * Получить dashboard service
     */
    getDashboardService() {
        return this.dashboardService;
    }
    /**
     * Получить export service
     */
    getExportService() {
        return this.exportService;
    }
    /**
     * Получить scheduled aggregations
     */
    getScheduledAggregations() {
        return this.scheduledAggregations;
    }
    /**
     * Остановить analytics модуль
     */
    async shutdown() {
        console.log('[Analytics] Shutting down analytics module...');
        if (this.scheduledAggregations) {
            this.scheduledAggregations.stop();
        }
        if (this.analyticsService) {
            await this.analyticsService.close();
        }
        console.log('[Analytics] Analytics module shutdown complete');
    }
}
/**
 * Создать и инициализировать analytics модуль
 */
export async function createAnalyticsModule(config) {
    const module = new AnalyticsModule(config);
    await module.initialize();
    return module;
}
