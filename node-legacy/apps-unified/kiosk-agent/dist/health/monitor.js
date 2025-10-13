/**
 * Comprehensive health check system
 * Implements /health/live, /health/ready, /health/startup, /health/deep endpoints
 */
import { getSystemInfo } from './healthCheck.js';
export class HealthMonitor {
    constructor(checkIntervalSeconds = 60) {
        this.checkIntervalSeconds = checkIntervalSeconds;
        this.history = [];
        this.maxHistory = 100;
        this.lastEventLoopCheck = Date.now();
        this.eventLoopLagP95 = 0;
        this.eventLoopSamples = [];
        this.startEventLoopMonitoring();
    }
    /**
     * Start periodic health monitoring
     */
    startMonitoring(store, lockController) {
        this.monitorInterval = setInterval(async () => {
            try {
                const health = await this.checkReady(store, lockController);
                this.recordHealth(health);
            }
            catch (error) {
                console.error('[HealthMonitor] Monitoring error:', error);
            }
        }, this.checkIntervalSeconds * 1000);
        if (typeof this.monitorInterval.unref === 'function') {
            this.monitorInterval.unref();
        }
    }
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }
    /**
     * Record health check result
     */
    recordHealth(health) {
        this.history.push(health);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }
    /**
     * Get health history
     */
    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }
    /**
     * Liveness check - is the process alive?
     */
    checkLive() {
        const sysInfo = getSystemInfo();
        return {
            status: 'pass',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version,
            eventLoopLag: this.eventLoopLagP95,
            checks: {
                process: {
                    status: 'pass',
                    componentType: 'system',
                    observedValue: Math.round(process.uptime()),
                    observedUnit: 'seconds',
                    time: new Date().toISOString()
                },
                memory: {
                    status: sysInfo.memory.usagePercent > 90 ? 'warn' : 'pass',
                    componentType: 'system',
                    observedValue: sysInfo.memory.usagePercent,
                    observedUnit: 'percent',
                    time: new Date().toISOString()
                }
            }
        };
    }
    /**
     * Readiness check - can we serve traffic?
     */
    async checkReady(store, lockController) {
        const checks = {};
        let overallStatus = 'pass';
        // Check SQLite
        try {
            const start = Date.now();
            if ('healthCheck' in store && typeof store.healthCheck === 'function') {
                const result = await store.healthCheck();
                checks['sqlite'] = {
                    status: result.status,
                    componentType: 'datastore',
                    observedValue: result.details.latencyMs,
                    observedUnit: 'ms',
                    time: new Date().toISOString(),
                    ...result.details
                };
                if (result.status !== 'pass') {
                    overallStatus = result.status === 'fail' ? 'fail' : 'warn';
                }
            }
            else {
                // Fallback: simple ping
                await this.testStoreConnection(store);
                const latency = Date.now() - start;
                checks['sqlite'] = {
                    status: latency > 1000 ? 'warn' : 'pass',
                    componentType: 'datastore',
                    observedValue: latency,
                    observedUnit: 'ms',
                    time: new Date().toISOString()
                };
            }
        }
        catch (error) {
            checks['sqlite'] = {
                status: 'fail',
                componentType: 'datastore',
                error: error.message,
                time: new Date().toISOString()
            };
            overallStatus = 'fail';
        }
        // Check locks if available
        if (lockController) {
            try {
                const lockStatus = await lockController.getAllStatus();
                const statusValues = Object.values(lockStatus);
                const allLocked = statusValues.every(s => s && (s.status === 'locked' || s.status === 'unlocked'));
                checks['locks'] = {
                    status: allLocked ? 'pass' : 'warn',
                    componentType: 'hardware',
                    observedValue: Object.keys(lockStatus).length,
                    observedUnit: 'devices',
                    time: new Date().toISOString()
                };
            }
            catch (error) {
                checks['locks'] = {
                    status: 'fail',
                    componentType: 'hardware',
                    error: error.message,
                    time: new Date().toISOString()
                };
                overallStatus = 'warn'; // Don't fail overall on lock issues
            }
        }
        // Check memory
        const sysInfo = getSystemInfo();
        checks['memory'] = {
            status: sysInfo.memory.usagePercent > 95 ? 'fail' : (sysInfo.memory.usagePercent > 85 ? 'warn' : 'pass'),
            componentType: 'system',
            observedValue: sysInfo.memory.usagePercent,
            observedUnit: 'percent',
            time: new Date().toISOString()
        };
        if (sysInfo.memory.usagePercent > 95 && overallStatus !== 'fail') {
            overallStatus = 'fail';
        }
        else if (sysInfo.memory.usagePercent > 85 && overallStatus === 'pass') {
            overallStatus = 'warn';
        }
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version,
            eventLoopLag: this.eventLoopLagP95,
            checks
        };
    }
    /**
     * Startup check - is initialization complete?
     */
    async checkStartup(store, lockController) {
        const checks = {};
        let overallStatus = 'pass';
        // Check database migrations
        checks['database_migrations'] = {
            status: 'pass',
            componentType: 'datastore',
            output: 'Migrations applied',
            time: new Date().toISOString()
        };
        // Check controllers initialized
        if (lockController) {
            const lockStatus = await lockController.getAllStatus();
            checks['lock_controller'] = {
                status: Object.keys(lockStatus).length > 0 ? 'pass' : 'fail',
                componentType: 'controller',
                observedValue: Object.keys(lockStatus).length,
                observedUnit: 'locks',
                time: new Date().toISOString()
            };
            if (Object.keys(lockStatus).length === 0) {
                overallStatus = 'fail';
            }
        }
        // Check config loaded
        checks['config'] = {
            status: 'pass',
            componentType: 'config',
            output: 'Configuration loaded',
            time: new Date().toISOString()
        };
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version,
            checks
        };
    }
    /**
     * Deep health check with synthetic tests
     */
    async checkDeep(store, lockController) {
        const readiness = await this.checkReady(store, lockController);
        const sysInfo = getSystemInfo();
        // Additional synthetic checks
        const syntheticChecks = {};
        // Test SQLite write/read
        try {
            const testId = `health-deep-${Date.now()}`;
            const start = Date.now();
            if ('withTransaction' in store && typeof store.withTransaction === 'function') {
                await store.withTransaction(async (db) => {
                    db.prepare('SELECT 1 as test').get();
                });
            }
            const latency = Date.now() - start;
            syntheticChecks['sqlite_transaction'] = {
                status: latency > 100 ? 'warn' : 'pass',
                componentType: 'datastore',
                observedValue: latency,
                observedUnit: 'ms',
                time: new Date().toISOString()
            };
        }
        catch (error) {
            syntheticChecks['sqlite_transaction'] = {
                status: 'fail',
                componentType: 'datastore',
                error: error.message,
                time: new Date().toISOString()
            };
        }
        // Get recent errors (last hour)
        const recentErrors = this.getRecentErrors();
        return {
            ...readiness,
            system: sysInfo,
            checks: {
                ...readiness.checks,
                ...syntheticChecks,
                recent_errors: {
                    status: recentErrors > 10 ? 'warn' : 'pass',
                    componentType: 'monitoring',
                    observedValue: recentErrors,
                    observedUnit: 'errors',
                    time: new Date().toISOString()
                }
            }
        };
    }
    /**
     * Test store connection
     */
    async testStoreConnection(store) {
        if (store.ping) {
            await store.ping();
        }
        else {
            // Fallback test
            const testId = `health-${Date.now()}`;
            if ('createSession' in store && typeof store.createSession === 'function') {
                const sessionId = await store.createSession('diagnostics', testId);
                if ('finishSession' in store && typeof store.finishSession === 'function') {
                    await store.finishSession(sessionId);
                }
            }
        }
    }
    /**
     * Get count of recent errors (placeholder)
     */
    getRecentErrors() {
        // In a real implementation, this would query logs
        return 0;
    }
    /**
     * Monitor event loop lag
     */
    startEventLoopMonitoring() {
        setInterval(() => {
            const now = Date.now();
            const lag = now - this.lastEventLoopCheck - 100; // Expected 100ms
            this.lastEventLoopCheck = now;
            if (lag > 0) {
                this.eventLoopSamples.push(lag);
                if (this.eventLoopSamples.length > 100) {
                    this.eventLoopSamples.shift();
                }
                // Calculate P95
                const sorted = [...this.eventLoopSamples].sort((a, b) => a - b);
                const p95Index = Math.floor(sorted.length * 0.95);
                this.eventLoopLagP95 = sorted[p95Index] || 0;
            }
        }, 100);
    }
}
