/**
 * Health check service for all devices
 * Provides unified health status for OBD-II and thickness gauge
 */

import { Elm327Driver } from './obd/Elm327Driver.js';
import { ThicknessDriver } from './thickness/driver/ThicknessDriver.js';
import { getDeviceStorage } from './common/storage.js';

export interface DeviceHealthReport {
  obd: {
    available: boolean;
    connected: boolean;
    state: string;
    lastConnected?: string;
    lastError?: string;
    metrics?: {
      successRate: number;
      avgResponseTime: number;
      totalOperations: number;
      failedOperations: number;
    };
  };
  thickness: {
    available: boolean;
    connected: boolean;
    state: string;
    lastConnected?: string;
    lastError?: string;
    progress?: {
      measuredZones: number;
      totalZones: number;
      percentage: number;
    };
  };
  storage: {
    available: boolean;
    path: string;
    events: {
      obd: number;
      thickness: number;
    };
  };
}

export class DeviceHealthService {
  private obdDriver: Elm327Driver | null = null;
  private thicknessDriver: ThicknessDriver | null = null;

  setObdDriver(driver: Elm327Driver): void {
    this.obdDriver = driver;
  }

  setThicknessDriver(driver: ThicknessDriver): void {
    this.thicknessDriver = driver;
  }

  async getHealthReport(): Promise<DeviceHealthReport> {
    const storage = getDeviceStorage();

    // OBD health
    const obdHealth = this.obdDriver ? this.obdDriver.getHealthStatus() : null;
    const obdState = storage.getState('obd');

    // Thickness health
    const thicknessHealth = this.thicknessDriver
      ? this.thicknessDriver.getHealthStatus()
      : null;
    const thicknessState = storage.getState('thickness');

    // Event counts
    const obdEvents = storage.getRecentEvents('obd', 1000);
    const thicknessEvents = storage.getRecentEvents('thickness', 1000);

    return {
      obd: {
        available: this.obdDriver !== null,
        connected: obdHealth?.connected || false,
        state: obdHealth?.state || obdState?.state || 'unknown',
        lastConnected: obdState?.lastConnected,
        lastError: obdState?.lastError,
        metrics: obdHealth?.metrics,
      },
      thickness: {
        available: this.thicknessDriver !== null,
        connected: thicknessHealth?.connected || false,
        state: thicknessHealth?.state || thicknessState?.state || 'unknown',
        lastConnected: thicknessState?.lastConnected,
        lastError: thicknessState?.lastError,
        progress: this.thicknessDriver
          ? {
              measuredZones: this.thicknessDriver.getMeasurements().length,
              totalZones: 40, // TODO: get from config
              percentage: 0,
            }
          : undefined,
      },
      storage: {
        available: true,
        path: 'storage/devices.sqlite',
        events: {
          obd: obdEvents.length,
          thickness: thicknessEvents.length,
        },
      },
    };
  }

  async checkHealth(): Promise<{ healthy: boolean; report: DeviceHealthReport }> {
    const report = await this.getHealthReport();

    // System is healthy if:
    // - Storage is available
    // - No critical errors in the last state
    const healthy =
      report.storage.available &&
      (!report.obd.lastError || report.obd.connected) &&
      (!report.thickness.lastError || report.thickness.connected);

    return { healthy, report };
  }
}

// Singleton instance
let healthServiceInstance: DeviceHealthService | null = null;

export function getHealthService(): DeviceHealthService {
  if (!healthServiceInstance) {
    healthServiceInstance = new DeviceHealthService();
  }
  return healthServiceInstance;
}
