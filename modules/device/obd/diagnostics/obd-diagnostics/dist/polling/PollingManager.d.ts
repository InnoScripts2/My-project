/**
 * Polling Manager
 * Manages periodic polling of OBD PIDs
 */
import type { ObdDriver } from '../drivers/ObdDriverInterface.js';
import type { PidDatabase } from '../database/PidDatabase.js';
/**
 * Polling Manager
 * Handles cyclic polling of PIDs with configurable interval
 */
export declare class PollingManager {
    private readonly driver;
    private readonly pidDatabase;
    private readonly pollingPids;
    private intervalTimer;
    private pollingInterval;
    private isPolling;
    constructor(driver: ObdDriver, pidDatabase: PidDatabase);
    /**
     * Add PID to polling list
     */
    addPid(pidName: string): void;
    /**
     * Remove PID from polling list
     */
    removePid(pidName: string): void;
    /**
     * Remove all PIDs from polling list
     */
    removeAllPids(): void;
    /**
     * Start polling with optional interval
     */
    startPolling(interval?: number): void;
    /**
     * Stop polling
     */
    stopPolling(): void;
    /**
     * Get current polling status
     */
    isActive(): boolean;
    /**
     * Get list of PIDs being polled
     */
    getPollingPids(): string[];
    /**
     * Poll all PIDs once
     */
    private pollOnce;
}
