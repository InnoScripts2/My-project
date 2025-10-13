import { Server as SocketIOServer } from 'socket.io';
export class AdminWebSocketHandler {
    io;
    constructor(server) {
        this.io = new SocketIOServer(server, {
            path: '/socket.io',
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
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
    broadcastSessionStarted(sessionId, type, kioskId) {
        this.io.emit('session_started', {
            sessionId,
            type,
            kioskId,
            startedAt: new Date().toISOString()
        });
    }
    broadcastPaymentConfirmed(paymentId, sessionId, amount) {
        this.io.emit('payment_confirmed', {
            paymentId,
            sessionId,
            amount,
            timestamp: new Date().toISOString()
        });
    }
    broadcastAlertTriggered(alertId, severity, name, description) {
        this.io.emit('alert_triggered', {
            alertId,
            severity,
            name,
            description,
            status: 'active',
            timestamp: new Date().toISOString()
        });
    }
    broadcastDeviceDisconnected(device, kioskId) {
        this.io.emit('device_disconnected', {
            device,
            kioskId,
            timestamp: new Date().toISOString()
        });
    }
    broadcastKioskStatusChanged(kioskId, status) {
        this.io.emit('kiosk_status_changed', {
            kioskId,
            status,
            timestamp: new Date().toISOString()
        });
    }
    close() {
        this.io.close();
    }
}
