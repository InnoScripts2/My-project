import { defineStore } from 'pinia';
import { api as axios } from '@/services/apiClient';
import type { Kiosk } from '@/types';

export const useKiosksStore = defineStore('kiosks', {
  state: () => ({
    kiosks: [] as Kiosk[],
    loading: false,
    error: null as string | null
  }),

  getters: {
    onlineKiosks: (state) => state.kiosks.filter(k => k.status === 'online'),
    offlineKiosks: (state) => state.kiosks.filter(k => k.status === 'offline'),
    maintenanceKiosks: (state) => state.kiosks.filter(k => k.status === 'maintenance')
  },

  actions: {
    async fetchKiosksList() {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.get('/api/kiosks');
        this.kiosks = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch kiosks';
        console.error('Error fetching kiosks:', error);
      } finally {
        this.loading = false;
      }
    },

    async restartKiosk(kioskId: string) {
      try {
        await axios.post(`/api/kiosks/${kioskId}/restart`);
        await this.fetchKiosksList();
        return { success: true };
      } catch (error: any) {
        console.error('Error restarting kiosk:', error);
        return { success: false, error: error.message };
      }
    },

    updateKioskStatus(kioskId: string, status: 'online' | 'offline' | 'maintenance') {
      const kiosk = this.kiosks.find(k => k.kioskId === kioskId);
      if (kiosk) {
        kiosk.status = status;
        kiosk.lastSeen = new Date().toISOString();
      }
    }
  }
});
