import { getWsUrl } from './config.js';

class DeviceStatusManager {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.listeners = new Map();
    this.isConnected = false;
  }

  connect() {
    if (this.ws) {
      return;
    }

    try {
      const wsUrl = getWsUrl('/ws/obd');
      this.ws = new WebSocket(wsUrl);

      this.ws.addEventListener('open', () => {
        console.log('[device-status] WebSocket connected');
        this.isConnected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('[device-status] Failed to parse message:', e);
        }
      });

      this.ws.addEventListener('close', () => {
        console.log('[device-status] WebSocket closed');
        this.isConnected = false;
        this.ws = null;
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', (error) => {
        console.error('[device-status] WebSocket error:', error);
      });
    } catch (e) {
      console.error('[device-status] Failed to connect:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  handleMessage(message) {
    if (message.type === 'status-update' && message.payload) {
      this.updateDeviceUI(message.payload);
      
      this.listeners.forEach(listener => {
        try {
          listener(message.payload);
        } catch (e) {
          console.error('[device-status] Listener error:', e);
        }
      });
    }
  }

  updateDeviceUI(payload) {
    const elements = document.querySelectorAll('[data-device="obd"]');
    
    elements.forEach(el => {
      if (payload.status) {
        el.setAttribute('data-status', payload.status);
      }
      if (typeof payload.progress === 'number') {
        el.setAttribute('data-progress', payload.progress);
      }
      
      const statusText = el.querySelector('.status-text');
      if (statusText && payload.message) {
        statusText.textContent = payload.message;
      }
    });
  }

  subscribe(callback) {
    const id = Math.random().toString(36).slice(2);
    this.listeners.set(id, callback);
    return () => this.listeners.delete(id);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isConnected = false;
  }
}

export const deviceStatus = new DeviceStatusManager();

export function initDeviceStatus() {
  deviceStatus.connect();
  console.log('[device-status] Device status initialized');
}
