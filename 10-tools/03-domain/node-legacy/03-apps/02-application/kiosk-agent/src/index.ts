import express, { Request, Response } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runObdSelfCheck, selfCheckPassed, type ObdSelfCheckReport } from './devices/obd/ObdSelfCheck.js';
import { SelfCheckLogger, buildObdSelfCheckEntry, type SelfCheckOrigin } from './selfcheck/index.js';
import { z } from 'zod';
import { PaymentModule } from './payments/module.js';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { createPaymentsPrometheusCollector } from './payments/prometheus.js';
import { evaluateAlerts } from './monitoring/alerts.js';
import { thicknessManager, type ThkVehicleType, getPointsTemplate } from './devices/thickness/ThicknessManager.js';
import { InMemoryStore } from './storage/InMemoryStore.js';
import { PostgresStore } from './storage/PostgresStore.js';
import type { PersistenceStore } from './storage/types.js';
import { obdConnectionManager, type ObdConnectOptions, type ObdConnectionSnapshot } from './devices/obd/ObdConnectionManager.js';
import type { ObdResult, ObdDtc, ObdStatus, ObdLiveData } from './devices/obd/KingbolenEdiagDriver.js';
import { KingbolenEdiagDriver } from './devices/obd/KingbolenEdiagDriver.js';
import { parseObdConnectPayload, formatObdError } from './devices/obd/connectOptions.js';
import { diagnosticSessionManager, type DiagnosticOperation } from './devices/obd/DiagnosticSessionManager.js';
import { writeReportToOutbox, resolveReportHtmlPathById, simulateSend } from './reports/service.js';
import { getMailConfigFromEnv, sendReportEmail } from './reports/mailer.js';
import { getSmsConfigFromEnv, sendSms } from './reports/sms.js';
import { buildPayloadFromDtc, fetchAiInsights, type AiInsightsResponse } from './ai/assistant.js';
import { checkReadiness, checkHealth, checkLiveness } from './health/healthCheck.js';
import { HeartbeatLogger } from './health/HeartbeatLogger.js';
import { LockController, DefaultDeviceDispensePolicy, PermissiveDeviceDispensePolicy, type LockConfig } from './locks/index.js';
import { obdSessionManager } from './integrations/obd/session-manager.js';
import { ObdPaymentAdapter } from './integrations/obd/payment-adapter.js';
import { createObdPaymentRoutes } from './api/routes/obd-payment.routes.js';
import { createObdReportRoutes } from './api/routes/obd-report.routes.js';
import { createReportsRoutes } from './api/routes/reports.routes.js';
import { createMediaRoutes } from './media/routes/media.routes.js';
import { cleanupTask } from './integrations/obd/cleanup-task.js';
import { reportCleanupTask } from './reports/cleanup-task.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Import API routes
import {
  rateLimitMiddleware,
  createPaymentIntentRoute,
  getPaymentIntentRoute,
  cancelPaymentIntentRoute,
  confirmPaymentIntentRoute,
  openLockRoute,
  getLockStatusRoute,
  emergencyCloseAllLocksRoute
} from './api/routes.js';

// Apply rate limiting middleware to all routes
app.use(rateLimitMiddleware);

const agentEnv: Env = normalizeEnvironment(process.env.AGENT_ENV);
const paymentModule = new PaymentModule(agentEnv);
const obdPaymentAdapter = new ObdPaymentAdapter(paymentModule);
// Persistence (feature flag: AGENT_PERSISTENCE=memory|pg|supabase)
async function createPersistenceStore(): Promise<PersistenceStore> {
  const mode = String(process.env.AGENT_PERSISTENCE || 'memory').toLowerCase();
  if (mode === 'pg') {
    try {
      console.info('[persistence] using PostgresStore');
      return new PostgresStore();
    } catch (err) {
      console.warn('[persistence] failed to init PostgresStore, fallback to InMemoryStore:', err);
      return new InMemoryStore();
    }
  }
  if (mode === 'supabase') {
    try {
      console.info('[persistence] using SupabaseStore');
      const supabaseModule = await import('./storage/SupabaseStore.js');
      const StoreCtor = supabaseModule.SupabaseStore;
      return new StoreCtor();
    } catch (err) {
      console.warn('[persistence] failed to init SupabaseStore, fallback to InMemoryStore:', err);
      return new InMemoryStore();
    }
  }
  return new InMemoryStore();
}
const store: PersistenceStore = await createPersistenceStore();

// Metrics registry and collectors
import { getCycle2Metrics } from './metrics/cycle2.js';
import { createSecurityMetrics } from './security/metrics.js';
import { createSecurityRoutes } from './security/routes.js';
const metricsRegistry = new Registry();
// Не включаем дефолтные метрики Prometheus в тестовой среде, чтобы не держать event loop
function isTestLikeRuntime(): boolean {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'test' || nodeEnv === 'testing') return true;
  try {
    if (Array.isArray(process.argv) && process.argv.some((a) => typeof a === 'string' && a.includes('--test'))) {
      return true;
    }
  } catch {
    // noop
  }
  return false;
}
if (!isTestLikeRuntime()) {
  collectDefaultMetrics({ register: metricsRegistry });
}
const paymentsPromCollector = createPaymentsPrometheusCollector(paymentModule, { register: metricsRegistry });
const cycle2Metrics = getCycle2Metrics(metricsRegistry);
const securityMetrics = createSecurityMetrics(metricsRegistry);
// Register Supabase metrics if using Supabase persistence (lazy import)
if (String(process.env.AGENT_PERSISTENCE || 'memory').toLowerCase() === 'supabase') {
  try {
    const supabaseModule = await import('./storage/SupabaseStore.js');
    metricsRegistry.registerMetric(supabaseModule.supabaseOperations);
    metricsRegistry.registerMetric(supabaseModule.supabaseOperationDuration);
    metricsRegistry.registerMetric(supabaseModule.supabaseRetries);
  } catch (err) {
    console.warn('[metrics] failed to register Supabase metrics:', err);
  }
}
const selfCheckLogger = new SelfCheckLogger();

// Lock Controller: управление замками выдачи устройств
function createLockController(): LockController {
  const lockConfigsRaw = process.env.LOCK_CONFIGS;
  let configs: LockConfig[] = [];

  if (lockConfigsRaw) {
    try {
      configs = JSON.parse(lockConfigsRaw);
    } catch (err) {
      console.warn('[locks] Не удалось распарсить LOCK_CONFIGS, используем дефолтные mock-замки:', err);
    }
  }

  // Дефолтная конфигурация для DEV: mock-замки
  if (configs.length === 0) {
    configs = [
      { deviceType: 'thickness', driverType: 'mock', autoCloseMs: 30000 },
      { deviceType: 'obd', driverType: 'mock', autoCloseMs: 30000 },
    ];
  }

  // Выбираем политику: в DEV - пермиссивная, в PROD/QA - дефолтная
  const policy = agentEnv === 'DEV'
    ? new PermissiveDeviceDispensePolicy()
    : new DefaultDeviceDispensePolicy();

  return new LockController(configs, policy);
}
const lockController = createLockController();

// AI insights: in-memory cache and helpers
const aiCache: { insights?: AiInsightsResponse; signature?: string; capturedAt?: string } = {};
function isInternalRequest(req: Request): boolean {
  try {
    const hdr = String(req.header('x-internal-request') || '').toLowerCase();
    if (hdr === '1' || hdr === 'true') return true;
    // Accept localhost/loopback
    const ip = String((req.ip || '')).replace('::ffff:', '');
    return ip === '127.0.0.1' || ip === '::1' || req.hostname === 'localhost';
  } catch {
    return false;
  }
}
function canUseAiInCurrentEnv(): boolean {
  const env = agentEnv;
  if (env === 'PROD') return String(process.env.AI_ENABLE_IN_PROD || '').toLowerCase() === 'true';
  return true;
}
function computeDtcSignature(dtc: any[], status?: any): string {
  try {
    const codes = Array.isArray(dtc) ? dtc.map((d: any) => d?.code || '').filter(Boolean).sort() : [];
    const mil = status && (typeof status.milOn !== 'undefined' ? `milOn:${String(status.milOn)}` : (typeof status.mil !== 'undefined' ? `mil:${String(status.mil)}` : ''));
    return `${codes.join(',')}|${mil}`;
  } catch {
    return `${Date.now()}`;
  }
}

// Simple static UI for quick test
app.use('/', express.static(path.join(__dirname, 'public')));

// Basic health for integrations
app.get('/health/integrations', async (_req: Request, res: Response) => {
  const result: any = {
    ok: true,
    checks: {}
  };

  // Check Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && (supabaseKey || supabaseServiceKey)) {
    try {
      const start = Date.now();
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3000);

      const healthUrl = new URL('/rest/v1/', supabaseUrl).toString();
      const response = await fetch(healthUrl, {
        method: 'HEAD',
        signal: ctrl.signal,
        headers: {
          'apikey': supabaseKey || supabaseServiceKey || ''
        }
      } as any);

      clearTimeout(timeout);
      const latency = Date.now() - start;

      if (response.status < 500) {
        result.checks.supabase = {
          status: 'ok',
          latency,
          serviceKeyConfigured: Boolean(supabaseServiceKey)
        };
      } else {
        result.checks.supabase = {
          status: 'error',
          error: `HTTP ${response.status}`,
          latency
        };
        result.ok = false;
      }
    } catch (error: any) {
      result.checks.supabase = {
        status: 'error',
        error: error.message || 'Connection failed'
      };
      result.ok = false;
    }
  } else {
    result.checks.supabase = { status: 'not_configured' };
  }

  // Check Edge Function
  const edgeFuncUrl = supabaseUrl ? new URL('/functions/v1/ai-chat', supabaseUrl).toString() : undefined;
  if (edgeFuncUrl) {
    try {
      const start = Date.now();
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 2000);

      const response = await fetch(edgeFuncUrl, { method: 'OPTIONS', signal: ctrl.signal } as any);
      clearTimeout(timeout);
      const latency = Date.now() - start;

      if (response.ok || response.status === 200 || response.status === 204) {
        result.checks.edgeFunction = { status: 'ok', latency };
      } else {
        result.checks.edgeFunction = {
          status: 'error',
          error: `HTTP ${response.status}`,
          latency
        };
      }
    } catch (error: any) {
      result.checks.edgeFunction = {
        status: 'error',
        error: error.message || 'Connection failed'
      };
    }
  } else {
    result.checks.edgeFunction = { status: 'not_configured' };
  }

  res.status(result.ok ? 200 : 503).json(result);
});

let lastObdSelfCheck: { ok: boolean; report: ObdSelfCheckReport; timestamp: string; logEntryId?: string; snapshot: ObdConnectionSnapshot } | null = null;

const createIntentSchema = z.object({
  amount: z.preprocess(v => typeof v === 'string' ? Number(v) : v, z.number().positive('amount must be > 0')),
  currency: z.preprocess(v => typeof v === 'string' ? v : v ?? 'RUB', z.string().min(1)).default('RUB'),
  meta: z.record(z.unknown()).optional()
});

const intentIdSchema = z.object({
  id: z.string().min(1)
});

const manualConfirmSchema = intentIdSchema.extend({
  operatorId: z.string().min(1),
  note: z.string().max(500).optional(),
  meta: z.record(z.unknown()).optional()
});

app.get('/devices/status', (_req: Request, res: Response) => {
  const snapshot = obdConnectionManager.getSnapshot();
  const obdState = snapshot.state === 'connected'
    ? 'connected'
    : snapshot.state === 'connecting'
      ? 'connecting'
      : 'disconnected';
  const thk = thicknessManager.getSnapshot();
  const thkState = thk.state === 'connected' ? 'connected' : thk.state === 'connecting' ? 'connecting' : 'disconnected';

  res.json({
    status: {
      obd: obdState,
      thickness: thkState,
    },
    snapshot,
    diagnostics: diagnosticSessionManager.getSnapshot(),
  });
});

app.get('/api/serialports', async (_req: Request, res: Response) => {
  try {
    const sp = await import('serialport');
    const ports = await (sp as any).SerialPort.list();
    res.json((ports as any[]).map((p: any) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? null,
      friendlyName: p.friendlyName ?? null,
      productId: p.productId ?? null,
      vendorId: p.vendorId ?? null,
    })));
  } catch (e: any) {
    res.status(500).json({ error: 'serialport_not_available', details: e?.message || String(e) });
  }
});

// Thickness API (DEV skeleton; no data simulation in PROD)
app.get('/api/thk/snapshot', (_req: Request, res: Response) => {
  res.json({ ok: true, snapshot: thicknessManager.getSnapshot() });
});

app.post('/api/thk/open', async (req: Request, res: Response) => {
  try {
    const type = String((req.body?.type ?? '') as string).trim() as ThkVehicleType;
    const okType = type === 'sedan' || type === 'hatchback' || type === 'minivan';
    const deviceName = typeof req.body?.deviceName === 'string' ? req.body.deviceName : undefined;
    const serviceUuid = typeof req.body?.serviceUuid === 'string' ? req.body.serviceUuid : undefined;
    const cfg = { deviceName, serviceUuid };
    const result = await thicknessManager.open({ vehicleType: okType ? type : 'sedan', ble: cfg });
    res.status(result.ok ? 200 : 503).json({ ok: result.ok, error: result.ok ? undefined : result.error, snapshot: thicknessManager.getSnapshot() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'thk_open_failed', message: e?.message || String(e) });
  }
});

app.get('/api/thk/points-template', (req: Request, res: Response) => {
  const type = String((req.query?.type ?? '') as string).trim() as ThkVehicleType;
  const okType = type === 'sedan' || type === 'hatchback' || type === 'minivan' ? type : 'sedan';
  const template = getPointsTemplate(okType);
  res.json({ ok: true, type: okType, points: template });
});

app.post('/api/thk/start', async (req: Request, res: Response) => {
  try {
    const type = String((req.body?.type ?? '') as string).trim() as ThkVehicleType;
    const okType = type === 'sedan' || type === 'hatchback' || type === 'minivan' ? type : 'sedan';
    const session = await thicknessManager.startSession({ vehicleType: okType });
    // persist session creation if client provided ID
    const clientSessionId = typeof (req.body as any)?.sessionId === 'string' ? (req.body as any).sessionId : undefined;
    const sessionId = await store.createSession('thickness', clientSessionId);
    // save initial points as pending
    for (const pt of session.points) {
      await store.recordThicknessPoint({
        sessionId,
        pointId: pt.id,
        label: pt.label,
        status: pt.status,
        valueMicrons: pt.valueMicrons,
        measuredAt: pt.ts,
      });
    }
    res.json({ ok: true, session, sessionId });
  } catch (e: any) {
    const code = (e && (e as any).code) || 'thk_start_failed';
    res.status(code === 'thk_not_connected' ? 503 : 500).json({ ok: false, error: code, message: e?.message || String(e) });
  }
});

app.post('/api/thk/stop', async (req: Request, res: Response) => {
  try {
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.length ? req.body.sessionId : undefined;
    await thicknessManager.stopSession();
    if (sessionId) {
      try { await store.finishSession(sessionId); } catch (err) { console.warn('[thk] finishSession failed:', err); }
    }
    res.json({ ok: true, session: thicknessManager.getSessionSnapshot(), sessionId });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'thk_stop_failed', message: e?.message || String(e) });
  }
});

app.get('/api/thk/session', (_req: Request, res: Response) => {
  res.json({ ok: true, session: thicknessManager.getSessionSnapshot() });
});

// DEV-only helper: mark next point as recorded WITHOUT value to advance UI (no fake values)
app.post('/api/thk/mark-point', (req: Request, res: Response) => {
  if (agentEnv !== 'DEV') {
    res.status(403).json({ ok: false, error: 'dev_only' });
    return;
  }
  const id = typeof req.body?.id === 'string' && req.body.id.length ? req.body.id : undefined;
  const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.length ? req.body.sessionId : undefined;
  const result = thicknessManager.markPoint(id);
  if (result.ok && sessionId) {
    // persist updated point status
    const changed = result.session.points.find(p => p.id === (id || '')) || result.session.points.find(p => p.status !== 'pending');
    if (changed) {
      store.recordThicknessPoint({
        sessionId,
        pointId: changed.id,
        label: changed.label,
        status: changed.status,
        valueMicrons: changed.valueMicrons,
        measuredAt: changed.ts,
      }).catch(()=>{});
    }
  }
  res.status(result.ok ? 200 : 400).json(result);
});

// Reports API (DEV/QA only): generate local HTML report and optional email send via SMTP
app.post('/reports/generate', (req: Request, res: Response) => {
  if (agentEnv === 'PROD') {
    res.status(403).json({ ok: false, error: 'reports_disabled_in_prod' });
    return;
  }
  try {
    const data = (req.body as any)?.data;
    if (!data || !data.sessionId || !data.contact) {
      res.status(400).json({ ok: false, error: 'data_required' });
      return;
    }
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const generated = writeReportToOutbox(data, outboxRoot);
    res.json({ ok: true, id: generated.id, html: generated.htmlPath });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'internal', message: e?.message || String(e) });
  }
});

app.post('/reports/send', async (req: Request, res: Response) => {
  if (agentEnv === 'PROD') {
    res.status(403).json({ ok: false, error: 'reports_send_disabled_in_prod_until_psp' });
    return;
  }
  const mailCfg = getMailConfigFromEnv();
  try {
    const data = (req.body as any)?.data;
    if (!data || !data.sessionId || !data.contact) {
      res.status(400).json({ ok: false, error: 'data_required' });
      return;
    }
    const toEmail: string | undefined = data.contact?.email;
    if (!toEmail) {
      res.status(400).json({ ok: false, error: 'no_email', message: 'Email обязателен для отправки отчёта.' });
      return;
    }
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const generated = writeReportToOutbox(data, outboxRoot);
    if (!mailCfg && agentEnv === 'DEV') {
      // DEV fallback: симуляция отправки без SMTP
      simulateSend(generated, { email: toEmail }, outboxRoot);
      res.json({ ok: true, id: generated.id, simulated: true });
      return;
    }
    if (!mailCfg) {
      res.status(501).json({ ok: false, error: 'email_not_configured' });
      return;
    }
    const subject = 'Отчёт по услуге терминала самообслуживания';
    const result = await sendReportEmail(toEmail, subject, generated.htmlPath, mailCfg);
    res.json({ ok: true, id: generated.id, messageId: result.messageId });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'send_failed', message: e?.message || String(e) });
  }
});

// Preview HTML report by id; serves the generated file with text/html
app.get('/reports/view/:id', (req: Request, res: Response) => {
  if (agentEnv === 'PROD') {
    res.status(403).send('Reports preview disabled in PROD');
    return;
  }
  const id = req.params.id;
  const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
  const htmlPath = resolveReportHtmlPathById(outboxRoot, id);
  if (!htmlPath) {
    res.status(404).send('Report not found');
    return;
  }
  res.sendFile(htmlPath);
});

// Send report link via SMS (DEV/QA only). Expects { data, phone } or { data: {contact:{phone}} }
app.post('/reports/send-sms', async (req: Request, res: Response) => {
  if (agentEnv === 'PROD') {
    res.status(403).json({ ok: false, error: 'reports_send_disabled_in_prod_until_psp' });
    return;
  }
  let smsCfg = getSmsConfigFromEnv();
  // DEV fallback: автоматически используем провайдера dev, если не настроен реальный
  if (!smsCfg && agentEnv === 'DEV') {
    smsCfg = { provider: 'dev' } as any;
  }
  if (!smsCfg) {
    res.status(501).json({ ok: false, error: 'sms_not_configured' });
    return;
  }
  try {
    const data = (req.body as any)?.data;
    if (!data || !data.sessionId || !data.contact) {
      res.status(400).json({ ok: false, error: 'data_required' });
      return;
    }
    const toPhone: string | undefined = (req.body as any)?.phone || data.contact?.phone;
    if (!toPhone) {
      res.status(400).json({ ok: false, error: 'no_phone', message: 'Телефон обязателен для отправки по SMS.' });
      return;
    }
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const generated = writeReportToOutbox(data, outboxRoot);
    const baseUrl = process.env.KIOSK_BASE_URL || `http://localhost:${BASE_PORT}`;
    const viewUrl = new URL(`/reports/view/${encodeURIComponent(generated.id)}`, baseUrl).toString();
    const text = `Отчёт готов: ${viewUrl}`;
    const result = await sendSms(toPhone, text, smsCfg, outboxRoot);
    res.json({ ok: true, id: generated.id, smsId: result.id, url: viewUrl });
  } catch (e: any) {
    const code = (e && (e as any).code) || 'send_failed';
    const status = code === 'sms_provider_not_configured' ? 501 : 500;
    res.status(status).json({ ok: false, error: code, message: e?.message || String(e) });
  }
});

app.post('/api/obd/open', async (req: Request, res: Response) => {
  const { options, issues } = parseObdConnectPayload(req.body);
  if (issues.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues });
    return;
  }

  try {
    const driver = await obdConnectionManager.connect(options);
    const snapshot = obdConnectionManager.getSnapshot();
    if (!driver) {
      res.status(503).json({ ok: false, error: 'obd_adapter_not_found', snapshot });
      return;
    }
    res.json({ ok: true, snapshot });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'obd_connect_failed',
  message: formatObdError(error),
      snapshot: obdConnectionManager.getSnapshot(),
    });
  }
});

app.post('/api/obd/connect', async (req: Request, res: Response) => {
  const { options, issues } = parseObdConnectPayload(req.body);
  if (issues.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues });
    return;
  }
  try {
    const driver = await obdConnectionManager.connect(options);
    const snapshot = obdConnectionManager.getSnapshot();
    if (!driver) {
      res.status(503).json({ ok: false, error: 'obd_adapter_not_found', snapshot });
      return;
    }
    res.json({ ok: true, snapshot });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'obd_connect_failed',
  message: formatObdError(error),
      snapshot: obdConnectionManager.getSnapshot(),
    });
  }
});

app.post('/api/obd/reconnect', async (req: Request, res: Response) => {
  const { options, issues } = parseObdConnectPayload(req.body);
  if (issues.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues });
    return;
  }
  try {
    const driver = await obdConnectionManager.connect({ ...options, force: true });
    const snapshot = obdConnectionManager.getSnapshot();
    if (!driver) {
      res.status(503).json({ ok: false, error: 'obd_adapter_not_found', snapshot });
      return;
    }
    res.json({ ok: true, snapshot });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'obd_connect_failed',
  message: formatObdError(error),
      snapshot: obdConnectionManager.getSnapshot(),
    });
  }
});

app.get('/api/obd/snapshot', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    snapshot: obdConnectionManager.getSnapshot(),
    diagnostics: diagnosticSessionManager.getSnapshot(),
  });
});

// AI insights for current DTC/status (DEV/QA only by default)
app.post('/api/obd/ai-insights', async (req: Request, res: Response) => {
  if (!isInternalRequest(req)) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  const allowInProd = String(process.env.AI_ENABLE_IN_PROD || '').toLowerCase() === 'true';
  const currentEnv = String(process.env.AGENT_ENV || agentEnv || 'DEV').toUpperCase();
  if (currentEnv === 'PROD' && !allowInProd) {
    res.status(403).json({ ok: false, error: 'ai_disabled_in_prod' });
    return;
  }
  try {
    const diag = diagnosticSessionManager.getSnapshot();
    const dtc = diag.timeline?.flatMap(e => (e.type === 'operation' && e.operation === 'read_dtc' && Array.isArray((e as any).dtc) ? (e as any).dtc : [])) || [];
    const statusEntries = diag.timeline?.filter(e => e.type === 'state_change') || [];
    const latestStatus = (statusEntries.length ? (statusEntries[statusEntries.length - 1] as any).status : undefined);
    const payload = buildPayloadFromDtc(dtc as any, latestStatus);
    // allow client to pass meta
    const vehicle = (req.body as any)?.vehicle;
    if (vehicle) (payload as any).vehicle = vehicle;
    const insights = await fetchAiInsights(payload);
    res.json({ ok: true, insights });
  } catch (e: any) {
    const code = (e && e.code) || 'ai_failed';
    res.status(code === 'ai_not_configured' ? 501 : 500).json({ ok: false, error: code, message: e?.message || String(e) });
  }
});

// Cached AI insights (generated in background)
app.get('/api/obd/ai-insights/cached', (req: Request, res: Response) => {
  if (!isInternalRequest(req)) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  if (!canUseAiInCurrentEnv()) {
    res.status(403).json({ ok: false, error: 'ai_disabled_in_prod' });
    return;
  }
  if (!aiCache.insights) { res.status(204).end(); return; }
  res.json({ ok: true, insights: aiCache.insights, capturedAt: aiCache.capturedAt });
});

app.get('/api/obd/session', (_req: Request, res: Response) => {
  res.json({ ok: true, session: diagnosticSessionManager.getSnapshot() });
});

app.get('/api/obd/diagnostics/timeline', (req: Request, res: Response) => {
  const afterParam = Array.isArray(req.query.after) ? req.query.after[0] : req.query.after;
  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const events = diagnosticSessionManager.getTimeline({
    newerThanId: typeof afterParam === 'string' && afterParam.length ? afterParam : undefined,
    limit: coerceFiniteNumber(limitParam),
  });
  const metrics = diagnosticSessionManager.getMetricsSnapshot();
  res.json({
    ok: true,
    events,
    metrics,
    latestEventId: diagnosticSessionManager.getLatestEventId(),
  });
});

app.get('/api/obd/diagnostics/insights', (req: Request, res: Response) => {
  const recentParam = Array.isArray(req.query.recentFailures) ? req.query.recentFailures[0] : req.query.recentFailures;
  const windowParam = Array.isArray(req.query.windowMs) ? req.query.windowMs[0] : req.query.windowMs;
  const insights = diagnosticSessionManager.getInsights({
    recentFailures: normalizePositiveInteger(coerceFiniteNumber(recentParam)),
    windowMs: normalizePositiveInteger(coerceFiniteNumber(windowParam)),
  });
  res.json({ ok: true, insights });
});

app.get('/api/obd/diagnostics/history', (req: Request, res: Response) => {
  const sinceParam = Array.isArray(req.query.since) ? req.query.since[0] : req.query.since;
  const recentFailuresParam = Array.isArray(req.query.recentFailures)
    ? req.query.recentFailures[0]
    : req.query.recentFailures;

  const summary = diagnosticSessionManager.getHistoricalSummary({
    since: typeof sinceParam === 'string' && sinceParam.length ? sinceParam : undefined,
    limitFailures: normalizePositiveInteger(coerceFiniteNumber(recentFailuresParam)),
  });

  if (!summary) {
    res.status(503).json({ ok: false, error: 'diagnostics_history_unavailable' });
    return;
  }

  res.json({ ok: true, summary });
});

app.post('/api/obd/session/ack-error', (_req: Request, res: Response) => {
  diagnosticSessionManager.acknowledgeError();
  res.json({ ok: true, session: diagnosticSessionManager.getSnapshot() });
});

app.post('/api/obd/read-dtc', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'read_dtc', async (driver: KingbolenEdiagDriver) => driver.readDTC(), {
    attempts: 2,
    baseDelayMs: 200,
    onSuccess: async (result) => {
      try {
        if (!canUseAiInCurrentEnv()) return;
        const dtc = Array.isArray(result.data) ? (result.data as ObdDtc[]) : [];
        const diag = diagnosticSessionManager.getSnapshot();
        const statusEntries = diag.timeline?.filter(e => e.type === 'state_change') || [];
        const latestStatus = (statusEntries.length ? (statusEntries[statusEntries.length - 1] as any).status : undefined);
        const newSig = computeDtcSignature(dtc as any, latestStatus);
        if (newSig && aiCache.signature === newSig && aiCache.insights) {
          return; // already up-to-date
        }
        const payload = buildPayloadFromDtc(dtc as any, latestStatus);
        const insights = await fetchAiInsights(payload);
        aiCache.insights = insights;
        aiCache.signature = newSig;
        aiCache.capturedAt = new Date().toISOString();
        console.info('[ai] insights cached for signature', newSig);
      } catch (err) {
        console.warn('[ai] background insights generation failed:', err);
      }
    },
  });
});

// Close OBD session and disconnect adapter
app.post('/api/obd/close', async (_req: Request, res: Response) => {
  try {
    await obdConnectionManager.disconnect();
    res.json({ ok: true, snapshot: obdConnectionManager.getSnapshot() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'obd_close_failed', message: e?.message || String(e) });
  }
});

app.post('/api/obd/self-check', async (req: Request, res: Response) => {
  if (obdConnectionManager.getSnapshot().state !== 'connected') {
    respondObdNotConnected(res);
    return;
  }

  const attempts = coerceFiniteNumber(req.body?.attempts);
  const delayMs = coerceFiniteNumber(req.body?.delayMs);
  const origin = normalizeSelfCheckOrigin(req.body?.origin);
  const startedAt = new Date();
  const snapshotAtStart = obdConnectionManager.getSnapshot();

  try {
    const report = await diagnosticSessionManager.runOperation('self_check', async () => {
      const driver = await ensureDriverConnected();
      return runObdSelfCheck(driver, {
        attempts,
        delayMs,
      });
    }, {
      attempts: 1,
      baseDelayMs: 0,
      captureSnapshot: true,
      summarizeSuccess: summarizeSelfCheckReport,
      summarizeFailure: (value) => summarizeDiagnosticFailure('self_check', value),
    });
    const ok = selfCheckPassed(report);
    const completedAt = new Date();
    const logEntry = buildObdSelfCheckEntry(report, {
      environment: agentEnv,
      origin,
      startedAt,
      completedAt,
  portPath: null,
  baudRate: undefined,
      transport: snapshotAtStart.transport,
  bluetoothAddress: null,
      bluetoothName: snapshotAtStart.bluetoothName ?? null,
  bluetoothChannel: undefined,
      adapterIdentity: snapshotAtStart.identity ?? null,
      protocolProfile: undefined, // Может быть передан через req.body если нужно
      protocolUsed: snapshotAtStart.metrics?.protocolUsed ?? null,
      attempts: attempts ?? undefined,
      delayMs: delayMs ?? undefined,
      metadata: {
        requestSource: 'api/obd/self-check',
        connectionSnapshot: snapshotAtStart,
      },
    });

    try {
      await selfCheckLogger.append(logEntry);
    } catch (error) {
      console.error('[self-check] failed to persist log entry:', error);
    }

    lastObdSelfCheck = {
      ok,
      report,
      timestamp: completedAt.toISOString(),
      logEntryId: logEntry.id,
      snapshot: snapshotAtStart,
    };
    res.json({
      ok,
      report,
      logEntryId: logEntry.id,
      snapshot: snapshotAtStart,
      diagnostics: diagnosticSessionManager.getSnapshot(),
    });
  } catch (error) {
    if (error instanceof ObdNotConnectedError) {
      respondObdNotConnected(res);
      return;
    }
    res.status(500).json({
      ok: false,
      error: formatObdError(error),
      diagnostics: diagnosticSessionManager.getSnapshot(),
    });
  }
});

app.get('/api/obd/self-check/latest', (_req: Request, res: Response) => {
  if (!lastObdSelfCheck) {
    res.status(404).json({ ok: false, error: 'no_self_check' });
    return;
  }
  res.json({
    ok: lastObdSelfCheck.ok,
    report: lastObdSelfCheck.report,
    timestamp: lastObdSelfCheck.timestamp,
    logEntryId: lastObdSelfCheck.logEntryId,
    snapshot: lastObdSelfCheck.snapshot,
  });
});

app.get('/api/obd/status', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'status', async (driver: KingbolenEdiagDriver) => driver.readStatus(), {
    attempts: 2,
    baseDelayMs: 200,
  });
});

app.get('/api/obd/live-basic', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'live_data', async (driver: KingbolenEdiagDriver) => driver.readLiveData(), {
    attempts: 2,
    baseDelayMs: 150,
  });
});

app.post('/api/obd/clear-dtc', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'clear_dtc', async (driver: KingbolenEdiagDriver) => driver.clearDTC(), {
    attempts: 1,
    baseDelayMs: 400,
  });
});

// ============== OBD Session Management ==============
app.post('/api/obd/session/complete', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      res.status(400).json({ ok: false, error: 'session_id_required' });
      return;
    }

    const session = obdSessionManager.completeSession(sessionId);
    res.json({ ok: true, session });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: 'session_complete_failed',
      message: error?.message || String(error),
    });
  }
});

app.post('/api/obd/session/create', async (req: Request, res: Response) => {
  try {
    const { vehicleMake, vehicleModel } = req.body;
    
    if (!vehicleMake || !vehicleModel) {
      res.status(400).json({ ok: false, error: 'vehicle_data_required' });
      return;
    }

    const sessionId = obdSessionManager.createSession({ make: vehicleMake, model: vehicleModel });
    res.json({ ok: true, sessionId });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: 'session_create_failed',
      message: error?.message || String(error),
    });
  }
});

app.post('/api/obd/session/update', async (req: Request, res: Response) => {
  try {
    const { sessionId, dtc, pids, vin, vendor } = req.body;
    
    if (!sessionId) {
      res.status(400).json({ ok: false, error: 'session_id_required' });
      return;
    }

    obdSessionManager.updateSession(sessionId, { dtc, pids, vin, vendor });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: 'session_update_failed',
      message: error?.message || String(error),
    });
  }
});

app.get('/api/obd/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = obdSessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ ok: false, error: 'session_not_found' });
      return;
    }

    res.json({ ok: true, session });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: 'session_get_failed',
      message: error?.message || String(error),
    });
  }
});

// Mount OBD payment and report routes
app.use(createObdPaymentRoutes(obdPaymentAdapter));
app.use(createObdReportRoutes());

// Mount security routes
app.use('/api', createSecurityRoutes(securityMetrics));

// Mount media optimization routes
app.use(createMediaRoutes());

// ============== Locks API ==============
// Standardized API routes (Cycle-2 specification)
app.post('/api/locks/open', openLockRoute(lockController, paymentModule));
app.get('/api/locks/status', getLockStatusRoute(lockController));
app.post('/api/locks/emergency-close-all', emergencyCloseAllLocksRoute(lockController));

// Legacy lock routes (keep for backward compatibility)
app.post('/api/locks/open-legacy', async (req: Request, res: Response) => {
  const schema = z.object({
    deviceType: z.enum(['thickness', 'obd']),
    operationKey: z.string().optional(),
    autoCloseMs: z.number().positive().optional(),
    context: z.record(z.unknown()).optional(),
  });

  try {
    const params = schema.parse(req.body);
    const result = await lockController.openSlot(params.deviceType, {
      operationKey: params.operationKey,
      autoCloseMs: params.autoCloseMs,
      context: params.context,
    });

    res.status(result.ok ? 200 : 403).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: error.errors,
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

app.post('/api/locks/close', async (req: Request, res: Response) => {
  const schema = z.object({
    deviceType: z.enum(['thickness', 'obd']),
    operationKey: z.string().optional(),
    reason: z.string().optional(),
  });

  try {
    const params = schema.parse(req.body);
    const result = await lockController.closeSlot(params.deviceType, {
      operationKey: params.operationKey,
      reason: params.reason,
    });

    res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: error.errors,
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

app.get('/api/locks/status', async (req: Request, res: Response) => {
  try {
    const deviceType = req.query.deviceType as string | undefined;

    if (deviceType) {
      // Запрос статуса конкретного замка
      const schema = z.enum(['thickness', 'obd']);
      const validatedType = schema.parse(deviceType);
      const status = await lockController.getStatus(validatedType);

      if (!status) {
        res.status(404).json({
          ok: false,
          error: 'lock_not_found',
        });
        return;
      }

      res.json({
        ok: true,
        status,
      });
    } else {
      // Запрос всех статусов
      const statuses = await lockController.getAllStatus();
      res.json({
        ok: true,
        statuses,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: error.errors,
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// Prefer dedicated AGENT_PORT to avoid conflicts with frontend/static PORT
const BASE_PORT = process.env.AGENT_PORT
  ? Number(process.env.AGENT_PORT)
  : (process.env.PORT ? Number(process.env.PORT) : 7070);

// Initialize heartbeat logger
const heartbeatLogPath = process.env.HEARTBEAT_LOG_FILE ||
  path.join(process.cwd(), 'logs', 'heartbeat.jsonl');
const heartbeatLogger = new HeartbeatLogger(heartbeatLogPath, 30000); // 30 seconds

function startServer(port: number, triesLeft = 5) {
  const server = app.listen(port, async () => {
    console.log(`[kiosk-agent] listening on http://localhost:${port}`);

    // Start heartbeat logging
    try {
      await heartbeatLogger.start();
      console.log('[heartbeat] Started logging to', heartbeatLogPath);
    } catch (err) {
      console.error('[heartbeat] Failed to start:', err);
    }

    // Start OBD session cleanup task
    try {
      cleanupTask.start();
      console.log('[obd-cleanup] Started cleanup task');
    } catch (err) {
      console.error('[obd-cleanup] Failed to start:', err);
    }

    // Start reports cleanup task
    try {
      reportCleanupTask.start();
      console.log('[reports-cleanup] Started cleanup task');
    } catch (err) {
      console.error('[reports-cleanup] Failed to start:', err);
    }
  });
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE' && triesLeft > 0) {
      const next = port + 1;
      console.warn(`[kiosk-agent] port ${port} in use, retry on ${next} (${triesLeft - 1} tries left)`);
      setTimeout(() => startServer(next, triesLeft - 1), 300);
    } else {
      console.error('[kiosk-agent] server error:', err);
      process.exitCode = 1;
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[kiosk-agent] SIGTERM received, shutting down gracefully');
    await heartbeatLogger.stop();
    server.close(() => {
      console.log('[kiosk-agent] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('[kiosk-agent] SIGINT received, shutting down gracefully');
    await heartbeatLogger.stop();
    server.close(() => {
      console.log('[kiosk-agent] Server closed');
      process.exit(0);
    });
  });
}

const shouldAutoStart = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (shouldAutoStart) {
  startServer(BASE_PORT);
}
/**
 * Kiosk Agent (skeleton)
 * - No device simulation in PROD. DEV only exposes clear "no device" status.
 * - Provides HTTP/IPC endpoints later (not implemented in skeleton).
 */

export type Env = 'DEV'|'QA'|'PROD'

export interface AgentConfig {
  env: Env
  logLevel?: 'debug'|'info'|'warn'|'error'
}

function coerceFiniteNumber(input: unknown): number | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const asNumber = Number(input);
  return Number.isFinite(asNumber) ? asNumber : undefined;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeEnvironment(value: unknown): Env {
  if (value === 'QA' || value === 'PROD' || value === 'DEV') return value;
  return 'DEV';
}

function normalizeSelfCheckOrigin(value: unknown): SelfCheckOrigin {
  if (value === 'scheduled' || value === 'automatic') return value;
  return 'manual';
}

class ObdNotConnectedError extends Error {
  readonly code = 'obd_not_connected';

  constructor() {
    super('OBD adapter is not connected');
    this.name = 'ObdNotConnectedError';
  }
}

type DiagnosticOperationHandler<T> = (driver: KingbolenEdiagDriver) => Promise<T>;

interface DiagnosticOperationContext {
  connectOptions?: ObdConnectOptions;
  attempts?: number;
  baseDelayMs?: number;
  // optional hook invoked after a successful operation (non-blocking)
  onSuccess?: (result: ObdResult<unknown> & { ok: true }) => void | Promise<void>;
}

function hasOkResult(value: unknown): value is { ok: boolean } {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof (value as any).ok === 'boolean';
}

function isObdSuccessResult(value: unknown): value is ObdResult<unknown> & { ok: true } {
  return typeof value === 'object' && value !== null && (value as any).ok === true;
}

function isObdFailureResult(value: unknown): value is ObdResult<unknown> & { ok: false } {
  return typeof value === 'object' && value !== null && (value as any).ok === false;
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeDiagnosticSuccess(operation: DiagnosticOperation, payload: unknown): unknown {
  if (!isObdSuccessResult(payload)) return undefined;
  switch (operation) {
    case 'read_dtc': {
      const dtcs = Array.isArray(payload.data) ? (payload.data as ObdDtc[]) : [];
      const severity = dtcs.reduce(
        (acc, dtc) => {
          if (dtc.severity === 'critical') acc.critical += 1;
          else if (dtc.severity === 'warning') acc.warning += 1;
          else acc.info += 1;
          return acc;
        },
        { critical: 0, warning: 0, info: 0 }
      );
      return {
        total: dtcs.length,
        severity,
        hasDescriptions: dtcs.every((dtc) => typeof dtc.description === 'string' && dtc.description.length > 0),
      };
    }
    case 'status': {
      const status = payload.data as ObdStatus;
      return {
  milOn: (status as any).milOn ?? (status as any).mil ?? false,
        dtcCount: status.dtcCount,
        readySystems: Object.values(status.readiness).filter((ready) => ready).length,
      };
    }
    case 'live_data': {
      const live = payload.data as any;
      const present = Object.entries(live).filter(([, value]) => value != null).length;
      return {
        fields: present,
        rpm: live.rpm,
        coolantTempC: live.coolantTemp ?? live.coolantTempC,
        vehicleSpeedKmh: live.speed ?? live.vehicleSpeedKmh,
        batteryVoltageV: live.voltage ?? live.batteryVoltageV,
      };
    }
    case 'clear_dtc':
      return { cleared: true };
    case 'self_check':
      return summarizeSelfCheckReport(payload.data as ObdSelfCheckReport);
    default:
      return undefined;
  }
}

function summarizeDiagnosticFailure(_operation: DiagnosticOperation, payload: unknown): unknown {
  if (isObdFailureResult(payload)) {
    return { error: payload.error ?? 'unknown_result_error' };
  }
  return { error: toErrorMessage(payload) };
}

function summarizeSelfCheckReport(report: ObdSelfCheckReport): unknown {
  return {
    attempts: {
      planned: report.attemptsPlanned,
      performed: report.attemptsPerformed,
    },
    passes: report.passes,
    fails: report.fails,
    consistent: report.consistent,
    metrics: report.metrics,
  };
}

async function ensureDriverConnected(options?: ObdConnectOptions): Promise<KingbolenEdiagDriver> {
  const driver = await obdConnectionManager.ensureConnected(options);
  if (!driver) {
    throw new ObdNotConnectedError();
  }
  return driver as KingbolenEdiagDriver;
}

function respondObdNotConnected(res: Response): void {
  const connection = obdConnectionManager.getSnapshot();
  res.status(503).json({
    ok: false,
    error: 'obd_not_connected',
    snapshot: connection,
    connection,
    diagnostics: diagnosticSessionManager.getSnapshot(),
  });
}
async function handleDiagnosticOperation(
  res: Response,
  operation: DiagnosticOperation,
  handler: (driver: KingbolenEdiagDriver) => Promise<ObdResult<unknown>>,
  context?: {
    attempts?: number;
    baseDelayMs?: number;
    connectOptions?: ObdConnectOptions;
    onSuccess?: (result: ObdResult<unknown> & { ok: true }) => void | Promise<void>;
  }
): Promise<void> {
  try {
    const attempts = context?.attempts ?? (operation === 'clear_dtc' ? 1 : 3);
    const baseDelayMs = context?.baseDelayMs ?? 250;
    const result = await diagnosticSessionManager.runOperation(operation, async () => {
      const driver = await ensureDriverConnected(context?.connectOptions);
      return handler(driver);
    }, {
      attempts,
      baseDelayMs,
      captureSnapshot: true,
      summarizeSuccess: (value) => summarizeDiagnosticSuccess(operation, value),
      summarizeFailure: (value) => summarizeDiagnosticFailure(operation, value),
    });

    if (hasOkResult(result)) {
      res.status(result.ok ? 200 : 500).json({
        ...result,
        diagnostics: diagnosticSessionManager.getSnapshot(),
        connection: obdConnectionManager.getSnapshot(),
      });
      if (isObdSuccessResult(result) && typeof context?.onSuccess === 'function') {
        setTimeout(() => {
          Promise.resolve(context!.onSuccess!(result as any)).catch((err) => console.warn('[diagnostics] onSuccess hook failed:', err));
        }, 0);
      }
      return;
    }

    res.json({
      result,
      diagnostics: diagnosticSessionManager.getSnapshot(),
      connection: obdConnectionManager.getSnapshot(),
    });
  } catch (error) {
    if (error instanceof ObdNotConnectedError) {
      respondObdNotConnected(res);
      return;
    }
    res.status(500).json({
      ok: false,
      error: `${operation}_failed`,
      message: formatObdError(error),
      diagnostics: diagnosticSessionManager.getSnapshot(),
      connection: obdConnectionManager.getSnapshot(),
    });
  }
}

export class Agent {
  constructor(private cfg: AgentConfig){ }
  start(){
    // TODO: init subsystems (payments, report, locks, drivers)
    // No device calls here in skeleton
    return { status: 'ok', env: this.cfg.env }
  }
}

async function handleCreateIntent(req: Request, res: Response): Promise<void> {
  const parsed = createIntentSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const { amount, currency, meta } = parsed.data
  try {
    const result = await paymentModule.createIntent({
      amount,
      currency: normalizeCurrency(currency),
      meta
    })
    res.json({ ok: true, intent: result.intent, breakdown: result.breakdown, environment: agentEnv })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'payments_create_failed', message: error?.message ?? String(error) })
  }
}

// ============== Payments API ==============
// Standardized API routes (Cycle-2 specification)
app.post('/api/payments/intents', createPaymentIntentRoute(paymentModule));
app.get('/api/payments/intents/:id', getPaymentIntentRoute(paymentModule));
app.post('/api/payments/intents/:id/cancel', cancelPaymentIntentRoute(paymentModule));
app.post('/api/payments/intents/:id/confirm', confirmPaymentIntentRoute(paymentModule, agentEnv));

// Legacy payment routes (keep for backward compatibility)
app.post('/payments/intent', handleCreateIntent)
app.post('/payments/intents', handleCreateIntent)

app.get('/payments/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!id) {
    res.status(400).json({ ok: false, error: 'intent_id_required' })
    return
  }
  const status = await paymentModule.getStatus(id)
  if (!status) {
    res.status(404).json({ ok: false, error: 'intent_not_found' })
    return
  }
  res.json({ ok: true, intentId: id, status })
})

app.get('/payments/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!id) {
    res.status(400).json({ ok: false, error: 'intent_id_required' })
    return
  }
  const record = await paymentModule.getIntent(id)
  if (!record) {
    res.status(404).json({ ok: false, error: 'intent_not_found' })
    return
  }
  res.json({
    ok: true,
    intent: record.intent,
    breakdown: record.breakdown,
    createdAt: record.createdAtIso,
    lastStatus: record.lastStatus
  })
})

app.post('/payments/confirm-dev', async (req: Request, res: Response) => {
  const parsed = intentIdSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues: parsed.error.flatten().fieldErrors })
    return
  }
  try {
    const record = await paymentModule.confirmDev(parsed.data.id)
    if (!record) {
      res.status(404).json({ ok: false, error: 'intent_not_found' })
      return
    }
    res.json({ ok: true, intent: record.intent, breakdown: record.breakdown })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'payments_confirm_failed', message: error?.message ?? String(error) })
  }
})

async function handleManualConfirm(req: Request, res: Response): Promise<void> {
  const parsed = manualConfirmSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues: parsed.error.flatten().fieldErrors })
    return
  }
  try {
    const record = await paymentModule.manualConfirm({
      intentId: parsed.data.id,
      operatorId: parsed.data.operatorId,
      note: parsed.data.note,
      meta: parsed.data.meta
    })
    if (!record) {
      res.status(404).json({ ok: false, error: 'intent_not_found' })
      return
    }
    res.json({ ok: true, intent: record.intent, breakdown: record.breakdown })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'payments_manual_confirm_failed', message: error?.message ?? String(error) })
  }
}

app.post('/payments/manual-confirm', handleManualConfirm)
app.post('/admin/payments/manual-confirm', handleManualConfirm)

// Webhook endpoint for payment provider notifications
app.post('/webhooks/payments', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    // Get signature from header
    const signature = req.headers['x-provider-signature'] as string | undefined
    const webhookSecret = process.env.PROVIDER_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error('[webhook] PROVIDER_WEBHOOK_SECRET not configured')
      res.status(500).json({ ok: false, error: 'webhook_not_configured' })
      return
    }

    // Get raw body
    const rawBody = req.body.toString('utf8')

    // Verify signature if provided
    if (signature) {
      const { verifyWebhookSignature } = await import('@selfservice/payments')
      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret)

      if (!isValid) {
        console.error('[webhook] Invalid signature')
        res.status(401).json({ ok: false, error: 'invalid_signature' })
        return
      }
    } else {
      console.warn('[webhook] No signature provided')
    }

    // Parse payload
    const payload = JSON.parse(rawBody)

    // Extract payment information
    const eventType = payload.event_type || payload.type || 'unknown'
    const paymentId = payload.payment_id || payload.id
    const status = payload.status

    console.log(`[webhook] Received: event_type=${eventType}, payment_id=${paymentId}, status=${status}`)

    // Update payment status if we can find it
    if (paymentId && status) {
      // Try to update via payment module if it has webhook support
      const updated = await paymentModule.updateFromWebhook?.(paymentId, status, payload)

      if (updated) {
        res.json({ ok: true, message: 'Webhook processed' })
      } else {
        res.json({ ok: true, message: 'Webhook received but payment not found locally' })
      }
    } else {
      res.json({ ok: true, message: 'Webhook received' })
    }
  } catch (error: any) {
    console.error('[webhook] Error processing webhook:', error)
    res.status(500).json({ ok: false, error: 'webhook_processing_failed', message: error?.message })
  }
})

app.get('/payments/metrics', (_req: Request, res: Response) => {
  const snapshot = paymentModule.getMetricsSnapshot()
  res.json({ ok: true, snapshot, capturedAt: new Date().toISOString() })
})

app.get('/monitoring/alerts', (_req: Request, res: Response) => {
  const capturedAt = new Date()
  const snapshot = paymentModule.getMetricsSnapshot()
  const alerts = evaluateAlerts({
    environment: agentEnv,
    timestamp: capturedAt,
    payments: snapshot
  })
  res.json({ ok: true, alerts, capturedAt: capturedAt.toISOString() })
})

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    paymentsPromCollector.update()
    const metricsBody = await metricsRegistry.metrics()
    res.setHeader('Content-Type', metricsRegistry.contentType)
    res.send(metricsBody)
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'metrics_collect_failed', message: error?.message ?? String(error) })
  }
})

// Health: persistence
app.get('/health/persistence', async (_req: Request, res: Response) => {
  try {
    // минимальный noop: создаём временную сессию в памяти, если pg недоступен — PostgresStore бросит ошибку на init
    const testId = await store.createSession('thickness')
    await store.finishSession(testId)
    res.json({ ok: true, mode: String(process.env.AGENT_PERSISTENCE || 'memory'), testId })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'persistence_unhealthy', message: error?.message ?? String(error) })
  }
})

// Health endpoints following RFC draft-inadarei-api-health-check-06
// Liveness probe - is the process running?
app.get('/healthz', (_req: Request, res: Response) => {
  const result = checkLiveness();
  const statusCode = result.status === 'fail' ? 503 : 200;
  res.status(statusCode).json(result);
});

// Readiness probe - can the service handle requests?
app.get('/readyz', async (_req: Request, res: Response) => {
  const result = await checkReadiness(store);
  const statusCode = result.status === 'fail' ? 503 : 200;
  res.status(statusCode).json(result);
});

// Combined health check with system metrics
app.get('/health', async (_req: Request, res: Response) => {
  const result = await checkHealth(store);
  const statusCode = result.status === 'fail' ? 503 : (result.status === 'warn' ? 200 : 200);
  res.status(statusCode).json(result);
});

// Auto-update API endpoints (admin only)
app.get('/api/autoupdate/status', async (_req: Request, res: Response) => {
  // In production, implement proper authentication
  if (!isInternalRequest(_req) && agentEnv === 'PROD') {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Placeholder - will be implemented when AutoUpdateManager is initialized
  res.json({
    status: 'not_configured',
    message: 'Auto-update system requires configuration'
  });
});

app.post('/api/autoupdate/check', async (_req: Request, res: Response) => {
  if (!isInternalRequest(_req) && agentEnv === 'PROD') {
    return res.status(403).json({ error: 'forbidden' });
  }

  res.json({
    status: 'not_configured',
    message: 'Auto-update system requires configuration'
  });
});

app.post('/api/autoupdate/trigger', async (_req: Request, res: Response) => {
  if (!isInternalRequest(_req) && agentEnv === 'PROD') {
    return res.status(403).json({ error: 'forbidden' });
  }

  res.json({
    status: 'not_configured',
    message: 'Auto-update system requires configuration'
  });
});

app.post('/api/autoupdate/rollback', async (req: Request, res: Response) => {
  if (!isInternalRequest(req) && agentEnv === 'PROD') {
    return res.status(403).json({ error: 'forbidden' });
  }

  res.json({
    status: 'not_configured',
    message: 'Auto-update system requires configuration'
  });
});
