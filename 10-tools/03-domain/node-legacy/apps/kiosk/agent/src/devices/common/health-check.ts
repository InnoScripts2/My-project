/**
 * Health check для устройств
 */

import { DeviceHealthStatus, DeviceState } from './interfaces.js';

export interface HealthCheckResult {
  healthy: boolean;
  status: DeviceHealthStatus;
  timestamp: Date;
  message?: string;
}

export interface HealthChecker {
  /**
   * Выполнить проверку здоровья устройства
   */
  check(): Promise<HealthCheckResult>;

  /**
   * Получить последний результат проверки
   */
  getLastResult(): HealthCheckResult | null;
}

export class BaseHealthChecker implements HealthChecker {
  private lastResult: HealthCheckResult | null = null;

  constructor(
    private readonly getStatus: () => DeviceHealthStatus,
    private readonly performCheck?: () => Promise<boolean>
  ) {}

  async check(): Promise<HealthCheckResult> {
    const status = this.getStatus();
    let healthy = status.connected && status.state !== DeviceState.ERROR;

    if (this.performCheck) {
      try {
        healthy = healthy && (await this.performCheck());
      } catch {
        healthy = false;
      }
    }

    this.lastResult = {
      healthy,
      status,
      timestamp: new Date(),
      message: healthy ? 'Device is healthy' : 'Device is not healthy',
    };

    return this.lastResult;
  }

  getLastResult(): HealthCheckResult | null {
    return this.lastResult;
  }
}
