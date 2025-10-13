import axios from 'axios';
import type { AggregatedHealth, ServiceHealth } from './types/index.js';

export class HealthCheckAggregator {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  async getAggregatedHealth(): Promise<AggregatedHealth> {
    const services = ['OBD', 'Thickness', 'Payments', 'Reports'];
    const healthChecks = await Promise.all(
      services.map((serviceName) => this.checkServiceHealth(serviceName))
    );

    const allHealthy = healthChecks.every((h) => h.status === 'healthy');
    const anyUnhealthy = healthChecks.some((h) => h.status === 'unhealthy');

    const status = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

    return {
      status,
      services: healthChecks,
      timestamp: new Date().toISOString(),
    };
  }

  async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
    try {
      const startTime = Date.now();
      let endpoint = '';
      let healthyCondition: (data: any) => boolean = () => true;

      switch (serviceName) {
        case 'OBD':
          endpoint = `${this.baseUrl}/api/obd/status`;
          healthyCondition = (data) => data.connected === true;
          break;
        case 'Thickness':
          endpoint = `${this.baseUrl}/api/thickness/status`;
          healthyCondition = (data) => data.connected === true;
          break;
        case 'Payments':
          endpoint = `${this.baseUrl}/api/payments/health`;
          healthyCondition = (data) => data.status === 'healthy' || data.reachable === true;
          break;
        case 'Reports':
          endpoint = `${this.baseUrl}/api/reports/health`;
          healthyCondition = (data) => data.status === 'healthy' || data.smtpAvailable === true;
          break;
        default:
          return {
            name: serviceName,
            status: 'unhealthy',
            message: 'Unknown service',
          };
      }

      const response = await axios.get(endpoint, { timeout: 5000 });
      const responseTime = Date.now() - startTime;

      const isHealthy = healthyCondition(response.data) && responseTime < 500;

      return {
        name: serviceName,
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        message: isHealthy ? 'Service operational' : 'Service degraded or slow',
      };
    } catch (error: any) {
      return {
        name: serviceName,
        status: 'unhealthy',
        message: error.message || 'Service unreachable',
      };
    }
  }
}
