import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { obdConnectionManager } from '../../devices/obd/ObdConnectionManager.js';
import type { ObdOrchestrator, OrchestratorStatus } from '../../devices/obd/orchestration/ObdOrchestrator.js';

interface ClientConnection {
  ws: WebSocket;
  lastSendTime: number;
  messageCount: number;
}

const THROTTLE_INTERVAL_MS = 100;
const MAX_MESSAGES_PER_SECOND = 10;
const HEARTBEAT_INTERVAL_MS = 30000;

export class ObdWebSocketHandler {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientConnection>();
  private heartbeatTimer?: NodeJS.Timeout;
  private orchestrator?: ObdOrchestrator;

  constructor(server: HttpServer, orchestrator?: ObdOrchestrator) {
    this.orchestrator = orchestrator;
    this.wss = new WebSocketServer({
      server,
      path: '/ws/obd'
    });

    // Безопасная обработка ошибок сервера, чтобы не падать на EADDRINUSE и подобных
    this.wss.on('error', (err) => {
      try {
        console.warn('[obd-websocket] server error:', err instanceof Error ? err.message : String(err));
      } catch {
        // ignore logging failures
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.startHeartbeat();
    this.setupOrchestratorListeners();
  }

  private setupOrchestratorListeners(): void {
    if (!this.orchestrator) return;

    this.orchestrator.on('session-started', (sessionId: string) => {
      this.broadcastToAll({
        type: 'status-update',
        payload: {
          status: 'SCANNING',
          sessionId,
          progress: 0,
          message: 'Scan started',
        },
      });
    });

    this.orchestrator.on('scan-progress', (progress: number, message: string) => {
      const status = this.orchestrator?.getStatus();
      if (status) {
        this.broadcastToAll({
          type: 'status-update',
          payload: {
            ...status,
            progress,
            message,
          },
        });
      }
    });

    this.orchestrator.on('scan-complete', (sessionId: string) => {
      this.broadcastToAll({
        type: 'status-update',
        payload: {
          status: 'RESULTS_READY',
          sessionId,
          progress: 100,
          message: 'Scan complete',
        },
      });
    });

    this.orchestrator.on('dtc-cleared', (sessionId: string, success: boolean) => {
      this.broadcastToAll({
        type: 'dtc-cleared',
        payload: {
          sessionId,
          success,
          timestamp: new Date().toISOString(),
        },
      });
    });

    this.orchestrator.on('error', (error: Error) => {
      this.broadcastToAll({
        type: 'error',
        payload: {
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    });
  }

  private broadcastToAll(message: any): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('[obd-websocket] broadcast error:', error);
        }
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    const snapshot = obdConnectionManager.getSnapshot();

    if (snapshot.state !== 'connected') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'OBD not connected',
      }));
      ws.close();
      return;
    }

    const client: ClientConnection = {
      ws,
      lastSendTime: 0,
      messageCount: 0,
    };

    this.clients.set(ws, client);

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to OBD stream',
    }));

    ws.on('pong', () => {
      const clientData = this.clients.get(ws);
      if (clientData) {
        clientData.lastSendTime = Date.now();
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[obd-websocket] client error:', error);
      this.clients.delete(ws);
    });

    this.startStreamingPids(client);
  }

  private startStreamingPids(client: ClientConnection): void {
    const pidNames = [
      'Engine RPM',
      'Vehicle Speed',
      'Coolant Temperature',
      'Engine Load',
      'Throttle Position',
      'Battery Voltage',
    ];

    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      const snapshot = obdConnectionManager.getSnapshot();

      if (snapshot.state !== 'connected' || client.ws.readyState !== WebSocket.OPEN) {
        clearInterval(streamInterval);
        return;
      }

      const now = Date.now();
      const timeSinceLastSend = now - client.lastSendTime;

      if (timeSinceLastSend < THROTTLE_INTERVAL_MS) {
        return;
      }

      const messagesInLastSecond = client.messageCount;
      if (messagesInLastSecond >= MAX_MESSAGES_PER_SECOND) {
        return;
      }

      const pidName = pidNames[currentIndex];
      const value = this.generateMockPidValue(pidName);

      const message = {
        type: 'pid_update',
        data: {
          name: pidName,
          value,
          unit: this.getPidUnit(pidName),
          timestamp: new Date().toISOString(),
        },
      };

      try {
        client.ws.send(JSON.stringify(message));
        client.lastSendTime = now;
        client.messageCount += 1;

        setTimeout(() => {
          client.messageCount = Math.max(0, client.messageCount - 1);
        }, 1000);
      } catch (error) {
        console.error('[obd-websocket] send error:', error);
        clearInterval(streamInterval);
      }

      currentIndex = (currentIndex + 1) % pidNames.length;
    }, THROTTLE_INTERVAL_MS);

    client.ws.on('close', () => {
      clearInterval(streamInterval);
    });
  }

  private generateMockPidValue(pidName: string): number {
    switch (pidName) {
      case 'Engine RPM':
        return Math.floor(Math.random() * 1000) + 800;
      case 'Vehicle Speed':
        return Math.floor(Math.random() * 60);
      case 'Coolant Temperature':
        return Math.floor(Math.random() * 20) + 80;
      case 'Engine Load':
        return Math.floor(Math.random() * 40) + 20;
      case 'Throttle Position':
        return Math.floor(Math.random() * 30) + 10;
      case 'Battery Voltage':
        return 12.0 + Math.random() * 2.0;
      default:
        return 0;
    }
  }

  private getPidUnit(pidName: string): string {
    const units: Record<string, string> = {
      'Engine RPM': 'rpm',
      'Vehicle Speed': 'km/h',
      'Coolant Temperature': '°C',
      'Engine Load': '%',
      'Throttle Position': '%',
      'Battery Voltage': 'V',
    };
    return units[pidName] || '';
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          this.clients.delete(ws);
        }
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.wss.close();
  }
}
