/**
 * Dashboard Service для предоставления аналитических дашбордов
 */
export class DashboardService {
    constructor(analyticsService) {
        this.analyticsService = analyticsService;
    }
    /**
     * Получить обзорный дашборд
     */
    async getOverviewDashboard(filter) {
        // Параллельные запросы для различных метрик
        const [sessionsData, revenueData, errorsData, trendsData] = await Promise.all([
            this.getTotalSessions(filter),
            this.getTotalRevenue(filter),
            this.getTopErrors(filter),
            this.getTrendsData(filter),
        ]);
        return {
            totalSessions: sessionsData.total,
            totalRevenue: revenueData.total,
            activeDevices: await this.getActiveDevices(filter),
            avgSessionDuration: sessionsData.avgDuration,
            topErrors: errorsData,
            trendsChart: trendsData,
        };
    }
    /**
     * Получить дашборд производительности услуг
     */
    async getServicePerformanceDashboard(filter) {
        const [thicknessData, diagnosticsData] = await Promise.all([
            this.getServiceData(filter, 'THICKNESS'),
            this.getServiceData(filter, 'DIAGNOSTICS'),
        ]);
        return {
            thickness: {
                totalSessions: thicknessData.sessions,
                avgDuration: thicknessData.avgDuration,
                revenue: thicknessData.revenue,
                topMeasurements: await this.getTopMeasurements(filter),
            },
            diagnostics: {
                totalSessions: diagnosticsData.sessions,
                avgDuration: diagnosticsData.avgDuration,
                revenue: diagnosticsData.revenue,
                topDtcCodes: await this.getTopDtcCodes(filter),
            },
        };
    }
    /**
     * Получить финансовый дашборд
     */
    async getFinancialDashboard(filter) {
        const [revenueData, paymentStats, avgTransaction] = await Promise.all([
            this.getRevenueByService(filter),
            this.getPaymentStats(filter),
            this.getAvgTransactionValue(filter),
        ]);
        const previousPeriod = this.getPreviousPeriod(filter);
        const previousRevenue = await this.getTotalRevenue(previousPeriod);
        const currentRevenue = revenueData.THICKNESS + revenueData.DIAGNOSTICS;
        const revenueGrowth = previousRevenue.total > 0
            ? ((currentRevenue - previousRevenue.total) / previousRevenue.total) * 100
            : 0;
        return {
            totalRevenue: currentRevenue,
            revenueByService: revenueData,
            paymentSuccess: paymentStats,
            avgTransactionValue: avgTransaction,
            revenueGrowth,
        };
    }
    /**
     * Получить общее количество сессий
     */
    async getTotalSessions(filter) {
        const sql = `
      SELECT 
        COUNT(*) as total,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration
      FROM sessions
      WHERE created_at >= ? AND created_at <= ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return {
            total: result.rows[0]?.total || 0,
            avgDuration: result.rows[0]?.avg_duration || 0,
        };
    }
    /**
     * Получить общую выручку
     */
    async getTotalRevenue(filter) {
        const sql = `
      SELECT 
        SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END) as total
      FROM payments
      WHERE created_at >= ? AND created_at <= ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return {
            total: result.rows[0]?.total || 0,
        };
    }
    /**
     * Получить топ-5 ошибок
     */
    async getTopErrors(filter) {
        const sql = `
      SELECT 
        dtc_code as code,
        COUNT(*) as count
      FROM obd_dtc
      WHERE occurred_at >= ? AND occurred_at <= ?
      GROUP BY dtc_code
      ORDER BY count DESC
      LIMIT 5
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows;
    }
    /**
     * Получить данные трендов за последние 30 дней
     */
    async getTrendsData(filter) {
        const sql = `
      SELECT 
        DATE_TRUNC('day', s.created_at) as date,
        COUNT(DISTINCT s.session_id) as sessions,
        COALESCE(SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END), 0) as revenue
      FROM sessions s
      LEFT JOIN payments p ON s.session_id = p.session_id
      WHERE s.created_at >= ? AND s.created_at <= ?
      GROUP BY date
      ORDER BY date ASC
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows;
    }
    /**
     * Получить количество активных устройств
     */
    async getActiveDevices(filter) {
        const sql = `
      SELECT COUNT(DISTINCT device) as count
      FROM sessions
      WHERE created_at >= ? AND created_at <= ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows[0]?.count || 0;
    }
    /**
     * Получить данные по услуге
     */
    async getServiceData(filter, serviceType) {
        const sql = `
      SELECT 
        COUNT(DISTINCT s.session_id) as sessions,
        AVG(EXTRACT(EPOCH FROM (s.completed_at - s.created_at))) as avg_duration,
        COALESCE(SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END), 0) as revenue
      FROM sessions s
      LEFT JOIN payments p ON s.session_id = p.session_id
      WHERE s.created_at >= ? AND s.created_at <= ?
        AND s.type = ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
            serviceType,
        ]);
        return {
            sessions: result.rows[0]?.sessions || 0,
            avgDuration: result.rows[0]?.avg_duration || 0,
            revenue: result.rows[0]?.revenue || 0,
        };
    }
    /**
     * Получить топ измерений толщиномера
     */
    async getTopMeasurements(filter) {
        const sql = `
      SELECT 
        zone,
        COUNT(*) as count
      FROM thickness_measurements
      WHERE measured_at >= ? AND measured_at <= ?
      GROUP BY zone
      ORDER BY count DESC
      LIMIT 10
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows;
    }
    /**
     * Получить топ DTC кодов
     */
    async getTopDtcCodes(filter) {
        const sql = `
      SELECT 
        dtc_code as code,
        COUNT(*) as count
      FROM obd_dtc
      WHERE occurred_at >= ? AND occurred_at <= ?
      GROUP BY dtc_code
      ORDER BY count DESC
      LIMIT 10
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows;
    }
    /**
     * Получить выручку по услугам
     */
    async getRevenueByService(filter) {
        const sql = `
      SELECT 
        s.type,
        SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END) as revenue
      FROM sessions s
      LEFT JOIN payments p ON s.session_id = p.session_id
      WHERE s.created_at >= ? AND s.created_at <= ?
      GROUP BY s.type
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        const revenueMap = {
            THICKNESS: 0,
            DIAGNOSTICS: 0,
        };
        for (const row of result.rows) {
            if (row.type === 'THICKNESS' || row.type === 'DIAGNOSTICS') {
                revenueMap[row.type] = row.revenue || 0;
            }
        }
        return revenueMap;
    }
    /**
     * Получить статистику платежей
     */
    async getPaymentStats(filter) {
        const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM payments
      WHERE created_at >= ? AND created_at <= ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        const total = result.rows[0]?.total || 0;
        const confirmed = result.rows[0]?.confirmed || 0;
        const failed = result.rows[0]?.failed || 0;
        const rate = total > 0 ? (confirmed / total) * 100 : 0;
        return { total, confirmed, failed, rate };
    }
    /**
     * Получить среднее значение транзакции
     */
    async getAvgTransactionValue(filter) {
        const sql = `
      SELECT 
        AVG(CASE WHEN status = 'confirmed' THEN amount END) as avg_value
      FROM payments
      WHERE created_at >= ? AND created_at <= ?
    `;
        const result = await this.analyticsService.executeQuery(sql, [
            filter.startDate,
            filter.endDate,
        ]);
        return result.rows[0]?.avg_value || 0;
    }
    /**
     * Получить предыдущий период
     */
    getPreviousPeriod(filter) {
        const start = new Date(filter.startDate);
        const end = new Date(filter.endDate);
        const duration = end.getTime() - start.getTime();
        return {
            startDate: new Date(start.getTime() - duration).toISOString(),
            endDate: new Date(end.getTime() - duration).toISOString(),
        };
    }
}
