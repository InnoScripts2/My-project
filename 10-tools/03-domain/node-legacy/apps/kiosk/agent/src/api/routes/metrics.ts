/**
 * Metrics API route
 */

import { Router } from 'express';
import { getMetricsService } from '../services/metrics.js';

export function createMetricsRoute(): Router {
  const router = Router();
  const metricsService = getMetricsService();

  router.get('/metrics', async (req, res) => {
    try {
      const metrics = await metricsService.getMetrics();
      res.set('Content-Type', metricsService.getRegistry().contentType);
      res.send(metrics);
    } catch (error: any) {
      console.error('[Metrics] Error generating metrics:', error);
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  });

  return router;
}
