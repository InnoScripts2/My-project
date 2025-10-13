/**
 * ObdConnectionPool.ts - Connection pool for multiple OBD-II adapters
 *
 * Supports concurrent vehicle diagnostics with fair scheduling.
 */
import { KingbolenEdiagDriver } from './KingbolenEdiagDriver.js';
import { EventEmitter } from 'events';
export class ObdConnectionPool extends EventEmitter {
    constructor(maxConnections = 3, healthCheckIntervalMs = 30000, maxFailures = 3) {
        super();
        this.maxConnections = maxConnections;
        this.healthCheckIntervalMs = healthCheckIntervalMs;
        this.maxFailures = maxFailures;
        this.connections = [];
        this.queue = [];
        this.stats = {
            totalAcquired: 0,
            totalWaitTime: 0,
            waitCount: 0
        };
        this.startHealthCheck();
    }
    async acquireConnection(vehicleId, timeoutMs = 10000) {
        // Check for existing connection for this vehicle
        const existing = this.connections.find(c => c.vehicleId === vehicleId && c.inUse);
        if (existing) {
            throw new Error('Vehicle already has active connection');
        }
        // Try to find idle connection
        const idle = this.connections.find(c => !c.inUse);
        if (idle) {
            idle.inUse = true;
            idle.vehicleId = vehicleId;
            idle.acquiredAt = Date.now();
            this.stats.totalAcquired++;
            return idle.driver;
        }
        // Create new connection if under limit
        if (this.connections.length < this.maxConnections) {
            const driver = new KingbolenEdiagDriver();
            const connection = {
                driver,
                vehicleId,
                inUse: true,
                acquiredAt: Date.now()
            };
            this.connections.push(connection);
            this.stats.totalAcquired++;
            return driver;
        }
        // Wait in queue
        return new Promise((resolve, reject) => {
            const request = {
                vehicleId,
                resolve,
                reject,
                enqueuedAt: Date.now()
            };
            this.queue.push(request);
            const timeoutHandle = setTimeout(() => {
                const index = this.queue.indexOf(request);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    reject(new Error('Connection acquisition timeout'));
                }
            }, timeoutMs);
            const originalResolve = request.resolve;
            request.resolve = (driver) => {
                clearTimeout(timeoutHandle);
                originalResolve(driver);
            };
            const originalReject = request.reject;
            request.reject = (error) => {
                clearTimeout(timeoutHandle);
                originalReject(error);
            };
        });
    }
    async releaseConnection(vehicleId) {
        const connection = this.connections.find(c => c.vehicleId === vehicleId && c.inUse);
        if (!connection) {
            throw new Error('Connection not found or not in use');
        }
        connection.inUse = false;
        connection.vehicleId = null;
        connection.lastUsedAt = Date.now();
        // Process queue (round-robin)
        if (this.queue.length > 0) {
            const request = this.queue.shift();
            const waitTime = Date.now() - request.enqueuedAt;
            this.stats.totalWaitTime += waitTime;
            this.stats.waitCount++;
            this.stats.totalAcquired++;
            connection.inUse = true;
            connection.vehicleId = request.vehicleId;
            connection.acquiredAt = Date.now();
            request.resolve(connection.driver);
        }
    }
    getPoolStats() {
        const active = this.connections.filter(c => c.inUse).length;
        const idle = this.connections.filter(c => !c.inUse).length;
        const waiting = this.queue.length;
        const avgWaitTime = this.stats.waitCount > 0
            ? this.stats.totalWaitTime / this.stats.waitCount
            : 0;
        return {
            active,
            idle,
            waiting,
            totalAcquired: this.stats.totalAcquired,
            avgWaitTime
        };
    }
    startHealthCheck() {
        if (this.healthCheckInterval)
            return;
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckIntervalMs);
        if (typeof this.healthCheckInterval.unref === 'function') {
            this.healthCheckInterval.unref();
        }
    }
    async performHealthCheck() {
        for (const connection of this.connections) {
            if (connection.inUse)
                continue;
            // Check if driver is still responsive
            try {
                // Simple ping by checking metrics
                const metrics = connection.driver.getMetrics();
                if (metrics.failedCommands > this.maxFailures) {
                    // Driver has too many failures, reconnect
                    await this.reconnectDriver(connection);
                }
            }
            catch (error) {
                // Health check failed, attempt reconnect
                await this.reconnectDriver(connection);
            }
        }
    }
    async reconnectDriver(connection) {
        try {
            await connection.driver.disconnect();
            // Note: Connection will be re-established on next use
            this.emit('reconnect', { driver: connection.driver });
        }
        catch (error) {
            this.emit('error', { error, driver: connection.driver });
        }
    }
    async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }
        // Reject all queued requests
        for (const request of this.queue) {
            request.reject(new Error('Pool shutting down'));
        }
        this.queue = [];
        // Disconnect all connections
        await Promise.all(this.connections.map(c => c.driver.disconnect().catch(() => { })));
        this.connections = [];
    }
}
