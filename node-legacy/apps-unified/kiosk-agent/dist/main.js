/**
 * Kiosk Agent Main Entry Point - Unified Project Version
 *
 * This is a simplified main entry point for testing the unified project structure.
 * It creates a basic HTTP server to test that the workspace setup is working.
 */
import * as http from 'http';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createObdRoutes } from './api/routes/obd.routes.js';
import { createAdminRoutes } from './api/routes/admin.routes.js';
import { createObdHealthRoutes } from './api/routes/obd-health.routes.js';
import { createObdPaymentRoutes } from './api/routes/obd-payment.routes.js';
import { createObdReportRoutes } from './api/routes/obd-report.routes.js';
import { obdConnectionManager } from './devices/obd/ObdConnectionManager.js';
import { LockController } from './locks/LockController.js';
import { PaymentModule } from './payments/module.js';
import { ObdPaymentAdapter } from './integrations/obd/payment-adapter.js';
export class KioskAgent {
    constructor(config) {
        this.config = config;
    }
    async start() {
        const envPort = Number(process.env.AGENT_PORT || process.env.PORT || '');
        // Дефолт на 7081 для dev-среды (согласовано с админкой)
        const port = this.config.port || (Number.isFinite(envPort) && envPort > 0 ? envPort : 7081);
        // Express app
        const app = express();
        this.app = app;
        // Security headers
        app.use(helmet());
        // HTTP request log (DEV)
        app.use(morgan('dev'));
        // Simple CORS (DEV): широкие разрешения и эхо запрошенных заголовков
        app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            const acrh = req.headers['access-control-request-headers'] || 'Content-Type, Authorization, Accept, X-Requested-With';
            res.setHeader('Access-Control-Allow-Headers', acrh);
            // Для кросс-доменных запросов из браузера — быстрый ответ на preflight
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }
            next();
        });
        app.use(express.json());
        // Simple token protection for API routes (except health/status/auth ping/login)
        const allowlist = new Set([
            '/api/health',
            '/api/status',
            '/api/auth/ping',
            '/api/auth/login',
            // OBD health endpoints should be probeable without API key
            '/api/obd/health',
            '/api/obd/health/ready',
            '/api/obd/health/live',
        ]);
        const apiKeyEnv = (process.env.AGENT_API_KEY || '').trim();
        const env = this.config.env;
        let effectiveApiKey = apiKeyEnv;
        if (!effectiveApiKey) {
            if (env === 'DEV') {
                effectiveApiKey = 'dev-local-key';
                console.warn('[security] AGENT_API_KEY not set; using DEV default key: dev-local-key');
            }
            else {
                console.warn('[security] AGENT_API_KEY is not set. API will reject protected endpoints.');
            }
        }
        app.use((req, res, next) => {
            // Only guard /api/* paths that are not allowlisted
            if (!req.path.startsWith('/api/'))
                return next();
            if (allowlist.has(req.path))
                return next();
            // Accept key from header 'x-api-key'
            const headerKey = req.headers['x-api-key']?.trim();
            if (!effectiveApiKey) {
                return res.status(401).json({ error: 'unauthorized', message: 'API key not configured' });
            }
            if (!headerKey || headerKey !== effectiveApiKey) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            next();
        });
        // Basic health/status
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                env: this.config.env,
                timestamp: new Date().toISOString(),
                workspace: 'unified',
            });
        });
        // Back-compat and consistency with docs: /api/health
        app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                env: this.config.env,
                timestamp: new Date().toISOString(),
                workspace: 'unified',
            });
        });
        app.get('/api/status', (req, res) => {
            res.json({
                agent: 'kiosk-agent',
                version: '1.0.0-unified',
                env: this.config.env,
                ready: true,
            });
        });
        // Quick ping for auth route availability
        app.get('/api/auth/ping', (_req, res) => {
            res.json({ ok: true, timestamp: new Date().toISOString() });
        });
        // Mount routes
        // Core admin/auth
        app.use(createAdminRoutes());
        // Diagnostics core API (status/connect/dtc/pids/clear)
        app.use(createObdRoutes());
        // Health for diagnostics (mounted under /api/obd to match documented paths)
        const lockController = new LockController([
            { deviceType: 'obd', driverType: 'mock', autoCloseMs: 300000 },
        ]);
        app.use('/api/obd', createObdHealthRoutes(obdConnectionManager, lockController));
        // Payments for diagnostics (DEV uses in-memory provider via PaymentModule)
        const paymentsEnv = this.config.env;
        const paymentsModule = new PaymentModule(paymentsEnv);
        const obdPaymentAdapter = new ObdPaymentAdapter(paymentsModule);
        app.use(createObdPaymentRoutes(obdPaymentAdapter));
        // Reports for diagnostics
        app.use(createObdReportRoutes());
        // SSE stub for dev
        app.get('/api/events', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();
            res.write(`event: ping\n`);
            res.write(`data: {"ok":true,"ts":"${new Date().toISOString()}"}\n\n`);
            const interval = setInterval(() => {
                res.write(`event: ping\n`);
                res.write(`data: {"ok":true,"ts":"${new Date().toISOString()}"}\n\n`);
            }, 15000);
            req.on('close', () => clearInterval(interval));
        });
        // Fallback 404
        app.use((req, res) => {
            res.status(404).json({ error: 'not_found' });
        });
        this.server = http.createServer(app);
        // Пытаемся подключить Socket.IO динамически (опционально)
        try {
            // @ts-ignore: optional dependency may be absent in type resolution
            const mod = await import('socket.io');
            const SocketIOServer = mod.Server;
            this.io = new SocketIOServer(this.server, {
                cors: { origin: '*', methods: ['GET', 'POST'] }
            });
            this.io.on('connection', (socket) => {
                console.log('[io] client connected', socket.id);
                socket.on('disconnect', (reason) => {
                    console.log('[io] client disconnected', socket.id, reason);
                });
            });
            setInterval(() => {
                try {
                    this.io?.emit('ping', { ts: new Date().toISOString() });
                }
                catch (e) {
                    console.debug('[io] emit error', e?.message);
                }
            }, 20000);
            console.log('[io] Socket.IO enabled');
        }
        catch {
            console.debug('[io] socket.io not installed; WS channel disabled');
        }
        this.server.listen(port, '127.0.0.1', () => {
            console.log(`Kiosk Agent listening on http://127.0.0.1:${port}`);
        });
        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
    shutdown() {
        console.log('\nShutting down Kiosk Agent...');
        if (this.server) {
            this.server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        }
    }
}
// Start the agent if this file is run directly
console.log('Starting Kiosk Agent...');
console.log('Module URL:', import.meta.url);
console.log('Process argv[1]:', process.argv[1]);
const env = process.env.AGENT_ENV || 'DEV';
console.log('Environment:', env);
const agent = new KioskAgent({
    env,
    logLevel: 'info',
    // Дефолт на 7081
    port: Number(process.env.AGENT_PORT || process.env.PORT || '7081')
});
console.log('Calling agent.start()...');
agent.start();
