/**
 * OBD Locks Adapter
 * Integration layer between workflow orchestrator and locks controller
 */

import type { LockController } from '../../locks/LockController.js';

export interface AdapterStatus {
  locked: boolean;
  lastDispensed?: string;
  lastReturned?: string;
  currentStatus: string;
}

export class ObdLocksAdapter {
  private lastDispensedAt?: string;
  private lastReturnedAt?: string;

  constructor(private lockController: LockController) {}

  /**
   * Unlock OBD adapter for dispensing
   */
  async unlockObd(operationKey?: string): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = 30000; // 30 seconds

    try {
      console.log('[ObdLocksAdapter] Unlocking OBD adapter');

      const result = await this.lockController.openSlot('obd', {
        operationKey,
        autoCloseMs: 300000, // 5 minutes
        context: { operation: 'dispense_obd_adapter' },
      });

      const duration = Date.now() - startTime;

      if (result.ok) {
        this.lastDispensedAt = new Date().toISOString();
        console.log(`[ObdLocksAdapter] OBD adapter unlocked successfully in ${duration}ms`);
        return true;
      } else {
        console.error(`[ObdLocksAdapter] Failed to unlock OBD adapter: ${result.error}`);

        // Alert if taking too long
        if (duration > timeoutMs) {
          console.error('[ObdLocksAdapter] ALERT: Unlock operation exceeded 30s timeout');
          // Trigger alert (would integrate with monitoring/alerts.ts)
        }

        return false;
      }
    } catch (error) {
      console.error('[ObdLocksAdapter] Error unlocking OBD adapter:', error);
      return false;
    }
  }

  /**
   * Wait for adapter return with timeout
   */
  async waitForReturn(timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    console.log(`[ObdLocksAdapter] Waiting for adapter return (timeout: ${timeoutMs}ms)`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getAdapterStatus();

        // In real implementation, would check physical sensor
        // For now, simulate with timeout
        if (this.simulateReturnSensor()) {
          console.log('[ObdLocksAdapter] Adapter return detected');
          return true;
        }

        await this.sleep(pollInterval);
      } catch (error) {
        console.error('[ObdLocksAdapter] Error checking adapter status:', error);
      }
    }

    console.warn('[ObdLocksAdapter] Adapter return timeout exceeded');
    return false;
  }

  /**
   * Lock OBD adapter after return
   */
  async lockObd(operationKey?: string): Promise<boolean> {
    try {
      console.log('[ObdLocksAdapter] Locking OBD adapter');

      const result = await this.lockController.closeSlot('obd', {
        operationKey,
        reason: 'secure_obd_adapter',
      });

      if (result.ok) {
        this.lastReturnedAt = new Date().toISOString();
        console.log('[ObdLocksAdapter] OBD adapter locked successfully');
        return true;
      } else {
        console.error(`[ObdLocksAdapter] Failed to lock OBD adapter: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error('[ObdLocksAdapter] Error locking OBD adapter:', error);
      return false;
    }
  }

  /**
   * Get current adapter status
   */
  async getAdapterStatus(): Promise<AdapterStatus> {
    try {
      const snapshot = await this.lockController.getStatus('obd');

      if (!snapshot) {
        return {
          locked: true,
          currentStatus: 'unknown',
        };
      }

      return {
        locked: snapshot.status === 'locked',
        lastDispensed: this.lastDispensedAt,
        lastReturned: this.lastReturnedAt,
        currentStatus: snapshot.status,
      };
    } catch (error) {
      console.error('[ObdLocksAdapter] Error getting adapter status:', error);
      return {
        locked: true,
        currentStatus: 'error',
      };
    }
  }

  /**
   * Force lock (emergency use)
   */
  async forceLock(): Promise<boolean> {
    console.warn('[ObdLocksAdapter] Force locking OBD adapter (emergency)');
    return this.lockObd('force-lock-' + Date.now());
  }

  private simulateReturnSensor(): boolean {
    // In real implementation, would read from physical sensor
    // For now, return true after random delay to simulate return
    return Math.random() > 0.95; // 5% chance per poll
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
