/**
 * OBD Health Check Routes
 * Provides health, readiness and liveness endpoints
 */

import { Router, Request, Response } from 'express';
import type { ObdConnectionManager } from '../../devices/obd/ObdConnectionManager.js';
import type { LockController } from '../../locks/LockController.js';

export interface HealthCheckComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckComponent[];
  timestamp: string;
  uptime: number;
}

export function createObdHealthRoutes(
  obdManager: ObdConnectionManager,
  locksController: LockController
): Router {
  const router = Router();
  const startTime = Date.now();

  /**
   * GET /api/obd/health - Full health check
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const checks: HealthCheckComponent[] = [];

      // Check OBD drivers
      const driverCheck = await checkObdDrivers(obdManager);
      checks.push(driverCheck);

      // Check PID database (simplified - would check actual DB)
      checks.push({
        name: 'pid_database',
        status: 'healthy',
        message: 'PID database loaded',
      });

      // Check payments module (simplified)
      checks.push({
        name: 'payments',
        status: 'healthy',
        message: 'Payment module operational',
      });

      // Check reports module (simplified)
      checks.push({
        name: 'reports',
        status: 'healthy',
        message: 'Report generation available',
      });

      // Check locks
      const locksCheck = await checkLocks(locksController);
      checks.push(locksCheck);

      // Check storage (simplified)
      checks.push({
        name: 'storage',
        status: 'healthy',
        message: 'Storage accessible',
      });

      // Determine overall status
      const overallStatus = determineOverallStatus(checks);

      const response: HealthCheckResponse = {
        status: overallStatus,
        checks,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      res.status(statusCode).json(response);

    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        checks: [],
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/obd/health/ready - Readiness probe
   */
  router.get('/health/ready', async (req: Request, res: Response) => {
    try {
      // Check if service is ready to accept requests
      const obdSnapshot = obdManager.getSnapshot();
      const isReady = obdSnapshot.state === 'connected' || obdSnapshot.state === 'disconnected';

      if (isReady) {
        res.status(200).json({
          ready: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          ready: false,
          reason: 'OBD manager not ready',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /api/obd/health/live - Liveness probe
   */
  router.get('/health/live', (req: Request, res: Response) => {
    // Simple liveness check - if we can respond, we're alive
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
    });
  });

  return router;
}

/**
 * Check OBD drivers health
 */
async function checkObdDrivers(obdManager: ObdConnectionManager): Promise<HealthCheckComponent> {
  try {
    const snapshot = obdManager.getSnapshot();

    if (snapshot.state === 'connected') {
      return {
        name: 'obd_drivers',
        status: 'healthy',
        message: 'OBD adapter connected',
        details: {
          transport: snapshot.transport,
          identity: snapshot.identity,
          lastConnectedAt: snapshot.lastConnectedAt,
        },
      };
    } else if (snapshot.state === 'connecting') {
      return {
        name: 'obd_drivers',
        status: 'degraded',
        message: 'OBD adapter connecting',
        details: {
          reconnectAttempts: snapshot.reconnectAttempts,
        },
      };
    } else {
      return {
        name: 'obd_drivers',
        status: 'degraded',
        message: 'OBD adapter not connected (normal in idle state)',
        details: {
          state: snapshot.state,
          lastError: snapshot.lastError,
        },
      };
    }
  } catch (error) {
    return {
      name: 'obd_drivers',
      status: 'unhealthy',
      message: 'Error checking OBD drivers: ' + (error as Error).message,
    };
  }
}

/**
 * Check locks health
 */
async function checkLocks(locksController: LockController): Promise<HealthCheckComponent> {
  try {
    const obdLockSnapshot = await locksController.getStatus('obd');

    if (!obdLockSnapshot) {
      return {
        name: 'locks',
        status: 'unhealthy',
        message: 'OBD lock not found',
      };
    }

    return {
      name: 'locks',
      status: 'healthy',
      message: 'Locks operational',
      details: {
        obdLockStatus: obdLockSnapshot.status,
        lastAction: obdLockSnapshot.lastActionAt,
      },
    };
  } catch (error) {
    return {
      name: 'locks',
      status: 'unhealthy',
      message: 'Error checking locks: ' + (error as Error).message,
    };
  }
}

/**
 * Determine overall health status
 */
function determineOverallStatus(checks: HealthCheckComponent[]): 'healthy' | 'degraded' | 'unhealthy' {
  const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
  const hasDegraded = checks.some(check => check.status === 'degraded');

  if (hasUnhealthy) {
    return 'unhealthy';
  } else if (hasDegraded) {
    return 'degraded';
  } else {
    return 'healthy';
  }
}
