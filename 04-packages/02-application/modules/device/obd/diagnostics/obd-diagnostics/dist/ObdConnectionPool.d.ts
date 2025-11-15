/**
 * ObdConnectionPool.ts - Connection pool for multiple OBD-II adapters
 *
 * Supports concurrent vehicle diagnostics with fair scheduling.
 */
import { KingbolenEdiagDriver } from './KingbolenEdiagDriver.js';
import { EventEmitter } from 'events';
export interface PoolStats {
    active: number;
    idle: number;
    waiting: number;
    totalAcquired: number;
    avgWaitTime: number;
}
export declare class ObdConnectionPool extends EventEmitter {
    private readonly maxConnections;
    private readonly healthCheckIntervalMs;
    private readonly maxFailures;
    private connections;
    private queue;
    private stats;
    private healthCheckInterval?;
    constructor(maxConnections?: number, healthCheckIntervalMs?: number, maxFailures?: number);
    acquireConnection(vehicleId: string, timeoutMs?: number): Promise<KingbolenEdiagDriver>;
    releaseConnection(vehicleId: string): Promise<void>;
    getPoolStats(): PoolStats;
    private startHealthCheck;
    private performHealthCheck;
    private reconnectDriver;
    shutdown(): Promise<void>;
}
