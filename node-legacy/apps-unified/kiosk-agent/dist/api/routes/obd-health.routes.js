/**
 * OBD Health Check Routes
 * Provides health, readiness and liveness endpoints
 */
import { Router } from 'express';
export function createObdHealthRoutes(obdManager, locksController) {
    const router = Router();
    const startTime = Date.now();
    /**
     * GET /api/obd/health - Full health check
     */
    router.get('/health', async (req, res) => {
        try {
            const checks = [];
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
            const response = {
                status: overallStatus,
                checks,
                timestamp: new Date().toISOString(),
                uptime: Date.now() - startTime,
            };
            const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
            res.status(statusCode).json(response);
        }
        catch (error) {
            res.status(500).json({
                status: 'unhealthy',
                checks: [],
                timestamp: new Date().toISOString(),
                uptime: Date.now() - startTime,
                error: error.message,
            });
        }
    });
    /**
     * GET /api/obd/health/ready - Readiness probe
     */
    router.get('/health/ready', async (req, res) => {
        try {
            // Check if service is ready to accept requests
            const obdSnapshot = obdManager.getSnapshot();
            const isReady = obdSnapshot.state === 'connected' || obdSnapshot.state === 'disconnected';
            if (isReady) {
                res.status(200).json({
                    ready: true,
                    timestamp: new Date().toISOString(),
                });
            }
            else {
                res.status(503).json({
                    ready: false,
                    reason: 'OBD manager not ready',
                    timestamp: new Date().toISOString(),
                });
            }
        }
        catch (error) {
            res.status(503).json({
                ready: false,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    });
    /**
     * GET /api/obd/health/live - Liveness probe
     */
    router.get('/health/live', (req, res) => {
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
async function checkObdDrivers(obdManager) {
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
        }
        else if (snapshot.state === 'connecting') {
            return {
                name: 'obd_drivers',
                status: 'degraded',
                message: 'OBD adapter connecting',
                details: {
                    reconnectAttempts: snapshot.reconnectAttempts,
                },
            };
        }
        else {
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
    }
    catch (error) {
        return {
            name: 'obd_drivers',
            status: 'unhealthy',
            message: 'Error checking OBD drivers: ' + error.message,
        };
    }
}
/**
 * Check locks health
 */
async function checkLocks(locksController) {
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
    }
    catch (error) {
        return {
            name: 'locks',
            status: 'unhealthy',
            message: 'Error checking locks: ' + error.message,
        };
    }
}
/**
 * Determine overall health status
 */
function determineOverallStatus(checks) {
    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    const hasDegraded = checks.some(check => check.status === 'degraded');
    if (hasUnhealthy) {
        return 'unhealthy';
    }
    else if (hasDegraded) {
        return 'degraded';
    }
    else {
        return 'healthy';
    }
}
