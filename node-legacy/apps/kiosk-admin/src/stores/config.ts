import { defineStore } from 'pinia';
import axios from 'axios';
import type { KioskConfig } from '@/types';

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: {} as KioskConfig,
    loading: false,
    error: null as string | null
  }),

  actions: {
    async fetchConfig(kioskId: string) {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.get(`/api/kiosks/${kioskId}/config`);
        this.config = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch config';
        console.error('Error fetching config:', error);
      } finally {
        this.loading = false;
      }
    },

    async saveConfig(kioskId: string, newConfig: KioskConfig) {
      this.loading = true;
      this.error = null;
      try {
        await axios.put(`/api/kiosks/${kioskId}/config`, newConfig);
        this.config = newConfig;
        return { success: true };
      } catch (error: any) {
        this.error = error.message || 'Failed to save config';
        console.error('Error saving config:', error);
        return { success: false, error: error.message };
      } finally {
        this.loading = false;
      }
    }
  }
});
