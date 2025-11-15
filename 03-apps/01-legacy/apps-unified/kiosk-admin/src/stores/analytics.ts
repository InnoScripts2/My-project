import { defineStore } from 'pinia';
import { api as axios } from '@/services/apiClient';
import type { OverviewDashboard } from '@/types';

export const useAnalyticsStore = defineStore('analytics', {
  state: () => ({
    overviewDashboard: null as OverviewDashboard | null,
    loading: false,
    error: null as string | null
  }),

  actions: {
    async fetchOverviewDashboard() {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.get('/api/analytics/dashboard');
        this.overviewDashboard = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch dashboard data';
        console.error('Error fetching dashboard:', error);
      } finally {
        this.loading = false;
      }
    }
  }
});
