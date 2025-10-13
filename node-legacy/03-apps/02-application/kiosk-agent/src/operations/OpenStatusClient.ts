import axios, { AxiosInstance } from 'axios';
import type { IncidentDefinition, IncidentUpdate, IncidentResponse } from './types/index.js';

export class OpenStatusClient {
  private apiUrl: string = '';
  private apiKey: string = '';
  private axiosInstance: AxiosInstance | null = null;

  initClient(apiUrl: string, apiKey: string): void {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  async updatePageStatus(status: 'operational' | 'degraded' | 'outage'): Promise<void> {
    if (!this.axiosInstance) {
      throw new Error('OpenStatusClient not initialized. Call initClient first.');
    }

    await this.axiosInstance.post('/api/page/status', { status });
  }

  async createIncident(incident: IncidentDefinition): Promise<IncidentResponse> {
    if (!this.axiosInstance) {
      throw new Error('OpenStatusClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.post('/api/incidents', incident);
    return response.data;
  }

  async updateIncident(incidentId: string, update: IncidentUpdate): Promise<IncidentResponse> {
    if (!this.axiosInstance) {
      throw new Error('OpenStatusClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.put(`/api/incidents/${incidentId}`, update);
    return response.data;
  }

  async resolveIncident(incidentId: string): Promise<void> {
    if (!this.axiosInstance) {
      throw new Error('OpenStatusClient not initialized. Call initClient first.');
    }

    await this.axiosInstance.post(`/api/incidents/${incidentId}/resolve`);
  }

  async listIncidents(): Promise<IncidentResponse[]> {
    if (!this.axiosInstance) {
      throw new Error('OpenStatusClient not initialized. Call initClient first.');
    }

    const response = await this.axiosInstance.get('/api/incidents');
    return response.data;
  }
}
