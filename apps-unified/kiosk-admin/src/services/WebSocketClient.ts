import { io, Socket } from 'socket.io-client';

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(url: string) {
    // url может быть origin (http://host:port) для socket.io
    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  subscribe(event: string, callback: (data: any) => void) {
    if (!this.socket) {
      console.warn('WebSocket not connected, cannot subscribe to', event);
      return;
    }
    this.socket.on(event, callback);
  }

  unsubscribe(event: string, callback?: (data: any) => void) {
    if (!this.socket) return;
    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  emit(event: string, data: any) {
    if (!this.socket) {
      console.warn('WebSocket not connected, cannot emit', event);
      return;
    }
    this.socket.emit(event, data);
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }
}

export const wsClient = new WebSocketClient();
