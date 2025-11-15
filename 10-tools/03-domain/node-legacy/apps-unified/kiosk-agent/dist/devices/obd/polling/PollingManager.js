/**
 * Polling Manager
 * Manages periodic polling of OBD PIDs
 */
import { DATA_RECEIVED } from '../events/ObdEvents.js';
/**
 * Polling Manager
 * Handles cyclic polling of PIDs with configurable interval
 */
export class PollingManager {
    constructor(driver, pidDatabase) {
        this.pollingPids = new Set();
        this.intervalTimer = null;
        this.pollingInterval = 1000;
        this.isPolling = false;
        this.driver = driver;
        this.pidDatabase = pidDatabase;
    }
    /**
     * Add PID to polling list
     */
    addPid(pidName) {
        if (!this.pidDatabase.validatePidExists(pidName)) {
            throw new Error(`PID "${pidName}" does not exist in database`);
        }
        this.pollingPids.add(pidName);
    }
    /**
     * Remove PID from polling list
     */
    removePid(pidName) {
        this.pollingPids.delete(pidName);
    }
    /**
     * Remove all PIDs from polling list
     */
    removeAllPids() {
        this.pollingPids.clear();
    }
    /**
     * Start polling with optional interval
     */
    startPolling(interval) {
        if (this.isPolling) {
            throw new Error('Polling is already active');
        }
        if (this.pollingPids.size === 0) {
            throw new Error('Cannot start polling with empty PID list');
        }
        if (interval !== undefined) {
            this.pollingInterval = interval;
        }
        this.isPolling = true;
        this.intervalTimer = setInterval(() => {
            void this.pollOnce();
        }, this.pollingInterval);
    }
    /**
     * Stop polling
     */
    stopPolling() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        this.isPolling = false;
    }
    /**
     * Get current polling status
     */
    isActive() {
        return this.isPolling;
    }
    /**
     * Get list of PIDs being polled
     */
    getPollingPids() {
        return Array.from(this.pollingPids);
    }
    /**
     * Poll all PIDs once
     */
    async pollOnce() {
        for (const pidName of this.pollingPids) {
            try {
                const pidDefinition = this.pidDatabase.getPidByName(pidName);
                if (!pidDefinition) {
                    continue;
                }
                // Request PID data
                const hexData = await this.driver.requestPid(pidDefinition.mode, pidDefinition.pid);
                // Convert hex to useful value
                const value = pidDefinition.convertToUseful(hexData);
                // Create PID value object
                const pidValue = {
                    name: pidDefinition.name,
                    value,
                    unit: pidDefinition.unit,
                    timestamp: new Date(),
                };
                // Emit data received event
                this.driver.emit(DATA_RECEIVED, {
                    pid: pidName,
                    value: pidValue,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                // Log error but continue with other PIDs
                // Don't stop polling on individual PID failure
                console.error(`Failed to poll PID "${pidName}":`, error);
            }
        }
    }
}
