import { Router, Request, Response } from 'express';
import { UptimeKumaClient } from '../UptimeKumaClient.js';
import { OpenStatusClient } from '../OpenStatusClient.js';
import { SLAManager } from '../SLAManager.js';
import { IncidentManager } from '../IncidentManager.js';
import { OnCallPlaybooks } from '../OnCallPlaybooks.js';
import { HealthCheckAggregator } from '../HealthCheckAggregator.js';
import { OperationsMetricsService } from '../metrics.js';

interface DatabaseAdapter {
  query(sql: string, params: any[]): Promise<any[]>;
  insert(table: string, data: any): Promise<any>;
  update(table: string, id: string, data: any): Promise<void>;
  findById(table: string, id: string): Promise<any>;
}

export function createOperationsRoutes(db: DatabaseAdapter, metricsService?: OperationsMetricsService): Router {
  const router = Router();

  const uptimeKumaClient = new UptimeKumaClient();
  const openStatusClient = new OpenStatusClient();
  const slaManager = new SLAManager(db);
  const incidentManager = new IncidentManager(db, openStatusClient, slaManager, metricsService);
  const onCallPlaybooks = new OnCallPlaybooks();
  const healthCheckAggregator = new HealthCheckAggregator();

  if (process.env.UPTIME_KUMA_URL && process.env.UPTIME_KUMA_TOKEN) {
    uptimeKumaClient.initClient(process.env.UPTIME_KUMA_URL, process.env.UPTIME_KUMA_TOKEN);
  }

  if (process.env.OPENSTATUS_API_URL && process.env.OPENSTATUS_API_KEY) {
    openStatusClient.initClient(process.env.OPENSTATUS_API_URL, process.env.OPENSTATUS_API_KEY);
  }

  router.get('/uptime/monitors', async (req: Request, res: Response) => {
    try {
      const monitors = await uptimeKumaClient.listMonitors();
      res.json(monitors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/uptime/monitors', async (req: Request, res: Response) => {
    try {
      const monitor = await uptimeKumaClient.createMonitor(req.body);
      res.status(201).json(monitor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/uptime/monitors/:id/status', async (req: Request, res: Response) => {
    try {
      const status = await uptimeKumaClient.getMonitorStatus(req.params.id);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sla/uptime', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }
      const report = await slaManager.calculateUptime(startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sla/mttr', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }
      const report = await slaManager.getMTTR(startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sla/report', async (req: Request, res: Response) => {
    try {
      const { month } = req.query;
      if (!month) {
        return res.status(400).json({ error: 'month parameter is required (YYYY-MM format)' });
      }
      const report = await slaManager.generateSLAReport(month as string);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/incidents', async (req: Request, res: Response) => {
    try {
      const incident = await incidentManager.createIncident(req.body);
      res.status(201).json(incident);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/incidents/:id', async (req: Request, res: Response) => {
    try {
      const incident = await incidentManager.updateIncident(req.params.id, req.body);
      res.json(incident);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/incidents/:id/resolve', async (req: Request, res: Response) => {
    try {
      const { resolution } = req.body;
      if (!resolution) {
        return res.status(400).json({ error: 'resolution is required' });
      }
      await incidentManager.resolveIncident(req.params.id, resolution);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/incidents', async (req: Request, res: Response) => {
    try {
      const { severity, status } = req.query;
      const filters: any = {};
      if (severity) filters.severity = severity;
      if (status) filters.status = status;
      const incidents = await incidentManager.getIncidents(filters);
      res.json(incidents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/playbooks', async (req: Request, res: Response) => {
    try {
      const playbooks = await onCallPlaybooks.listPlaybooks();
      const summary = playbooks.map((p) => ({
        name: p.name,
        title: p.title,
        estimatedTime: p.estimatedTime,
      }));
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/playbooks/:name', async (req: Request, res: Response) => {
    try {
      const playbook = await onCallPlaybooks.getPlaybook(req.params.name);
      if (!playbook) {
        return res.status(404).json({ error: 'Playbook not found' });
      }
      res.json(playbook);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/health/aggregated', async (req: Request, res: Response) => {
    try {
      const health = await healthCheckAggregator.getAggregatedHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/status-page/update', async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status || !['operational', 'degraded', 'outage'].includes(status)) {
        return res.status(400).json({ error: 'status must be operational, degraded, or outage' });
      }
      await openStatusClient.updatePageStatus(status);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
