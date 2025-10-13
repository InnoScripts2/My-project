/**
 * Polling Manager
 * Manages periodic polling of OBD PIDs
 */

import type { ObdDriver } from '../drivers/ObdDriverInterface.js';
import type { PidDatabase } from '../database/PidDatabase.js';
import type { PidValue } from '../database/types.js';
import { DATA_RECEIVED } from '../events/ObdEvents.js';

/**
 * Polling Manager
 * Handles cyclic polling of PIDs with configurable interval
 */
export class PollingManager {
  private readonly driver: ObdDriver;
  private readonly pidDatabase: PidDatabase;
  private readonly pollingPids: Set<string> = new Set();
  private intervalTimer: NodeJS.Timeout | null = null;
  private pollingInterval: number = 1000;
  private isPolling: boolean = false;

  constructor(driver: ObdDriver, pidDatabase: PidDatabase) {
    this.driver = driver;
    this.pidDatabase = pidDatabase;
  }

  /**
   * Add PID to polling list
   */
  addPid(pidName: string): void {
    if (!this.pidDatabase.validatePidExists(pidName)) {
      throw new Error(`PID "${pidName}" does not exist in database`);
    }
    this.pollingPids.add(pidName);
  }

  /**
   * Remove PID from polling list
   */
  removePid(pidName: string): void {
    this.pollingPids.delete(pidName);
  }

  /**
   * Remove all PIDs from polling list
   */
  removeAllPids(): void {
    this.pollingPids.clear();
  }

  /**
   * Start polling with optional interval
   */
  startPolling(interval?: number): void {
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
  stopPolling(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isPolling = false;
  }

  /**
   * Get current polling status
   */
  isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Get list of PIDs being polled
   */
  getPollingPids(): string[] {
    return Array.from(this.pollingPids);
  }

  /**
   * Poll all PIDs once
   */
  private async pollOnce(): Promise<void> {
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
        const pidValue: PidValue = {
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
      } catch (error) {
        // Log error but continue with other PIDs
        // Don't stop polling on individual PID failure
        console.error(`Failed to poll PID "${pidName}":`, error);
      }
    }
  }
}
