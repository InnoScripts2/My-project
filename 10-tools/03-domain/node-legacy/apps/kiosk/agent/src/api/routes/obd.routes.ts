import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { obdConnectionManager } from '../../devices/obd/ObdConnectionManager.js';
import { ObdOrchestrator } from '../../devices/obd/orchestration/ObdOrchestrator.js';
import { ObdSessionError, ObdStateError } from '../../devices/obd/orchestration/errors.js';
import { FakeObdDevice } from '../../devices/obd/mocks/FakeObdDevice.js';
import type { DeviceObd } from '../../devices/obd/driver/DeviceObd.js';
import { join } from 'path';
import { rateLimiter } from '../middleware/rateLimiter.js';

const connectSchema = z.object({
  vehicleMake: z.string().min(1, 'Vehicle make is required'),
  model: z.string().optional(),
  mode: z.enum(['general', 'obd', 'hybrid']).optional(),
  transport: z.enum(['serial', 'bluetooth', 'auto']).optional(),
  portPath: z.string().optional(),
  bluetoothAddress: z.string().optional(),
});

const clearDtcSchema = z.object({
  confirm: z.boolean(),
});

const scanRequestSchema = z.object({
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
});

let orchestratorInstance: ObdOrchestrator | null = null;

export function getOrchestrator(): ObdOrchestrator {
  if (!orchestratorInstance) {
    // По умолчанию считаем DEV, если переменная окружения не задана
    const env = String(process.env.AGENT_ENV || 'DEV').toUpperCase();
    const isDev = env === 'DEV';
    const driver: DeviceObd = isDev
      ? (new FakeObdDevice({ scenario: 'DtcPresent' }) as any)
      : (obdConnectionManager as any);
    const configPath = join(process.cwd(), 'config', 'obd-orchestrator.json');
    orchestratorInstance = new ObdOrchestrator(driver, configPath);
  }
  return orchestratorInstance;
}

export function createObdRoutes(): Router {
  const router = Router();

  // Apply rate limiting to all POST routes
  router.use('/api/obd/*', (req, res, next) => {
    if (req.method === 'POST') {
      rateLimiter(req, res, next);
    } else {
      next();
    }
  });

  router.get('/api/obd/status', async (_req: Request, res: Response) => {
    try {
      const snapshot = obdConnectionManager.getSnapshot();

      const protocol = snapshot.state === 'connected' ? snapshot.identity || null : null;
      const vehicleInfo = null;

      res.json({
        connected: snapshot.state === 'connected',
        adapter: snapshot.state === 'connected' ?
          (snapshot.transport === 'bluetooth' ? `ELM327 Bluetooth (${snapshot.bluetoothName || 'Unknown'})` :
           snapshot.transport === 'serial' ? `ELM327 USB (${snapshot.portPath || 'Unknown'})` :
           'ELM327') : null,
        protocol,
        vehicle: vehicleInfo,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'status_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/obd/connect', async (req: Request, res: Response) => {
    const parsed = connectSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { vehicleMake, model, mode, transport, portPath, bluetoothAddress } = parsed.data;

    try {
      const options: any = {
        force: true,
        transport: transport || 'auto',
      };

      if (portPath) {
        options.portPath = portPath;
      }
      if (bluetoothAddress) {
        options.bluetoothAddress = bluetoothAddress;
      }

      const driver = await obdConnectionManager.connect(options);
      const snapshot = obdConnectionManager.getSnapshot();

      if (!driver) {
        res.status(503).json({
          success: false,
          error: 'obd_adapter_not_found',
          message: 'OBD adapter not found',
        });
        return;
      }

      res.json({
        success: true,
        adapter: snapshot.transport === 'bluetooth' ?
          `ELM327 Bluetooth (${snapshot.bluetoothName || 'Unknown'})` :
          `ELM327 USB (${snapshot.portPath || 'Unknown'})`,
        protocol: snapshot.identity || 'Unknown',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'obd_connect_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/obd/disconnect', async (_req: Request, res: Response) => {
    try {
      await obdConnectionManager.disconnect();

      res.json({
        success: true,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'disconnect_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.get('/api/obd/dtc', async (_req: Request, res: Response) => {
    try {
      const snapshot = obdConnectionManager.getSnapshot();

      if (snapshot.state !== 'connected') {
        res.status(503).json({
          error: 'not_connected',
          message: 'OBD adapter not connected',
        });
        return;
      }

      const codes: any[] = [];

      res.json({
        codes,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'dtc_read_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/obd/dtc/clear', async (req: Request, res: Response) => {
    const parsed = clearDtcSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { confirm } = parsed.data;

    if (confirm !== true) {
      res.status(400).json({
        error: 'confirmation_required',
        message: 'Confirmation must be true to clear DTC codes',
      });
      return;
    }

    try {
      const snapshot = obdConnectionManager.getSnapshot();

      if (snapshot.state !== 'connected') {
        res.status(503).json({
          error: 'not_connected',
          message: 'OBD adapter not connected',
        });
        return;
      }

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'clear_dtc_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.get('/api/obd/pids/live', async (_req: Request, res: Response) => {
    try {
      const snapshot = obdConnectionManager.getSnapshot();

      if (snapshot.state !== 'connected') {
        res.status(503).json({
          error: 'not_connected',
          message: 'OBD adapter not connected',
        });
        return;
      }

      const pids = [
        { name: 'Engine RPM', value: 0, unit: 'rpm' },
        { name: 'Vehicle Speed', value: 0, unit: 'km/h' },
        { name: 'Coolant Temperature', value: 0, unit: '°C' },
        { name: 'Engine Load', value: 0, unit: '%' },
        { name: 'Throttle Position', value: 0, unit: '%' },
        { name: 'Battery Voltage', value: 12.5, unit: 'V' },
      ];

      res.json({
        timestamp: new Date().toISOString(),
        pids,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'pids_read_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/obd/orchestrator/connect', async (_req: Request, res: Response) => {
    try {
      const orchestrator = getOrchestrator();
      await orchestrator.connect();

      res.json({
        status: 'connected',
      });
    } catch (error: any) {
      if (error instanceof ObdSessionError) {
        res.status(503).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'connection_failed',
          message: error?.message || String(error),
        });
      }
    }
  });

  router.post('/api/obd/orchestrator/scan', async (req: Request, res: Response) => {
    const parsed = scanRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const orchestrator = getOrchestrator();
      const sessionId = await orchestrator.startScan(parsed.data);

      res.status(202).json({
        sessionId,
        status: 'scanning',
      });
    } catch (error: any) {
      if (error instanceof ObdStateError) {
        res.status(400).json({
          error: error.code,
          message: error.message,
          currentState: error.currentState,
        });
      } else if (error instanceof ObdSessionError) {
        res.status(409).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'scan_failed',
          message: error?.message || String(error),
        });
      }
    }
  });

  router.get('/api/obd/orchestrator/status', async (_req: Request, res: Response) => {
    try {
      const orchestrator = getOrchestrator();
      const status = orchestrator.getStatus();

      res.json(status);
    } catch (error: any) {
      res.status(500).json({
        error: 'status_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.get('/api/obd/orchestrator/results/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const orchestrator = getOrchestrator();
      const session = orchestrator.getScanResults(sessionId);

      if (!session) {
        res.status(404).json({
          error: 'session_not_found',
          message: `Session ${sessionId} not found`,
        });
        return;
      }

      res.json({ session });
    } catch (error: any) {
      res.status(500).json({
        error: 'results_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/obd/orchestrator/clear-dtc', async (req: Request, res: Response) => {
    const parsed = clearDtcSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { confirm } = parsed.data;

    if (confirm !== true) {
      res.status(400).json({
        error: 'confirmation_required',
        message: 'Confirmation must be true to clear DTC codes',
      });
      return;
    }

    try {
      const orchestrator = getOrchestrator();
      const success = await orchestrator.clearDtc(confirm);

      res.json({
        success,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error instanceof ObdSessionError) {
        res.status(400).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      } else if (error instanceof ObdStateError) {
        res.status(400).json({
          error: error.code,
          message: error.message,
          currentState: error.currentState,
        });
      } else {
        res.status(500).json({
          error: 'clear_dtc_failed',
          message: error?.message || String(error),
        });
      }
    }
  });

  router.post('/api/obd/orchestrator/disconnect', async (_req: Request, res: Response) => {
    try {
      const orchestrator = getOrchestrator();
      await orchestrator.disconnect();

      res.json({
        status: 'disconnected',
      });
    } catch (error: any) {
      if (error instanceof ObdSessionError) {
        res.status(500).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'disconnect_failed',
          message: error?.message || String(error),
        });
      }
    }
  });

  return router;
}

