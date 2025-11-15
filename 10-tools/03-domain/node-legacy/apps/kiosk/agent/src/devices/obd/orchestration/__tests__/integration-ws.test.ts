/**
 * WebSocket Integration Tests for OBD Orchestrator
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, type Server } from 'http';
import { WebSocket } from 'ws';
import express from 'express';
import { createObdRoutes } from '../../../../api/routes/obd.routes.js';
import { ObdWebSocketHandler } from '../../../../api/websocket/obd.websocket.js';
import { FakeObdDevice } from '../../mocks/FakeObdDevice.js';
import { ObdOrchestrator } from '../ObdOrchestrator.js';

function waitForMessage(
  ws: WebSocket,
  type: string,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);

    const handler = (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(message);
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.on('message', handler);
  });
}

describe('OBD Orchestrator WebSocket Integration', () => {
  let server: Server;
  let port: number;
  let orchestrator: ObdOrchestrator;
  let wsHandler: ObdWebSocketHandler;

  before(async () => {
    const driver = new FakeObdDevice({ scenario: 'DtcPresent' }) as any;
    orchestrator = new ObdOrchestrator(driver);

    const app = express();
    app.use(express.json());
    
    const obdRoutes = createObdRoutes();
    app.use(obdRoutes);

    server = createServer(app);
    wsHandler = new ObdWebSocketHandler(server, orchestrator);
    
    return new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    wsHandler.close();
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Connection', () => {
    it('should accept WebSocket connection', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
        
        ws.on('open', () => {
          ws.close();
          resolve();
        });

        ws.on('error', reject);
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    });

    it('should respond to ping with pong', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
        
        ws.on('open', () => {
          ws.ping();
        });

        ws.on('pong', () => {
          ws.close();
          resolve();
        });

        ws.on('error', reject);
        
        setTimeout(() => reject(new Error('Pong timeout')), 5000);
      });
    });
  });

  describe('Status Updates', () => {
    it('should broadcast session-started event', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      await orchestrator.connect();
      
      const messagePromise = waitForMessage(ws, 'status-update', 5000);
      
      await orchestrator.startScan();
      
      const message = await messagePromise;
      
      assert.ok(message);
      assert.strictEqual(message.type, 'status-update');
      assert.ok(message.payload);
      assert.ok(message.payload.sessionId);
      
      ws.close();
    });

    it('should broadcast scan progress updates', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      await orchestrator.connect();
      
      const progressUpdates: any[] = [];
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'status-update' && message.payload.progress !== undefined) {
            progressUpdates.push(message);
          }
        } catch (error) {
          // Ignore
        }
      });

      await orchestrator.startScan();
      
      await new Promise(resolve => setTimeout(resolve, 12000));
      
      assert.ok(progressUpdates.length > 0);
      assert.ok(progressUpdates.some(msg => msg.payload.progress > 0));
      
      ws.close();
    });

    it('should broadcast scan-complete event', async (t) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      await orchestrator.connect();
      
      const completePromise = waitForMessage(ws, 'status-update', 15000);
      
      await orchestrator.startScan();
      
      const message = await completePromise;
      
      assert.ok(message);
      assert.ok(['RESULTS_READY', 'SCANNING'].includes(message.payload.status));
      
      ws.close();
    });
  });

  describe('DTC Clear Events', () => {
    it('should broadcast dtc-cleared event', async (t) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      await orchestrator.connect();
      await orchestrator.startScan();
      
      await new Promise(resolve => setTimeout(resolve, 12000));
      
      const clearPromise = waitForMessage(ws, 'dtc-cleared', 5000);
      
      await orchestrator.clearDtc(true);
      
      const message = await clearPromise;
      
      assert.ok(message);
      assert.strictEqual(message.type, 'dtc-cleared');
      assert.ok(message.payload);
      assert.strictEqual(message.payload.success, true);
      
      ws.close();
    });
  });

  describe('Multiple Clients', () => {
    it('should broadcast to all connected clients', async () => {
      const ws1 = new WebSocket(`ws://localhost:${port}/ws/obd`);
      const ws2 = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await Promise.all([
        new Promise<void>((resolve) => ws1.on('open', resolve)),
        new Promise<void>((resolve) => ws2.on('open', resolve)),
      ]);

      await orchestrator.connect();
      
      const message1Promise = waitForMessage(ws1, 'status-update', 5000);
      const message2Promise = waitForMessage(ws2, 'status-update', 5000);
      
      await orchestrator.startScan();
      
      const [message1, message2] = await Promise.all([
        message1Promise,
        message2Promise,
      ]);
      
      assert.ok(message1);
      assert.ok(message2);
      assert.strictEqual(message1.type, 'status-update');
      assert.strictEqual(message2.type, 'status-update');
      
      ws1.close();
      ws2.close();
    });
  });

  describe('Error Handling', () => {
    it('should broadcast error events', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      let errorReceived = false;
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            errorReceived = true;
          }
        } catch (error) {
          // Ignore
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      ws.close();
    });
  });

  describe('Heartbeat', () => {
    it('should receive heartbeat pings', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/obd`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      let pongReceived = false;
      
      ws.on('ping', () => {
        pongReceived = true;
      });

      await new Promise(resolve => setTimeout(resolve, 35000));
      
      assert.ok(pongReceived, 'Should receive heartbeat ping within 35 seconds');
      
      ws.close();
    });
  });
});
