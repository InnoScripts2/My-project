/**
 * Device health check service
 * Provides comprehensive health status for all devices
 */

import { EventEmitter } from 'events';
import { getDeviceStorage, DeviceStateRecord } from './storage.js';
import { ConnectionState } from './connection-manager.js';
import { createLogger } from './logger.js';

const logger = createLogger('HealthCheckService');
const storage = getDeviceStorage();

export interface DeviceHealthDetail {
  deviceType: 'obd' | 'thickness';
  state: ConnectionState | string;
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
  uptime?: number;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    totalOperations: number;
    failedOperations: number;
    lastOperationTime?: Date;
  };
  degradationReasons: string[];
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface AggregatedHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  devices: {
    obd: DeviceHealthDetail;
    thickness: DeviceHealthDetail;
  };
  timestamp: Date;
}

export class HealthCheckService extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private lastHealthStatus: AggregatedHealthStatus | null = null;

  constructor(private readonly intervalMs: number = 30000) {
    super();
  }

  start(): void {
    if (this.checkInterval) {
      logger.warn('Health check service already running');
      return;
    }

    logger.info('Starting health check service', { intervalMs: this.intervalMs });
    
    // Initial check
    this.performHealthCheck();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health check service stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const status = await this.getAggregatedHealth();
      
      // Compare with previous status
      if (this.lastHealthStatus) {
        this.detectHealthChanges(this.lastHealthStatus, status);
      }

      this.lastHealthStatus = status;
      this.emit('health_check_completed', status);

      // Log warnings for unhealthy devices
      if (status.overall !== 'healthy') {
        logger.warn('System health degraded', {
          overall: status.overall,
          obd: status.devices.obd.status,
          thickness: status.devices.thickness.status,
        });
      }
    } catch (error) {
      logger.error('Health check failed', { error });
      this.emit('health_check_error', error);
    }
  }

  private detectHealthChanges(
    previous: AggregatedHealthStatus,
    current: AggregatedHealthStatus
  ): void {
    // Check OBD status change
    if (previous.devices.obd.status !== current.devices.obd.status) {
      logger.info('OBD health status changed', {
        from: previous.devices.obd.status,
        to: current.devices.obd.status,
      });
      this.emit('device_health_changed', 'obd', current.devices.obd);
    }

    // Check thickness status change
    if (previous.devices.thickness.status !== current.devices.thickness.status) {
      logger.info('Thickness health status changed', {
        from: previous.devices.thickness.status,
        to: current.devices.thickness.status,
      });
      this.emit('device_health_changed', 'thickness', current.devices.thickness);
    }

    // Check overall status change
    if (previous.overall !== current.overall) {
      logger.info('Overall system health changed', {
        from: previous.overall,
        to: current.overall,
      });
      this.emit('overall_health_changed', current.overall);
    }
  }

  async getAggregatedHealth(): Promise<AggregatedHealthStatus> {
    const obdHealth = await this.getDeviceHealth('obd');
    const thicknessHealth = await this.getDeviceHealth('thickness');

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (obdHealth.status === 'unhealthy' || thicknessHealth.status === 'unhealthy') {
      overall = 'unhealthy';
    } else if (obdHealth.status === 'degraded' || thicknessHealth.status === 'degraded') {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return {
      overall,
      devices: {
        obd: obdHealth,
        thickness: thicknessHealth,
      },
      timestamp: new Date(),
    };
  }

  async getDeviceHealth(deviceType: 'obd' | 'thickness'): Promise<DeviceHealthDetail> {
    const state = storage.getState(deviceType);
    const recentMetrics = storage.getMetrics(deviceType, undefined, 100);
    
    const degradationReasons: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';

    // Calculate metrics
    const totalOperations = recentMetrics.length;
    const failedOperations = recentMetrics.filter(
      m => m.metricName === 'operation_failed'
    ).length;
    const successRate = totalOperations > 0
      ? 1 - (failedOperations / totalOperations)
      : 0;

    const responseTimes = recentMetrics
      .filter(m => m.metricName === 'operation_duration_ms')
      .map(m => m.metricValue);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const lastOperationMetric = recentMetrics[0];
    const lastOperationTime = lastOperationMetric
      ? new Date(lastOperationMetric.timestamp)
      : undefined;

    // Determine health status
    if (!state || !state.connected) {
      status = 'unhealthy';
      degradationReasons.push('Device not connected');
    } else if (state.lastError) {
      status = 'degraded';
      degradationReasons.push(`Recent error: ${state.lastError}`);
    } else if (successRate < 0.8) {
      status = 'degraded';
      degradationReasons.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
    } else if (avgResponseTime > 5000) {
      status = 'degraded';
      degradationReasons.push(`High response time: ${avgResponseTime.toFixed(0)}ms`);
    } else if (lastOperationTime && Date.now() - lastOperationTime.getTime() > 300000) {
      status = 'degraded';
      degradationReasons.push('No recent operations (>5 minutes)');
    } else {
      status = 'healthy';
    }

    // Calculate uptime
    let uptime: number | undefined;
    if (state?.lastConnected) {
      uptime = Date.now() - new Date(state.lastConnected).getTime();
    }

    return {
      deviceType,
      state: state?.state || 'unknown',
      connected: state?.connected || false,
      lastConnected: state?.lastConnected ? new Date(state.lastConnected) : undefined,
      lastError: state?.lastError,
      uptime,
      metrics: {
        successRate,
        avgResponseTime,
        totalOperations,
        failedOperations,
        lastOperationTime,
      },
      degradationReasons,
      status,
    };
  }

  getLastHealthStatus(): AggregatedHealthStatus | null {
    return this.lastHealthStatus;
  }

  async runManualCheck(): Promise<AggregatedHealthStatus> {
    const status = await this.getAggregatedHealth();
    this.emit('manual_health_check', status);
    return status;
  }
}

// Singleton instance
let healthCheckServiceInstance: HealthCheckService | null = null;

export function getHealthCheckService(intervalMs?: number): HealthCheckService {
  if (!healthCheckServiceInstance) {
    healthCheckServiceInstance = new HealthCheckService(intervalMs);
  }
  return healthCheckServiceInstance;
}

export function startHealthCheckService(intervalMs?: number): HealthCheckService {
  const service = getHealthCheckService(intervalMs);
  service.start();
  return service;
}
