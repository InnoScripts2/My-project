import { defineStore } from 'pinia';
import { wsClient } from '@/services/WebSocketClient';
import { useKiosksStore } from './kiosks';
import { useAlertsStore } from './alerts';

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({
    connected: false
  }),

  actions: {
    initWebSocket() {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
      wsClient.connect(wsUrl);

      wsClient.subscribe('connect', () => {
        this.connected = true;
      });

      wsClient.subscribe('disconnect', () => {
        this.connected = false;
      });

      wsClient.subscribe('session_started', (data) => {
        console.log('Session started:', data);
      });

      wsClient.subscribe('payment_confirmed', (data) => {
        console.log('Payment confirmed:', data);
      });

      wsClient.subscribe('alert_triggered', (data) => {
        const alertsStore = useAlertsStore();
        alertsStore.addAlert(data);
      });

      wsClient.subscribe('device_disconnected', (data) => {
        console.log('Device disconnected:', data);
      });

      wsClient.subscribe('kiosk_status_changed', (data) => {
        const kiosksStore = useKiosksStore();
        kiosksStore.updateKioskStatus(data.kioskId, data.status);
      });
    },

    disconnect() {
      wsClient.disconnect();
      this.connected = false;
    }
  }
});
