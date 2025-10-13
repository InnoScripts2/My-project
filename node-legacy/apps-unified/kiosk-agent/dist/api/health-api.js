/**
 * Health check API endpoints
 * GET /health/live - Liveness probe
 * GET /health/ready - Readiness probe
 * GET /health/startup - Startup probe
 * GET /health/deep - Deep health check (admin only)
 */
/**
 * Liveness probe - is the process alive?
 */
export async function checkLive(req, res, healthMonitor) {
    try {
        const health = healthMonitor.checkLive();
        res.status(200).json(health);
    }
    catch (error) {
        console.error('[HealthAPI] Liveness check error:', error);
        res.status(503).json({
            status: 'fail',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}
/**
 * Readiness probe - can we serve traffic?
 */
export async function checkReady(req, res, healthMonitor, store, lockController) {
    try {
        const health = await healthMonitor.checkReady(store, lockController);
        const statusCode = health.status === 'pass' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        console.error('[HealthAPI] Readiness check error:', error);
        res.status(503).json({
            status: 'fail',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}
/**
 * Startup probe - is initialization complete?
 */
export async function checkStartup(req, res, healthMonitor, store, lockController) {
    try {
        const health = await healthMonitor.checkStartup(store, lockController);
        const statusCode = health.status === 'pass' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        console.error('[HealthAPI] Startup check error:', error);
        res.status(503).json({
            status: 'fail',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}
/**
 * Deep health check with synthetic tests (admin only)
 */
export async function checkDeep(req, res, healthMonitor, store, lockController) {
    try {
        const health = await healthMonitor.checkDeep(store, lockController);
        const statusCode = health.status === 'pass' ? 200 : (health.status === 'warn' ? 200 : 503);
        res.status(statusCode).json(health);
    }
    catch (error) {
        console.error('[HealthAPI] Deep health check error:', error);
        res.status(503).json({
            status: 'fail',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}
/**
 * Get health history (admin only)
 */
export async function getHealthHistory(req, res, healthMonitor) {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const history = healthMonitor.getHistory(limit);
        res.json({
            success: true,
            count: history.length,
            history
        });
    }
    catch (error) {
        console.error('[HealthAPI] Get health history error:', error);
        res.status(500).json({
            error: 'internal_error',
            message: error.message
        });
    }
}
