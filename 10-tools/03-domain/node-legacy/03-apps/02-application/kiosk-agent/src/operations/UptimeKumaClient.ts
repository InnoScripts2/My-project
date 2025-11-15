import axios, { AxiosInstance } from 'axios';
import type {
  MonitorDefinition,
  MonitorResponse,
  MonitorStatus,
  Heartbeat,
} from './types/index.js';

export class UptimeKumaClient {
  private apiUrl: string = '';
  private apiToken: string = '';
  private axiosInstance: AxiosInstance | null = null;

  initClient(apiUrl: string, apiToken: string): void {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });
  }

  async createMonitor(monitor: MonitorDefinition): Promise<MonitorResponse> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.post('/api/monitor', monitor);
    return response.data;
  }

  async updateMonitor(monitorId: string, monitor: Partial<MonitorDefinition>): Promise<MonitorResponse> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.put(`/api/monitor/${monitorId}`, monitor);
    return response.data;
  }

  async deleteMonitor(monitorId: string): Promise<void> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    await this.axiosInstance.delete(`/api/monitor/${monitorId}`);
  }

  async listMonitors(): Promise<MonitorResponse[]> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.get('/api/monitors');
    return response.data;
  }

  async getMonitorStatus(monitorId: string): Promise<MonitorStatus> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.get(`/api/monitor/${monitorId}/status`);
    return response.data;
  }

  async getMonitorHeartbeats(monitorId: string, limit: number = 100): Promise<Heartbeat[]> {
    if (!this.axiosInstance) {
      throw new Error('UptimeKumaClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.get(`/api/monitor/${monitorId}/heartbeats`, {
      params: { limit },
    });
    return response.data;
  }
}
