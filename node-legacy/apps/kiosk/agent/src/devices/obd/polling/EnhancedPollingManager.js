/**
 * Enhanced Polling Manager
 * Smart polling with priority-based scheduling
 */
export var PidPriority;
(function (PidPriority) {
    PidPriority[PidPriority["HIGH"] = 1] = "HIGH";
    PidPriority[PidPriority["MEDIUM"] = 3] = "MEDIUM";
    PidPriority[PidPriority["LOW"] = 10] = "LOW";
})(PidPriority || (PidPriority = {}));
export class EnhancedPollingManager {
    driver;
    pids = new Map();
    pidPriorities = new Map();
    statistics = new Map();
    previousValues = new Map();
    cycleCounter = 0;
    pollingInterval = null;
    isActive = false;
    options;
    constructor(driver, options = {}) {
        this.driver = driver;
        this.options = {
            enableSmartPolling: options.enableSmartPolling ?? true,
            changeThreshold: options.changeThreshold ?? 1000, // RPM threshold
        };
    }
    /**
     * Add PID with priority
     */
    addPidWithPriority(mode, pid, priority) {
        const key = `${mode}${pid}`;
        this.pids.set(key, {
            mode,
            pid,
            priority,
        });
        this.pidPriorities.set(key, priority);
        // Initialize statistics
        if (!this.statistics.has(key)) {
            this.statistics.set(key, {
                totalPolls: 0,
                successfulPolls: 0,
                failedPolls: 0,
                avgLatency: 0,
            });
        }
    }
    /**
     * Start polling
     */
    startPolling(intervalMs = 1000) {
        if (this.isActive) {
            return;
        }
        this.isActive = true;
        this.cycleCounter = 0;
        this.pollingInterval = setInterval(() => {
            this.pollOnce().catch(error => {
                console.error('Polling error:', error);
            });
        }, intervalMs);
    }
    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isActive = false;
    }
    /**
     * Poll once (one cycle)
     */
    async pollOnce() {
        this.cycleCounter++;
        for (const [key, pidInfo] of this.pids.entries()) {
            // Check if should poll based on priority
            if (!this.shouldPollInCycle(pidInfo.priority, this.cycleCounter)) {
                continue;
            }
            const stats = this.statistics.get(key);
            const startTime = Date.now();
            try {
                const response = await this.driver.requestPid(pidInfo.mode, pidInfo.pid);
                const value = this.parseValue(response);
                const latency = Date.now() - startTime;
                // Update statistics
                stats.totalPolls++;
                stats.successfulPolls++;
                stats.avgLatency = (stats.avgLatency * (stats.successfulPolls - 1) + latency) / stats.successfulPolls;
                // Smart polling: detect significant changes
                if (this.options.enableSmartPolling && value !== null) {
                    const previousValue = this.previousValues.get(key);
                    if (previousValue !== undefined) {
                        const delta = Math.abs(value - previousValue);
                        // If RPM changed significantly, temporarily increase priority
                        if (key.includes('0C') && delta >= this.options.changeThreshold) {
                            this.adjustPriority(pidInfo.mode, pidInfo.pid, PidPriority.HIGH);
                            // Reset after some cycles
                            setTimeout(() => {
                                const originalPriority = PidPriority.MEDIUM;
                                this.adjustPriority(pidInfo.mode, pidInfo.pid, originalPriority);
                            }, 10000);
                        }
                    }
                    this.previousValues.set(key, value);
                }
                pidInfo.lastValue = value ?? undefined;
                pidInfo.lastPolled = Date.now();
            }
            catch (error) {
                stats.totalPolls++;
                stats.failedPolls++;
            }
        }
    }
    /**
     * Adjust priority dynamically
     */
    adjustPriority(mode, pid, newPriority) {
        const key = `${mode}${pid}`;
        const pidInfo = this.pids.get(key);
        if (pidInfo) {
            pidInfo.priority = newPriority;
            this.pidPriorities.set(key, newPriority);
        }
    }
    /**
     * Get polling statistics
     */
    getPollingStatistics() {
        return new Map(this.statistics);
    }
    /**
     * Optimize polling order
     */
    optimizePollingOrder() {
        // Sort PIDs by priority
        const sortedPids = Array.from(this.pids.entries()).sort((a, b) => {
            return a[1].priority - b[1].priority;
        });
        // Rebuild map in optimized order
        this.pids.clear();
        for (const [key, pidInfo] of sortedPids) {
            this.pids.set(key, pidInfo);
        }
    }
    /**
     * Check if active
     */
    isPollingActive() {
        return this.isActive;
    }
    /**
     * Determine if should poll in current cycle based on priority
     */
    shouldPollInCycle(priority, cycle) {
        switch (priority) {
            case PidPriority.HIGH:
                return true; // Every cycle
            case PidPriority.MEDIUM:
                return cycle % 3 === 0; // Every 3rd cycle
            case PidPriority.LOW:
                return cycle % 10 === 0; // Every 10th cycle
            default:
                return true;
        }
    }
    /**
     * Parse numeric value from hex response
     */
    parseValue(hexResponse) {
        const cleaned = hexResponse.replace(/\s/g, '');
        // Simple parser: extract first 2-4 bytes as value
        if (cleaned.length >= 2) {
            const value = parseInt(cleaned.substring(0, 4), 16);
            return isNaN(value) ? null : value;
        }
        return null;
    }
}
