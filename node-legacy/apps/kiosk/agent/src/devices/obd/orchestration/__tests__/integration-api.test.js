/**
 * REST API Integration Tests for OBD Orchestrator
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import express from 'express';
import { createObdRoutes } from '../../../../api/routes/obd.routes.js';
function request(server, method, path, body) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        if (!address || typeof address === 'string') {
            reject(new Error('Server not listening'));
            return;
        }
        const port = address.port;
        const options = {
            hostname: 'localhost',
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const req = require('http').request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedBody = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, body: parsedBody });
                }
                catch (error) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
describe('OBD Orchestrator REST API Integration', () => {
    let server;
    let port;
    before(async () => {
        const app = express();
        app.use(express.json());
        const obdRoutes = createObdRoutes();
        app.use(obdRoutes);
        server = createServer(app);
        return new Promise((resolve) => {
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
        return new Promise((resolve) => {
            server.close(() => resolve());
        });
    });
    describe('POST /api/obd/orchestrator/connect', () => {
        it('should connect to adapter', async () => {
            const res = await request(server, 'POST', '/api/obd/orchestrator/connect');
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.status);
            assert.strictEqual(res.body.status, 'connected');
        });
    });
    describe('GET /api/obd/orchestrator/status', () => {
        it('should return current status', async () => {
            const res = await request(server, 'GET', '/api/obd/orchestrator/status');
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.currentStatus);
            assert.ok(typeof res.body.progress === 'number');
            assert.ok(res.body.message);
        });
    });
    describe('POST /api/obd/orchestrator/scan', () => {
        it('should start scan and return session ID', async () => {
            await request(server, 'POST', '/api/obd/orchestrator/connect');
            const res = await request(server, 'POST', '/api/obd/orchestrator/scan', {
                vehicleMake: 'Toyota',
                vehicleModel: 'Camry',
            });
            assert.strictEqual(res.status, 202);
            assert.ok(res.body.sessionId);
            assert.strictEqual(res.body.status, 'scanning');
        });
        it('should accept scan without metadata', async () => {
            await request(server, 'POST', '/api/obd/orchestrator/connect');
            const res = await request(server, 'POST', '/api/obd/orchestrator/scan', {});
            assert.strictEqual(res.status, 202);
            assert.ok(res.body.sessionId);
        });
    });
    describe('GET /api/obd/orchestrator/results/:sessionId', () => {
        it('should return 404 for non-existent session', async () => {
            const res = await request(server, 'GET', '/api/obd/orchestrator/results/non-existent-id');
            assert.strictEqual(res.status, 404);
            assert.ok(res.body.error);
        });
        it('should return session results', async (t) => {
            await request(server, 'POST', '/api/obd/orchestrator/connect');
            const scanRes = await request(server, 'POST', '/api/obd/orchestrator/scan', {
                vehicleMake: 'Toyota',
            });
            const sessionId = scanRes.body.sessionId;
            await new Promise(resolve => setTimeout(resolve, 12000));
            const res = await request(server, 'GET', `/api/obd/orchestrator/results/${sessionId}`);
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.session);
            assert.strictEqual(res.body.session.sessionId, sessionId);
            assert.ok(Array.isArray(res.body.session.dtcList));
            assert.ok(Array.isArray(res.body.session.pidSnapshots));
        });
    });
    describe('POST /api/obd/orchestrator/clear-dtc', () => {
        it('should reject without confirmation', async () => {
            const res = await request(server, 'POST', '/api/obd/orchestrator/clear-dtc', {
                confirm: false,
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error);
        });
        it('should clear DTC with confirmation', async (t) => {
            await request(server, 'POST', '/api/obd/orchestrator/connect');
            const scanRes = await request(server, 'POST', '/api/obd/orchestrator/scan');
            await new Promise(resolve => setTimeout(resolve, 12000));
            const res = await request(server, 'POST', '/api/obd/orchestrator/clear-dtc', {
                confirm: true,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.timestamp);
        });
    });
    describe('POST /api/obd/orchestrator/disconnect', () => {
        it('should disconnect from adapter', async () => {
            await request(server, 'POST', '/api/obd/orchestrator/connect');
            const res = await request(server, 'POST', '/api/obd/orchestrator/disconnect');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.status, 'disconnected');
        });
    });
    describe('Full workflow', () => {
        it('should complete full diagnostic flow', async (t) => {
            let sessionId;
            const connectRes = await request(server, 'POST', '/api/obd/orchestrator/connect');
            assert.strictEqual(connectRes.status, 200);
            const statusRes1 = await request(server, 'GET', '/api/obd/orchestrator/status');
            assert.strictEqual(statusRes1.status, 200);
            assert.ok(['CONNECTED', 'IDLE'].includes(statusRes1.body.currentStatus));
            const scanRes = await request(server, 'POST', '/api/obd/orchestrator/scan', {
                vehicleMake: 'Toyota',
                vehicleModel: 'Camry',
            });
            assert.strictEqual(scanRes.status, 202);
            sessionId = scanRes.body.sessionId;
            const statusRes2 = await request(server, 'GET', '/api/obd/orchestrator/status');
            assert.strictEqual(statusRes2.status, 200);
            assert.strictEqual(statusRes2.body.currentStatus, 'SCANNING');
            await new Promise(resolve => setTimeout(resolve, 12000));
            const statusRes3 = await request(server, 'GET', '/api/obd/orchestrator/status');
            assert.strictEqual(statusRes3.status, 200);
            assert.strictEqual(statusRes3.body.currentStatus, 'RESULTS_READY');
            const resultsRes = await request(server, 'GET', `/api/obd/orchestrator/results/${sessionId}`);
            assert.strictEqual(resultsRes.status, 200);
            assert.ok(resultsRes.body.session.dtcList.length >= 0);
            const clearRes = await request(server, 'POST', '/api/obd/orchestrator/clear-dtc', {
                confirm: true,
            });
            assert.strictEqual(clearRes.status, 200);
            assert.strictEqual(clearRes.body.success, true);
            const disconnectRes = await request(server, 'POST', '/api/obd/orchestrator/disconnect');
            assert.strictEqual(disconnectRes.status, 200);
        });
    });
});
