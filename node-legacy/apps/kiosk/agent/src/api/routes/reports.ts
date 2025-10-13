/**
 * Reports API routes
 */

import { Router } from 'express';
import type { ReportService } from '../services/reports.js';

export function createReportsRoutes(reportService: ReportService): Router {
  const router = Router();

  // Generate and send diagnostics report
  router.post('/reports/diagnostics', async (req, res) => {
    try {
      const { data, deliverTo } = req.body;

      if (!data || !data.sessionId) {
        return res.status(400).json({ error: 'Invalid report data' });
      }

      const result = await reportService.generateAndDeliverDiagnosticsReport(
        data,
        deliverTo
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('[Reports API] Diagnostics error:', error);
      res.status(500).json({ error: 'Failed to generate diagnostics report' });
    }
  });

  // Generate and send thickness report
  router.post('/reports/thickness', async (req, res) => {
    try {
      const { data, deliverTo } = req.body;

      if (!data || !data.sessionId) {
        return res.status(400).json({ error: 'Invalid report data' });
      }

      const result = await reportService.generateAndDeliverThicknessReport(
        data,
        deliverTo
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('[Reports API] Thickness error:', error);
      res.status(500).json({ error: 'Failed to generate thickness report' });
    }
  });

  // Get report by ID
  router.get('/reports/:id', (req, res) => {
    try {
      const report = reportService.getReport(req.params.id);

      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      res.json(report);
    } catch (error: any) {
      console.error('[Reports API] Get error:', error);
      res.status(500).json({ error: 'Failed to get report' });
    }
  });

  // List reports by session
  router.get('/reports/session/:sessionId', (req, res) => {
    try {
      const reports = reportService.listReportsBySession(req.params.sessionId);
      res.json({ reports, count: reports.length });
    } catch (error: any) {
      console.error('[Reports API] List error:', error);
      res.status(500).json({ error: 'Failed to list reports' });
    }
  });

  return router;
}
