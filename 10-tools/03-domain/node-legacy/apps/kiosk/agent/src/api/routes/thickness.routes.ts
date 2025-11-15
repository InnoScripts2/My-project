import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ThicknessDriver } from '../../devices/thickness/driver/ThicknessDriver.js';
import { sedanZones, minivanZones } from '../../devices/thickness/database/zones.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import type {
  ThicknessConnectRequest,
  ThicknessConnectResponse,
  ThicknessStatusResponse,
  ThicknessStartMeasuringResponse,
  ThicknessMeasurementsResponse,
  ThicknessHealthResponse,
} from '../../types/api.js';

const connectSchema = z.object({
  deviceName: z.string().optional(),
  deviceAddress: z.string().optional(),
  vehicleType: z.enum(['sedan', 'minivan']),
});

let driverInstance: ThicknessDriver | null = null;

function getDriver(): ThicknessDriver {
  if (!driverInstance) {
    driverInstance = new ThicknessDriver();
  }
  return driverInstance;
}

export function createThicknessRoutes(): Router {
  const router = Router();

  // Apply rate limiting to all POST routes
  router.use('/api/thickness/*', (req, res, next) => {
    if (req.method === 'POST') {
      rateLimiter(req, res, next);
    } else {
      next();
    }
  });

  /**
   * GET /api/thickness/status
   * Получить статус толщиномера
   */
  router.get('/api/thickness/status', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      const state = driver.getThicknessState();
      const measurements = driver.getMeasurements();
      const health = driver.getHealthStatus();

      const response: ThicknessStatusResponse = {
        connected: health.connected,
        device: health.connected ? 'TH_Sensor' : null,
        state,
        measuredZones: measurements.length,
        totalZones: 40, // По умолчанию
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        error: 'status_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * POST /api/thickness/connect
   * Подключиться к толщиномеру
   */
  router.post('/api/thickness/connect', async (req: Request, res: Response) => {
    const parsed = connectSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { deviceName, deviceAddress, vehicleType } = parsed.data;

    try {
      const driver = getDriver();
      const totalZones = vehicleType === 'sedan' ? 40 : 60;

      await driver.init({
        deviceName,
        deviceAddress,
        totalZones,
        connectionTimeout: 10000,
        measurementTimeout: 300000,
      });

      const response: ThicknessConnectResponse = {
        success: true,
        device: deviceName || 'TH_Sensor',
        totalZones,
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'connection_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * POST /api/thickness/disconnect
   * Отключиться от толщиномера
   */
  router.post('/api/thickness/disconnect', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      await driver.disconnect();

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

  /**
   * POST /api/thickness/start
   * Начать измерения
   */
  router.post('/api/thickness/start', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      await driver.startMeasuring();

      const response: ThicknessStartMeasuringResponse = {
        success: true,
        status: 'measuring',
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'start_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * POST /api/thickness/stop
   * Остановить измерения
   */
  router.post('/api/thickness/stop', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      await driver.stopMeasuring();

      res.json({
        success: true,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'stop_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * GET /api/thickness/measurements
   * Получить все измерения
   */
  router.get('/api/thickness/measurements', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      const measurements = driver.getMeasurements();

      // Анализ измерений
      let normal = 0;
      let suspicious = 0;
      let repainted = 0;

      for (const measurement of measurements) {
        const zone = sedanZones.getZone(measurement.zoneId) || minivanZones.getZone(measurement.zoneId);
        if (!zone) continue;

        const deviation = Math.abs(measurement.value - zone.standardThickness.typical);
        if (deviation <= 30) {
          normal++;
        } else if (deviation <= 80) {
          suspicious++;
        } else {
          repainted++;
        }
      }

      const response: ThicknessMeasurementsResponse = {
        measurements,
        summary: {
          total: measurements.length,
          normal,
          suspicious,
          repainted,
        },
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        error: 'measurements_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * GET /api/thickness/health
   * Получить health status толщиномера
   */
  router.get('/api/thickness/health', async (_req: Request, res: Response) => {
    try {
      const driver = getDriver();
      const health = driver.getHealthStatus();
      const measurements = driver.getMeasurements();

      const totalZones = 40; // TODO: получать из конфигурации
      const percentage = totalZones > 0 ? (measurements.length / totalZones) * 100 : 0;

      const response: ThicknessHealthResponse = {
        connected: health.connected,
        state: driver.getState(),
        lastConnected: health.lastConnected?.toISOString(),
        lastError: health.lastError,
        progress: {
          measuredZones: measurements.length,
          totalZones,
          percentage: Math.round(percentage),
        },
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        error: 'health_check_failed',
        message: error?.message || String(error),
      });
    }
  });

  /**
   * GET /api/thickness/zones
   * Получить информацию о зонах
   */
  router.get('/api/thickness/zones', async (req: Request, res: Response) => {
    try {
      const vehicleType = (req.query.vehicleType as string) || 'sedan';
      const zones = vehicleType === 'sedan' ? sedanZones.getAllZones() : minivanZones.getAllZones();

      res.json({
        zones,
        count: zones.length,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'zones_failed',
        message: error?.message || String(error),
      });
    }
  });

  return router;
}
