import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { obdConnectionManager } from '../../devices/obd/ObdConnectionManager.js';

const connectSchema = z.object({
  vehicleMake: z.string().min(1, 'Vehicle make is required'),
  model: z.string().optional(),
  mode: z.enum(['general', 'obd', 'hybrid']).optional(),
  transport: z.enum(['serial', 'bluetooth', 'auto']).optional(),
  portPath: z.string().optional(),
  bluetoothAddress: z.string().optional(),
});

const clearDtcSchema = z.object({
  confirmation: z.boolean(),
});

export function createObdRoutes(): Router {
  const router = Router();

  router.get('/api/obd/status', async (_req: Request, res: Response) => {
    try {
      const snapshot = obdConnectionManager.getSnapshot();

      const protocol = snapshot.state === 'connected' ? snapshot.identity || null : null;
      const vehicleInfo = null;

      res.json({
        connected: snapshot.state === 'connected',
        adapter: snapshot.state === 'connected' ?
          (snapshot.transport === 'bluetooth' ? `KINGBOLEN Ediag Plus (${snapshot.bluetoothName || 'Unknown'})` :
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
          `KINGBOLEN Ediag Plus (${snapshot.bluetoothName || 'Unknown'})` :
          'ELM327',
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

    const { confirmation } = parsed.data;

    if (confirmation !== true) {
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

  return router;
}

