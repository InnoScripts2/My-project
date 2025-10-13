/**
 * REST API routes для аналитики
 */

import express, { Request, Response } from 'express';
import { AnalyticsService } from '../../analytics/AnalyticsService.js';
import { DashboardService } from '../../analytics/DashboardService.js';
import { ExportService } from '../../analytics/ExportService.js';

const router = express.Router();

// Сервисы инициализируются в главном модуле и передаются через app.locals
const getServices = (req: Request) => {
  return {
    analytics: req.app.locals.analyticsService as AnalyticsService,
    dashboard: req.app.locals.dashboardService as DashboardService,
    export: req.app.locals.exportService as ExportService,
  };
};

/**
 * GET /api/analytics/sessions
 * Получить отчёт по сессиям
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, type, status, groupBy } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { analytics } = getServices(req);
    const startTime = Date.now();

    const data = await analytics.getSessionsReport({
      startDate: startDate as string,
      endDate: endDate as string,
      type: type as 'THICKNESS' | 'DIAGNOSTICS' | undefined,
      status: status as 'completed' | 'incomplete' | undefined,
      groupBy: (groupBy as 'day' | 'week' | 'month') || 'day',
    });

    res.json({
      data,
      total: data.length,
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[Analytics API] Sessions report error:', error);
    res.status(500).json({
      error: 'Failed to generate sessions report',
      message: error.message,
    });
  }
});

/**
 * GET /api/analytics/revenue
 * Получить отчёт по выручке
 */
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { analytics } = getServices(req);
    const startTime = Date.now();

    const data = await analytics.getRevenueReport({
      startDate: startDate as string,
      endDate: endDate as string,
      groupBy: (groupBy as 'day' | 'week' | 'month' | 'service') || 'day',
    });

    res.json({
      data,
      total: data.length,
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[Analytics API] Revenue report error:', error);
    res.status(500).json({
      error: 'Failed to generate revenue report',
      message: error.message,
    });
  }
});

/**
 * GET /api/analytics/errors
 * Получить отчёт по ошибкам
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, device, severity, limit } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { analytics } = getServices(req);

    const data = await analytics.getErrorsReport({
      startDate: startDate as string,
      endDate: endDate as string,
      device: device as 'obd' | 'thickness' | undefined,
      severity: severity as 'high' | 'medium' | 'low' | undefined,
      limit: limit ? parseInt(limit as string) : 100,
    });

    res.json(data);
  } catch (error: any) {
    console.error('[Analytics API] Errors report error:', error);
    res.status(500).json({
      error: 'Failed to generate errors report',
      message: error.message,
    });
  }
});

/**
 * GET /api/analytics/dashboard/overview
 * Получить обзорный дашборд
 */
router.get('/dashboard/overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { dashboard } = getServices(req);

    const data = await dashboard.getOverviewDashboard({
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json(data);
  } catch (error: any) {
    console.error('[Analytics API] Overview dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate overview dashboard',
      message: error.message,
    });
  }
});

/**
 * GET /api/analytics/dashboard/service-performance
 * Получить дашборд производительности услуг
 */
router.get('/dashboard/service-performance', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { dashboard } = getServices(req);

    const data = await dashboard.getServicePerformanceDashboard({
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json(data);
  } catch (error: any) {
    console.error('[Analytics API] Service performance dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate service performance dashboard',
      message: error.message,
    });
  }
});

/**
 * GET /api/analytics/dashboard/financial
 * Получить финансовый дашборд
 */
router.get('/dashboard/financial', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const { dashboard } = getServices(req);

    const data = await dashboard.getFinancialDashboard({
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json(data);
  } catch (error: any) {
    console.error('[Analytics API] Financial dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate financial dashboard',
      message: error.message,
    });
  }
});

/**
 * POST /api/analytics/export
 * Экспорт результатов запроса
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const { query, format } = req.body;

    if (!query || !format) {
      return res.status(400).json({
        error: 'query and format are required',
      });
    }

    if (!['csv', 'json', 'xlsx'].includes(format)) {
      return res.status(400).json({
        error: 'format must be csv, json, or xlsx',
      });
    }

    const { analytics, export: exportService } = getServices(req);

    // Выполнить запрос
    const results = await analytics.executeQuery(query);

    // Сгенерировать имя файла
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `export-${timestamp}.${format}`;

    // Экспортировать
    let filePath: string;
    if (format === 'csv') {
      filePath = await exportService.exportToCsv(results, fileName);
    } else if (format === 'json') {
      filePath = await exportService.exportToJson(results, fileName);
    } else {
      filePath = await exportService.exportToExcel(results, fileName);
    }

    const stats = require('fs').statSync(filePath);

    res.json({
      filePath,
      rowCount: results.rowCount,
      size: stats.size,
    });
  } catch (error: any) {
    console.error('[Analytics API] Export error:', error);
    res.status(500).json({
      error: 'Failed to export data',
      message: error.message,
    });
  }
});

export default router;
