/**
 * Enhanced Polling Manager
 * Smart polling with priority-based scheduling
 */

import type { ObdDriver, ObdMode, PidIdentifier } from '../drivers/ObdDriverInterface.js';
import { PriorityQueue } from './PriorityQueue.js';

export enum PidPriority {
  HIGH = 1,    // Poll every cycle
  MEDIUM = 3,  // Poll every 3rd cycle
  LOW = 10,    // Poll every 10th cycle
}

interface PidInfo {
  mode: ObdMode;
  pid: PidIdentifier;
  priority: PidPriority;
  lastValue?: number;
  lastPolled?: number;
}

interface PidStatistics {
  totalPolls: number;
  successfulPolls: number;
  failedPolls: number;
  avgLatency: number;
}

export interface EnhancedPollingOptions {
  enableSmartPolling?: boolean;
  changeThreshold?: number;
}

export class EnhancedPollingManager {
  private pids: Map<string, PidInfo> = new Map();
  private pidPriorities: Map<string, PidPriority> = new Map();
  private statistics: Map<string, PidStatistics> = new Map();
  private previousValues: Map<string, number> = new Map();
  private cycleCounter = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isActive = false;
  private options: Required<EnhancedPollingOptions>;

  constructor(
    private driver: ObdDriver,
    options: EnhancedPollingOptions = {}
  ) {
    this.options = {
      enableSmartPolling: options.enableSmartPolling ?? true,
      changeThreshold: options.changeThreshold ?? 1000, // RPM threshold
    };
  }

  /**
   * Add PID with priority
   */
  addPidWithPriority(mode: ObdMode, pid: PidIdentifier, priority: PidPriority): void {
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
  startPolling(intervalMs: number = 1000): void {
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
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isActive = false;
  }

  /**
   * Poll once (one cycle)
   */
  async pollOnce(): Promise<void> {
    this.cycleCounter++;

    for (const [key, pidInfo] of this.pids.entries()) {
      // Check if should poll based on priority
      if (!this.shouldPollInCycle(pidInfo.priority, this.cycleCounter)) {
        continue;
      }

      const stats = this.statistics.get(key)!;
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
      } catch (error) {
        stats.totalPolls++;
        stats.failedPolls++;
      }
    }
  }

  /**
   * Adjust priority dynamically
   */
  adjustPriority(mode: ObdMode, pid: PidIdentifier, newPriority: PidPriority): void {
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
  getPollingStatistics(): Map<string, PidStatistics> {
    return new Map(this.statistics);
  }

  /**
   * Optimize polling order
   */
  optimizePollingOrder(): void {
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
  isPollingActive(): boolean {
    return this.isActive;
  }

  /**
   * Determine if should poll in current cycle based on priority
   */
  private shouldPollInCycle(priority: PidPriority, cycle: number): boolean {
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
  private parseValue(hexResponse: string): number | null {
    const cleaned = hexResponse.replace(/\s/g, '');
    
    // Simple parser: extract first 2-4 bytes as value
    if (cleaned.length >= 2) {
      const value = parseInt(cleaned.substring(0, 4), 16);
      return isNaN(value) ? null : value;
    }
    
    return null;
  }
}
