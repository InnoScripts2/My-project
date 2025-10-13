/**
 * HTTP API роуты для kiosk-agent
 *
 * Используется Express.js для стабильности и широкой поддержки middleware экосистемы.
 * Express выбран вместо Fastify по следующим причинам:
 * - Зрелая экосистема (morgan, helmet, cors уже используются)
 * - Стабильный API, лучше документирован
 * - Более простая интеграция с существующим кодом
 * - Достаточная производительность для локального агента
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import morgan from 'morgan';
import { Counter, Histogram, Registry } from 'prom-client';

interface ApiMetrics {
  requestsTotal: Counter<'method' | 'route' | 'status'>;
  requestDuration: Histogram<'method' | 'route'>;
}

let apiMetrics: ApiMetrics | null = null;

function initMetrics(registry?: Registry): ApiMetrics {
  if (apiMetrics) return apiMetrics;

  apiMetrics = {
    requestsTotal: new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: registry ? [registry] : undefined,
    }),
    requestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: registry ? [registry] : undefined,
    }),
  };

  return apiMetrics;
}

const obdScanRequestSchema = z.object({
  mode: z.enum(['general', 'obd-ii']),
});

const obdClearDtcSchema = z.object({
  confirmation: z.boolean().refine((val) => val === true, {
    message: 'Confirmation must be true to clear DTC codes',
  }),
});

const thicknessStartSchema = z.object({
  vehicleType: z.enum(['sedan', 'hatchback', 'minivan']),
});

const thicknessMeasureSchema = z.object({
  sessionId: z.string(),
  zone: z.string(),
  value: z.number().min(0),
});

const thicknessFinishSchema = z.object({
  sessionId: z.string(),
});

const paymentIntentSchema = z.object({
  amount: z.number().positive(),
  service: z.enum(['thickness', 'diagnostics']),
});

const lockOpenSchema = z.object({
  device: z.enum(['obd', 'thickness']),
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}

function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!apiMetrics) return next();

  const startTime = Date.now();
  const route = req.route?.path || req.path;

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    apiMetrics!.requestsTotal.labels(req.method, route, String(res.statusCode)).inc();
    apiMetrics!.requestDuration.labels(req.method, route).observe(duration);
  });

  next();
}

function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error('API Error:', err);

  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.AGENT_ENV === 'DEV' ? err.message : undefined,
  });
}

export function registerRoutes(app: Express, registry?: Registry): void {
  initMetrics(registry);

  app.use(morgan('combined'));

  app.use(metricsMiddleware);

  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'alive',
      version: process.env.APP_VERSION || '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/obd/status', asyncHandler(async (req: Request, res: Response) => {
    res.json({
      connected: false,
      protocol: null,
      vin: null,
      message: 'OBD adapter not connected',
    });
  }));

  app.post('/api/obd/scan', validateBody(obdScanRequestSchema), asyncHandler(async (req: Request, res: Response) => {
    const { mode } = req.body;
    const sessionId = `obd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      sessionId,
      mode,
      status: 'started',
      message: 'OBD scan initiated',
    });
  }));

  app.get('/api/obd/scan/:sessionId', asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    res.json({
      sessionId,
      status: 'completed',
      results: {
        dtcCodes: [],
        milStatus: 'OFF',
        readinessMonitors: [],
      },
      timestamp: new Date().toISOString(),
    });
  }));

  app.post('/api/obd/clear-dtc', validateBody(obdClearDtcSchema), asyncHandler(async (req: Request, res: Response) => {
    res.json({
      status: 'success',
      message: 'DTC codes cleared',
      timestamp: new Date().toISOString(),
    });
  }));

  app.get('/api/thickness/status', asyncHandler(async (req: Request, res: Response) => {
    res.json({
      connected: false,
      battery: null,
      message: 'Thickness gauge not connected',
    });
  }));

  app.post('/api/thickness/start', validateBody(thicknessStartSchema), asyncHandler(async (req: Request, res: Response) => {
    const { vehicleType } = req.body;
    const sessionId = `thickness-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      sessionId,
      vehicleType,
      status: 'started',
      expectedMeasurements: vehicleType === 'minivan' ? 60 : 40,
    });
  }));

  app.post('/api/thickness/measure', validateBody(thicknessMeasureSchema), asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, zone, value } = req.body;

    res.json({
      sessionId,
      zone,
      value,
      recorded: true,
      timestamp: new Date().toISOString(),
    });
  }));

  app.post('/api/thickness/finish', validateBody(thicknessFinishSchema), asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    res.json({
      sessionId,
      status: 'completed',
      timestamp: new Date().toISOString(),
    });
  }));

  app.post('/api/payment/intent', validateBody(paymentIntentSchema), asyncHandler(async (req: Request, res: Response) => {
    const { amount, service } = req.body;
    const intentId = `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      intentId,
      amount,
      service,
      status: 'pending',
      qrCode: `https://payment.example.com/qr/${intentId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }));

  app.get('/api/payment/status/:intentId', asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;

    res.json({
      intentId,
      status: 'pending',
      timestamp: new Date().toISOString(),
    });
  }));

  app.post('/api/payment/confirm-dev', asyncHandler(async (req: Request, res: Response) => {
    const isDevMode = process.env.AGENT_ENV === 'DEV';

    if (!isDevMode) {
      res.status(403).json({
        error: 'This endpoint is only available in DEV mode',
      });
      return;
    }

    const { intentId } = req.body;

    res.json({
      intentId,
      status: 'confirmed',
      message: 'DEV-only: Payment confirmed',
      timestamp: new Date().toISOString(),
    });
  }));

  app.get('/api/selfcheck', asyncHandler(async (req: Request, res: Response) => {
    const environment = process.env.AGENT_ENV || 'DEV';

    const obdResult = {
      overallStatus: environment === 'PROD' ? 'fail' : 'skipped',
      steps: [
        {
          name: 'adapter_connection',
          status: environment === 'PROD' ? 'failure' : 'skipped',
          duration: 0,
          details: { reason: environment === 'PROD' ? 'No adapter' : 'DEV mode' },
        },
      ],
      totalDuration: 0,
      timestamp: new Date().toISOString(),
      environment,
    };

    const thicknessResult = {
      overallStatus: environment === 'PROD' ? 'fail' : 'skipped',
      steps: [
        {
          name: 'ble_availability',
          status: environment === 'PROD' ? 'failure' : 'skipped',
          duration: 0,
          details: { reason: environment === 'PROD' ? 'No device' : 'DEV mode' },
        },
      ],
      totalDuration: 0,
      timestamp: new Date().toISOString(),
      environment,
    };

    res.json({
      obd: obdResult,
      thickness: thicknessResult,
    });
  }));

  app.post('/api/lock/open', validateBody(lockOpenSchema), asyncHandler(async (req: Request, res: Response) => {
    const { device } = req.body;

    res.json({
      device,
      status: 'opened',
      timestamp: new Date().toISOString(),
    });
  }));

  app.use(errorHandler);
}
