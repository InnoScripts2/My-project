import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { obdConnectionManager } from '../../devices/obd/ObdConnectionManager.js';

// Ветвь BLE: поддерживаем только BLE-адаптер KINGBOLEN; поля serial/port игнорируются
const connectSchema = z.object({
  vehicleMake: z.string().min(1, 'Vehicle make is required'),
  model: z.string().optional(),
  mode: z.enum(['general', 'obd', 'hybrid']).optional(),
  // Ниже — устаревшие/неиспользуемые для BLE поля; принимаем, но игнорируем
  transport: z.enum(['serial', 'bluetooth', 'auto']).optional(),
  portPath: z.string().optional(),
  bluetoothAddress: z.string().optional(),
  // Параметры BLE подключения
  deviceName: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  canFdEnabled: z.boolean().optional(),
});

const clearDtcSchema = z.object({
  confirmation: z.boolean(),
});

export function createObdRoutes(): Router {
  const router = Router();

  router.get('/api/obd/status', async (_req: Request, res: Response) => {
    try {
      const snapshot = obdConnectionManager.getSnapshot();

      // Если подключено — пробуем прочитать быстрый статус MIL/DTC
      let mil: boolean | undefined;
      let dtcCount: number | undefined;
      if (snapshot.state === 'connected') {
        try {
          const status = await obdConnectionManager.withDriver((d) => d.readStatus());
          if (status.ok && status.data) {
            mil = status.data.mil;
            dtcCount = status.data.dtcCount;
          }
        } catch {
          // не падаем, статус остаётся базовым
        }
      }

      res.json({
        connected: snapshot.state === 'connected',
        adapter:
          snapshot.state === 'connected'
            ? snapshot.transport === 'bluetooth'
              ? `KINGBOLEN Ediag Plus (${snapshot.bluetoothName || 'Unknown'})`
              : 'ELM327'
            : null,
        protocol: snapshot.state === 'connected' ? snapshot.identity || null : null,
        mil,
        dtcCount,
        metrics: snapshot.metrics || null,
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

    const { vehicleMake, model, mode, deviceName, timeoutMs, canFdEnabled } = parsed.data;

    try {
      const driver = await obdConnectionManager.connect({
        force: true,
        deviceName: deviceName || 'KINGBOLEN',
        timeoutMs,
        canFdEnabled,
      });
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
        adapter:
          snapshot.transport === 'bluetooth'
            ? `KINGBOLEN Ediag Plus (${snapshot.bluetoothName || 'Unknown'})`
            : 'ELM327',
        protocol: snapshot.identity || 'Unknown',
        vehicleMake,
        model,
        mode,
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

      const result = await obdConnectionManager.withDriver((d) => d.readDTC());
      if (!result.ok) {
        res.status(500).json({
          error: 'dtc_read_failed',
          message: result.error || 'Unknown error',
        });
        return;
      }

      res.json({
        codes: result.data || [],
        timestamp: new Date().toISOString(),
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
          success: false,
          error: 'not_connected',
          message: 'OBD adapter not connected',
        });
        return;
      }

      const result = await obdConnectionManager.withDriver((d) => d.clearDTC());
      if (!result.ok) {
        res.status(500).json({
          success: false,
          error: 'clear_dtc_failed',
          message: result.error || 'Unknown error',
        });
        return;
      }

      res.json({
        success: !!result.data,
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

      const result = await obdConnectionManager.withDriver((d) => d.readLiveData());
      if (!result.ok || !result.data) {
        res.status(500).json({
          error: 'pids_read_failed',
          message: result.error || 'Unknown error',
        });
        return;
      }

      res.json({
        timestamp: new Date().toISOString(),
        data: result.data,
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

