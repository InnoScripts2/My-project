import { defineStore } from 'pinia';
import axios from 'axios';
import type { Alert } from '@/types';

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    alerts: [] as Alert[],
    loading: false,
    error: null as string | null
  }),

  getters: {
    unacknowledgedCount: (state) => state.alerts.filter(a => a.status === 'active').length,
    activeAlerts: (state) => state.alerts.filter(a => a.status === 'active'),
    acknowledgedAlerts: (state) => state.alerts.filter(a => a.status === 'acknowledged'),
    resolvedAlerts: (state) => state.alerts.filter(a => a.status === 'resolved')
  },

  actions: {
    async fetchAlerts() {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.get('/api/monitoring/alerts');
        this.alerts = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch alerts';
        console.error('Error fetching alerts:', error);
      } finally {
        this.loading = false;
      }
    },

    async acknowledgeAlert(alertId: string) {
      try {
        await axios.post(`/api/monitoring/alerts/${alertId}/acknowledge`);
        await this.fetchAlerts();
        return { success: true };
      } catch (error: any) {
        console.error('Error acknowledging alert:', error);
        return { success: false, error: error.message };
      }
    },

    async resolveAlert(alertId: string) {
      try {
        await axios.post(`/api/monitoring/alerts/${alertId}/resolve`);
        await this.fetchAlerts();
        return { success: true };
      } catch (error: any) {
        console.error('Error resolving alert:', error);
        return { success: false, error: error.message };
      }
    },

    addAlert(alertData: Alert) {
      this.alerts.unshift(alertData);
    }
  }
});
