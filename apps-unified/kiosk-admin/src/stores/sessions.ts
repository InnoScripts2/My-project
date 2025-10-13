import { defineStore } from 'pinia';
import { api as axios } from '@/services/apiClient';
import type { Session } from '@/types';

export const useSessionsStore = defineStore('sessions', {
  state: () => ({
    sessions: [] as Session[],
    loading: false,
    error: null as string | null,
    filters: {
      startDate: '',
      endDate: '',
      type: '' as '' | 'THICKNESS' | 'DIAGNOSTICS',
      status: '' as '' | 'in-progress' | 'completed' | 'incomplete' | 'failed'
    }
  }),

  getters: {
    filteredSessions: (state) => {
      return state.sessions.filter(session => {
        if (state.filters.type && session.type !== state.filters.type) return false;
        if (state.filters.status && session.status !== state.filters.status) return false;
        if (state.filters.startDate && session.startedAt < state.filters.startDate) return false;
        if (state.filters.endDate && session.startedAt > state.filters.endDate) return false;
        return true;
      });
    }
  },

  actions: {
    async fetchSessions() {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.get('/api/sessions', { params: this.filters });
        this.sessions = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch sessions';
        console.error('Error fetching sessions:', error);
      } finally {
        this.loading = false;
      }
    },

    setFilters(filters: Partial<typeof this.filters>) {
      this.filters = { ...this.filters, ...filters };
    },

    async cancelSession(sessionId: string) {
      try {
        await axios.post(`/api/sessions/${sessionId}/cancel`);
        await this.fetchSessions();
        return { success: true };
      } catch (error: any) {
        console.error('Error canceling session:', error);
        return { success: false, error: error.message };
      }
    }
  }
});
