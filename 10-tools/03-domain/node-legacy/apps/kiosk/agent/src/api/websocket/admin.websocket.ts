import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

export class AdminWebSocketHandler {
  private io: SocketIOServer;
  private obdUnsubscribe?: () => void;
  private obdEventUnsubscribe?: () => void;

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      path: '/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('[admin-ws] Client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('[admin-ws] Client disconnected:', socket.id);
      });

      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  // Broadcast events to all connected clients
  broadcastSessionStarted(sessionId: string, type: string, kioskId: string) {
    this.io.emit('session_started', {
      sessionId,
      type,
      kioskId,
      startedAt: new Date().toISOString()
    });
  }

  broadcastPaymentConfirmed(paymentId: string, sessionId: string, amount: number) {
    this.io.emit('payment_confirmed', {
      paymentId,
      sessionId,
      amount,
      timestamp: new Date().toISOString()
    });
  }

  broadcastAlertTriggered(alertId: string, severity: string, name: string, description: string) {
    this.io.emit('alert_triggered', {
      alertId,
      severity,
      name,
      description,
      status: 'active',
      timestamp: new Date().toISOString()
    });
  }

  broadcastDeviceDisconnected(device: string, kioskId: string) {
    this.io.emit('device_disconnected', {
      device,
      kioskId,
      timestamp: new Date().toISOString()
    });
  }

  broadcastKioskStatusChanged(kioskId: string, status: string) {
    this.io.emit('kiosk_status_changed', {
      kioskId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  close() {
    if (this.obdUnsubscribe) {
      try { this.obdUnsubscribe(); } catch { /* ignore */ }
      this.obdUnsubscribe = undefined;
    }
    if (this.obdEventUnsubscribe) {
      try { this.obdEventUnsubscribe(); } catch { /* ignore */ }
      this.obdEventUnsubscribe = undefined;
    }
    this.io.close();
  }

  /** Подключить поток OBD снапшотов к админ-панели */
  registerObdSnapshotStream(register: (listener: (snapshot: any) => void) => () => void) {
    if (this.obdUnsubscribe) {
      try { this.obdUnsubscribe(); } catch { /* ignore */ }
      this.obdUnsubscribe = undefined;
    }
    this.obdUnsubscribe = register((snapshot) => {
      this.io.emit('obd_snapshot', snapshot);
    });
  }

  /** Подключить поток событий истории соединения OBD */
  registerObdEventStream(register: (listener: (event: any) => void) => () => void) {
    if (this.obdEventUnsubscribe) {
      try { this.obdEventUnsubscribe(); } catch { /* ignore */ }
      this.obdEventUnsubscribe = undefined;
    }
    this.obdEventUnsubscribe = register((event) => {
      this.io.emit('obd_event', event);
    });
  }
}
