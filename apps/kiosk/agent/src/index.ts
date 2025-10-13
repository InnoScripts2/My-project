import express, { Request, Response } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { runObdSelfCheck, selfCheckPassed, type ObdSelfCheckReport } from './devices/obd/ObdSelfCheck.js';
import { SerialPort } from 'serialport';
import { SelfCheckLogger, buildObdSelfCheckEntry, type SelfCheckOrigin } from './selfcheck/index.js';
import { z } from 'zod';
import { PaymentModule, createPaymentsPrometheusCollector } from '@selfservice/payments';
import { collectDefaultMetrics, Registry } from 'prom-client';
import type { SmsConfig } from '@selfservice/reporting';
import { createBleMetrics } from './devices/ble/metrics.js';
import { evaluateAlerts } from './monitoring/alerts.js';
import { thicknessManager, type ThkVehicleType, getPointsTemplate } from './devices/thickness/ThicknessManager.js';
import { InMemoryStore } from './storage/InMemoryStore.js';
import { PostgresStore } from './storage/PostgresStore.js';
import { SupabaseStore, supabaseOperations, supabaseOperationDuration, supabaseRetries } from './storage/SupabaseStore.js';
import type { PersistenceStore } from './storage/types.js';
import { obdConnectionManager, type ObdConnectOptions, type ObdConnectionSnapshot } from './devices/obd/ObdConnectionManager.js';
import type { Elm327Driver, ObdResult, ObdDtc, ObdStatus, ObdLiveData } from './devices/obd/Elm327Driver.js';
import { parseObdConnectPayload, formatObdError } from './devices/obd/connectOptions.js';
import { diagnosticSessionManager, type DiagnosticOperation } from './devices/obd/DiagnosticSessionManager.js';
import { writeReportToOutbox, resolveReportHtmlPathById, simulateSend } from './reports/service.js';
import { getMailConfigFromEnv, sendReportEmail } from './reports/mailer.js';
import { getSmsConfigFromEnv, sendSms } from './reports/sms.js';
import { buildPayloadFromDtc, fetchAiInsights, type AiInsightsResponse } from './ai/assistant.js';
import { createObdRoutes, getOrchestrator } from './api/routes/obd.routes.js';
import { createThicknessRoutes } from './api/routes/thickness.routes.js';
import { createMediaRoutes } from './api/routes/media-routes.js';
import { createArchiveRoutes } from './api/routes/archive-routes.js';
import { ObdWebSocketHandler } from './api/websocket/obd.websocket.js';
import { AdminWebSocketHandler } from './api/websocket/admin.websocket.js';
import { createObdMetrics } from './devices/obd/orchestration/metrics.js';
import { createPresenceService } from './presence/AppPresenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// CORS configuration based on environment
const agentEnv: Env = normalizeEnvironment(process.env.AGENT_ENV);
const corsOptions = {
  origin: agentEnv === 'PROD'
    ? process.env.KIOSK_DOMAIN || 'http://localhost:8080'
  : ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'file://'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

const paymentModule = new PaymentModule(agentEnv);
// Persistence (feature flag: AGENT_PERSISTENCE=memory|pg|supabase)
function createPersistenceStore(): PersistenceStore {
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
      return new SupabaseStore();
    } catch (err) {
      console.warn('[persistence] failed to init SupabaseStore, fallback to InMemoryStore:', err);
      return new InMemoryStore();
    }
  }
  return new InMemoryStore();
}
const store: PersistenceStore = createPersistenceStore();
const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });
const paymentsPromCollector = createPaymentsPrometheusCollector(paymentModule, {
  register: {
    registerMetric(metric: { name?: string }) {
      metricsRegistry.registerMetric(metric as any);
    },
  },
});
paymentsPromCollector.register();
// Register Supabase metrics if using Supabase persistence
// BLE Prometheus metrics (event-driven)
const bleProm = createBleMetrics(metricsRegistry)
if (String(process.env.AGENT_PERSISTENCE || 'memory').toLowerCase() === 'supabase') {
  metricsRegistry.registerMetric(supabaseOperations);
  metricsRegistry.registerMetric(supabaseOperationDuration);
  metricsRegistry.registerMetric(supabaseRetries);
}
// Register OBD metrics
export const obdMetrics = createObdMetrics(metricsRegistry);
const presenceService = createPresenceService(metricsRegistry);
if (presenceService) {
  presenceService.start().catch(err => console.warn('[presence] failed to start presence service:', err));
}
const selfCheckLogger = new SelfCheckLogger();

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
  const thkState = thk ? (thk.state === 'active' ? 'connected' : 'disconnected') : 'disconnected';

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
    const ports = await SerialPort.list();
    res.json(
      ports.map(p => ({
        path: p.path,
        manufacturer: (p as any).manufacturer ?? null,
        friendlyName: (p as any).friendlyName ?? null,
        productId: (p as any).productId ?? null,
        vendorId: (p as any).vendorId ?? null,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
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
  const result = await thicknessManager.open({ vehicleType: okType ? type : 'sedan' });
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
  code: pt.id,
        valueMicrons: pt.valueMicrons,
  capturedAt: pt.ts,
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
  const changed = result.session ? (result.session.points.find((p: any) => p.id === (id || '')) || result.session.points.find((p: any) => p.status !== 'pending')) : undefined;
    if (changed) {
      store.recordThicknessPoint({
        sessionId,
  code: changed.id,
        valueMicrons: changed.valueMicrons,
  capturedAt: changed.ts,
      }).catch(()=>{});
    }
  }
  res.status(result.ok ? 200 : 400).json(result);
});

// Reports API (DEV/QA only): generate local HTML report and optional email send via SMTP
app.post('/reports/generate', async (req: Request, res: Response) => {
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
    const generated = await writeReportToOutbox(data, outboxRoot);
    res.json({ ok: true, id: generated.id, html: generated.htmlPath, pdf: generated.pdfPath });
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
    const generated = await writeReportToOutbox(data, outboxRoot);
    if (!mailCfg && agentEnv === 'DEV') {
      await simulateSend(generated, { email: toEmail }, outboxRoot);
      res.json({ ok: true, id: generated.id, simulated: true, html: generated.htmlPath, pdf: generated.pdfPath });
      return;
    }
    if (!mailCfg) {
      res.status(501).json({ ok: false, error: 'email_not_configured' });
      return;
    }
    const result = await sendReportEmail(toEmail, generated, mailCfg);
    res.json({ ok: result.success, id: generated.id, deliveryId: result.deliveryId, error: result.error });
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
    smsCfg = { provider: 'dev', from: 'kiosk-dev' } as SmsConfig;
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
    const generated = await writeReportToOutbox(data, outboxRoot);
    const baseUrl = process.env.KIOSK_BASE_URL || `http://localhost:${BASE_PORT}`;
    const viewUrl = new URL(`/reports/view/${encodeURIComponent(generated.id)}`, baseUrl).toString();
    const text = `Отчёт готов: ${viewUrl}`;
    const result = await sendSms(toPhone, text, smsCfg);
    res.json({ ok: result.success, id: generated.id, smsId: result.deliveryId, url: viewUrl, error: result.error });
  } catch (e: any) {
    const code = (e && (e as any).code) || 'send_failed';
    const status = code === 'sms_provider_not_configured' ? 501 : 500;
    res.status(status).json({ ok: false, error: code, message: e?.message || String(e) });
  }
});

app.post('/api/obd/open', async (req: Request, res: Response) => {
  const { options, issues } = parseObdConnectPayload(req.body);
  if (issues && issues.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues });
    return;
  }

  try {
  const driver = await obdConnectionManager.connect(options as any);
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
  if (issues && issues.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_payload', issues });
    return;
  }
  try {
  const driver = await obdConnectionManager.connect(options as any);
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
  if (issues && issues.length > 0) {
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
  const dtc = diag.timeline?.flatMap((e: any) => (e.type === 'operation' && e.operation === 'read_dtc' && Array.isArray((e as any).dtc) ? (e as any).dtc : [])) || [];
  const statusEntries = diag.timeline?.filter((e: any) => e.type === 'state_change') || [];
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
  await handleDiagnosticOperation(res, 'read_dtc', async (driver: Elm327Driver) => driver.readDtc(), {
    attempts: 2,
    baseDelayMs: 200,
    onSuccess: async (result) => {
      try {
        if (!canUseAiInCurrentEnv()) return;
        const dtc = Array.isArray(result.data) ? (result.data as ObdDtc[]) : [];
        const diag = diagnosticSessionManager.getSnapshot();
  const statusEntries = diag.timeline?.filter((e: any) => e.type === 'state_change') || [];
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
  return runObdSelfCheck(driver as any, {
        attempts,
        delayMs,
      });
    }, {
      attempts: 1,
      baseDelayMs: 0,
      captureSnapshot: true,
      summarizeFailure: (value: unknown) => summarizeDiagnosticFailure('self_check', value),
    });
    const ok = selfCheckPassed(report);
    const completedAt = new Date();
    const logEntry = buildObdSelfCheckEntry(report, {
      origin,
      startedAt,
      completedAt,
      portPath: snapshotAtStart.portPath,
      baudRate: snapshotAtStart.baudRate,
      transport: snapshotAtStart.transport,
      bluetoothAddress: snapshotAtStart.bluetoothAddress ?? null,
      bluetoothName: snapshotAtStart.bluetoothName ?? null,
      bluetoothChannel: snapshotAtStart.bluetoothChannel,
      adapterIdentity: snapshotAtStart.identity ?? null,
      attempts: attempts ?? undefined,
      delayMs: delayMs ?? undefined,
      environment: agentEnv,
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
  await handleDiagnosticOperation(res, 'status', async (driver: Elm327Driver) => driver.readStatus(), {
    attempts: 2,
    baseDelayMs: 200,
  });
});

app.get('/api/obd/live-basic', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'live_data', async (driver: Elm327Driver) => driver.readLiveData(), {
    attempts: 2,
    baseDelayMs: 150,
  });
});

app.post('/api/obd/clear-dtc', async (_req: Request, res: Response) => {
  await handleDiagnosticOperation(res, 'clear_dtc', async (driver: Elm327Driver) => driver.clearDtc(), {
    attempts: 1,
    baseDelayMs: 400,
  });
});

// Prefer dedicated AGENT_PORT to avoid conflicts with frontend/static PORT
const BASE_PORT = process.env.AGENT_PORT
  ? Number(process.env.AGENT_PORT)
  : (process.env.PORT ? Number(process.env.PORT) : 7070);

let obdWebSocketHandler: ObdWebSocketHandler | null = null;
let adminWebSocketHandler: AdminWebSocketHandler | null = null;

function startServer(port: number, triesLeft = 5) {
  const httpServer = createServer(app);

  // Initialize orchestrator and WebSocket handler
  const orchestrator = getOrchestrator();
  obdWebSocketHandler = new ObdWebSocketHandler(httpServer, orchestrator);
  adminWebSocketHandler = new AdminWebSocketHandler(httpServer);
  // Регистрация потока снапшотов OBD
  try {
    adminWebSocketHandler.registerObdSnapshotStream((listener) => obdConnectionManager.addSnapshotListener(listener));
  } catch (err) {
    console.warn('[admin-ws] failed to register obd snapshot stream', err);
  }
  // Регистрация потока событий истории соединения
  try {
    adminWebSocketHandler.registerObdEventStream((listener) => obdConnectionManager.addEventListener(listener));
  } catch (err) {
    console.warn('[admin-ws] failed to register obd event stream', err);
  }

  httpServer.listen(port, () => {
    console.log(`[kiosk-agent] listening on http://localhost:${port}`);
    console.log(`[kiosk-agent] WebSocket available at ws://localhost:${port}/ws/obd`);
    console.log(`[kiosk-agent] Admin console available at http://localhost:${port}/admin`);
  });

  httpServer.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE' && triesLeft > 0) {
      const next = port + 1;
      console.warn(`[kiosk-agent] port ${port} in use, retry on ${next} (${triesLeft - 1} tries left)`);
      setTimeout(() => startServer(next, triesLeft - 1), 300);
    } else {
      console.error('[kiosk-agent] server error:', err);
      process.exitCode = 1;
    }
  });

  return httpServer;
}

const shouldAutoStart = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (shouldAutoStart) {
  startServer(BASE_PORT);
}

// Админ API: текущий снапшот OBD
app.get('/api/admin/obd/snapshot', (_req: Request, res: Response) => {
  try {
    const snap = obdConnectionManager.getSnapshot();
    res.json({ ok: true, snapshot: snap });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
// Админ API: история событий OBD
app.get('/api/admin/obd/events', (req: Request, res: Response) => {
  try {
    const afterParam = Array.isArray(req.query.after) ? req.query.after[0] : req.query.after;
    const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = typeof limitParam === 'string' ? Number(limitParam) : (typeof limitParam === 'number' ? limitParam : undefined);
    const { events, latestEventId } = (obdConnectionManager as any).getEvents({
      newerThanId: typeof afterParam === 'string' && afterParam.length ? afterParam : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json({ ok: true, events, latestEventId });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
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

type DiagnosticOperationHandler<T> = (driver: Elm327Driver) => Promise<T>;

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
      // Агрегация severity — используем динамический доступ (в ранних версиях DtcEntry может не содержать поле severity)
      const severity = dtcs.reduce(
        (acc, dtc) => {
          const s = (dtc as any)?.severity;
          if (s === 'critical') acc.critical += 1;
          else if (s === 'warning') acc.warning += 1;
          else acc.info += 1;
          return acc;
        },
        { critical: 0, warning: 0, info: 0 }
      );
      return {
        total: dtcs.length,
        severity,
        hasDescriptions: dtcs.every((dtc) => typeof (dtc as any).description === 'string' && (dtc as any).description.length > 0),
      };
    }
    case 'status': {
      const status = payload.data as ObdStatus;
      const st: any = status;
      return {
        milOn: typeof st.milOn !== 'undefined' ? st.milOn : (typeof st.mil !== 'undefined' ? st.mil : false),
        dtcCount: typeof st.dtcCount === 'number' ? st.dtcCount : (typeof st.totalDtc === 'number' ? st.totalDtc : 0),
        readySystems: st.readiness && typeof st.readiness === 'object'
          ? Object.values(st.readiness).filter((ready: any) => ready).length
          : 0,
      };
    }
    case 'live_data': {
      const live = payload.data as ObdLiveData;
      const present = Object.entries(live).filter(([, value]) => value != null).length;
      return {
        fields: present,
        rpm: (live as any).rpm,
        coolantTempC: (live as any).coolantTempC ?? (live as any).coolantTemp,
        vehicleSpeedKmh: (live as any).vehicleSpeedKmh ?? (live as any).speed,
        batteryVoltageV: (live as any).batteryVoltageV ?? (live as any).voltage,
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

async function ensureDriverConnected(options?: ObdConnectOptions): Promise<Elm327Driver> {
  const driver = await obdConnectionManager.ensureConnected(options);
  if (!driver) {
    throw new ObdNotConnectedError();
  }
  return driver;
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

async function handleDiagnosticOperation<T>(
  res: Response,
  operation: DiagnosticOperation,
  handler: DiagnosticOperationHandler<T>,
  context?: DiagnosticOperationContext
): Promise<void> {
  if (obdConnectionManager.getSnapshot().state !== 'connected') {
    respondObdNotConnected(res);
    return;
  }

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
  summarizeSuccess: (value: unknown) => summarizeDiagnosticSuccess(operation, value),
  summarizeFailure: (value: unknown) => summarizeDiagnosticFailure(operation, value),
    });

    if (hasOkResult(result)) {
      res.status(result.ok ? 200 : 500).json({
        ...result,
        diagnostics: diagnosticSessionManager.getSnapshot(),
        connection: obdConnectionManager.getSnapshot(),
      });
      // Fire-and-forget success hook to avoid delaying the response
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
  intent: record,
  breakdown: { subtotal: record.amount, currency: record.currency },
  createdAt: record.createdAt,
  lastStatus: record.status
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
  res.json({ ok: true, intent: record, breakdown: { subtotal: record.amount, currency: record.currency } })
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
  id: parsed.data.id,
      meta: parsed.data.meta
    })
    if (!record) {
      res.status(404).json({ ok: false, error: 'intent_not_found' })
      return
    }
  res.json({ ok: true, intent: record, breakdown: { subtotal: record.amount, currency: record.currency } })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'payments_manual_confirm_failed', message: error?.message ?? String(error) })
  }
}

app.post('/payments/manual-confirm', handleManualConfirm)
app.post('/admin/payments/manual-confirm', handleManualConfirm)

app.get('/payments/metrics', (_req: Request, res: Response) => {
  const snapshot = paymentModule.getMetricsSnapshot()
  res.json({ ok: true, snapshot, capturedAt: new Date().toISOString() })
})

app.get('/monitoring/alerts', (_req: Request, res: Response) => {
  const capturedAt = new Date();
  const snapshot = paymentModule.getMetricsSnapshot();
  let bleMetrics: any = undefined;
  try {
    const driver = getBleDriver();
    bleMetrics = driver.getMetrics();
  } catch {}
  const alerts = evaluateAlerts({
    environment: agentEnv,
    timestamp: capturedAt.toISOString(),
    payments: snapshot,
    ble: bleMetrics ? {
      queueDepth: bleMetrics.queueDepth,
      maxQueueDepthObserved: bleMetrics.maxQueueDepthObserved,
      watchdogTriggers: bleMetrics.watchdogTriggers,
      lastWatchdogTriggerAt: bleMetrics.lastWatchdogTriggerAt,
      lastReconnectAt: bleMetrics.lastReconnectAt,
      lastReconnectDurationSeconds: bleMetrics.lastReconnectDurationSeconds,
      totalReconnectDurationSeconds: bleMetrics.totalReconnectDurationSeconds,
      secondsSinceLastReconnect: (function() {
        if (bleMetrics.lastReconnectAt) {
          return Math.max(0, (Date.now() - Date.parse(bleMetrics.lastReconnectAt)) / 1000);
        }
        return undefined;
      })(),
      secondsSinceLastWatchdogTrigger: (function() {
        if (bleMetrics.lastWatchdogTriggerAt) {
          return Math.max(0, (Date.now() - Date.parse(bleMetrics.lastWatchdogTriggerAt)) / 1000);
        }
        return undefined;
      })(),
      averageLatencyMs: bleMetrics.averageLatencyMs,
      lastDurationMs: bleMetrics.lastDurationMs,
      lastCommandCompletedAt: bleMetrics.lastCommandCompletedAt,
      secondsSinceLastCommandCompleted: (function() {
        if (bleMetrics.lastCommandCompletedAt) {
          return Math.max(0, (Date.now() - Date.parse(bleMetrics.lastCommandCompletedAt)) / 1000);
        }
        return undefined;
      })(),
    } : undefined,
  });
  res.json({ ok: true, alerts, capturedAt: capturedAt.toISOString(), bleIncluded: !!bleMetrics });
});

// Endpoint: monitoring active apps + presence state
app.get('/monitoring/active-apps', (_req: Request, res: Response) => {
  const active: string[] = [];
  try {
    const bleDriverInst = bleDriver || null;
    if (bleDriverInst && (bleDriverInst as any).connected) active.push('ble_obd');
  } catch {}
  try {
    const thk = thicknessManager.getSnapshot();
    if (thk && thk.state === 'active') active.push('thickness');
  } catch {}
  try {
    const diag = diagnosticSessionManager.getSnapshot();
    if (diag && (diag as any).activeOperation) active.push('diagnostics');
  } catch {}
  const presenceState = presenceService ? presenceService.getState() : null;
  res.json({
    ok: true,
    capturedAt: new Date().toISOString(),
    activeApps: active,
    presence: presenceState,
  });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    if (typeof (paymentsPromCollector as any).update === 'function') {
      (paymentsPromCollector as any).update()
    }
    // BLE метрики формируются через события драйвера (без расчёта дельт здесь)
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

// OBD REST API routes
const obdRoutes = createObdRoutes();
app.use(obdRoutes);

// Thickness gauge REST API routes
const thicknessRoutes = createThicknessRoutes();
app.use(thicknessRoutes);

// Media optimization routes (imgproxy)
app.use(createMediaRoutes());

// Archive routes (Seafile sync)
app.use(createArchiveRoutes());

// Admin console API routes
import adminRoutes from './api/routes/admin.routes.js';
// Keep legacy '/api' mounting
app.use('/api', adminRoutes);
// Also provide '/admin' prefix to match admin UI endpoints
app.use('/admin', adminRoutes);

// Serve admin console static files
app.use('/admin', express.static(path.join(__dirname, '../../kiosk-admin/dist')));

// BLE driver metrics exposure (Kingbolen Ediag)
import { KingbolenEdiagDriver } from './devices/ble/KingbolenEdiagDriver.js';
let bleDriver: KingbolenEdiagDriver | null = null;
function getBleDriver(): KingbolenEdiagDriver {
  if (!bleDriver) {
    bleDriver = new KingbolenEdiagDriver({});
    // Подписка на события для Prometheus (если ensureBleDriver не вызван)
    bleDriver.on('ble_connect_attempt', () => {
      bleProm.connectionsTotal.inc({ phase: 'connect', result: 'attempt' }, 1);
      bleProm.connectionState.set(1);
    });
    bleDriver.on('ble_connected', (info: any) => {
      bleProm.connectionsTotal.inc({ phase: 'full', result: 'success' }, 1);
      if (typeof info?.durationSeconds === 'number') bleProm.connectionDuration.observe({ phase: 'full' }, info.durationSeconds);
      if (typeof info?.rssi === 'number') bleProm.lastRssi.set(info.rssi);
      bleProm.connectionState.set(2);
    });
    bleDriver.on('ble_command_sent', (d: any) => { if (typeof d?.bytes === 'number') bleProm.bytesSentTotal.inc(d.bytes); });
    bleDriver.on('ble_data_received', (d: any) => { if (typeof d?.bytes === 'number') bleProm.bytesReceivedTotal.inc(d.bytes); });
    bleDriver.on('ble_command_completed', (d: any) => {
      bleProm.commandsTotal.inc({ status: 'ok' }, 1);
      if (typeof d?.durationMs === 'number') bleProm.commandLatency.observe(d.durationMs / 1000);
    });
    bleDriver.on('ble_command_failed', () => { bleProm.commandsTotal.inc({ status: 'error' }, 1); });
  bleDriver.on('ble_disconnected', () => { bleProm.disconnectsTotal.inc(1); bleProm.connectionState.set(0); });
    bleDriver.on('ble_reconnect_attempt', () => { bleProm.reconnectAttemptsTotal.inc(1); bleProm.connectionState.set(1); });
    bleDriver.on('ble_reconnect_success', () => { bleProm.reconnectSuccessTotal.inc(1); bleProm.connectionState.set(2); });
    bleDriver.on('ble_reconnect_failed', () => { bleProm.reconnectFailedTotal.inc(1); bleProm.connectionState.set(0); });
    // Дополнительные метрики глубины очереди и watchdog
    bleDriver.on('ble_command_sent', () => {
      try {
        const m = bleDriver?.getMetrics();
        if (m && typeof (m as any).queueDepth === 'number') bleProm.queueDepth.set((m as any).queueDepth);
        if (m && typeof (m as any).maxQueueDepthObserved === 'number') bleProm.maxQueueDepthObserved.set((m as any).maxQueueDepthObserved);
      } catch {}
    });
    bleDriver.on('ble_command_completed', () => {
      try {
        const m = bleDriver?.getMetrics();
        if (m && typeof (m as any).queueDepth === 'number') bleProm.queueDepth.set((m as any).queueDepth);
      } catch {}
    });
    bleDriver.on('ble_reconnect_success', () => {
      try {
        const m = bleDriver?.getMetrics();
        if (m && typeof (m as any).lastReconnectDurationSeconds === 'number') {
          bleProm.lastReconnectDuration.set((m as any).lastReconnectDurationSeconds);
          bleProm.reconnectDuration.observe({ phase: 'success' }, (m as any).lastReconnectDurationSeconds);
        }
        if (m && typeof (m as any).totalReconnectDurationSeconds === 'number' && typeof (m as any).lastReconnectDurationSeconds === 'number') {
          // Инкрементируем на длительность последнего успешного reconnect
          bleProm.totalReconnectDuration.inc((m as any).lastReconnectDurationSeconds);
        }
        // Обновить gauge secondsSinceLastReconnect (сразу 0)
        bleProm.secondsSinceLastReconnect.set(0);
      } catch {}
    });
    bleDriver.on('ble_watchdog_trigger', () => { bleProm.watchdogTriggersTotal.inc(1); });
    bleDriver.on('ble_watchdog_trigger', () => {
      // При триггере watchdog обнуляем счётчик времени с последнего watchdog события
      bleProm.secondsSinceLastWatchdogTrigger.set(0);
    });
    // Периодический апдейт относительных метрик (каждые ~5 секунд)
    setInterval(() => {
      try {
        const m = bleDriver?.getMetrics();
        const now = Date.now();
        if (m && m.lastReconnectAt) {
          const diffSec = Math.max(0, (now - Date.parse(m.lastReconnectAt)) / 1000);
          bleProm.secondsSinceLastReconnect.set(diffSec);
        } else {
          bleProm.secondsSinceLastReconnect.set(-1);
        }
        if (m && m.lastWatchdogTriggerAt) {
          const diffSecWd = Math.max(0, (now - Date.parse(m.lastWatchdogTriggerAt)) / 1000);
          bleProm.secondsSinceLastWatchdogTrigger.set(diffSecWd);
        } else {
          bleProm.secondsSinceLastWatchdogTrigger.set(-1);
        }
      } catch {}
    }, 5000).unref();
  }
  return bleDriver;
}

// Endpoint: BLE metrics snapshot (no connect attempt if already connected)
app.get('/api/admin/ble/metrics', async (_req: Request, res: Response) => {
  try {
    const driver = getBleDriver();
    // Опционально: если подключено — просто вернуть метрики, иначе попытаться подключиться с коротким таймаутом
    if (!(driver as any).connected) {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 3000);
      try { await driver.connect(abort.signal); } catch (e) { /* игнорируем для метрик */ } finally { clearTimeout(timeout); }
    }
    res.json({ ok: true, metrics: driver.getMetrics(), capturedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'ble_metrics_failed', message: error?.message ?? String(error) });
  }
});

// Supabase connectivity health (lightweight)
// Lightweight Supabase feature flags fetcher (inline, avoids full store dependency path issues)
let supabaseStoreLite: { getFeatureFlags: () => Promise<Record<string, boolean>> } | null = null;
function getSupabaseStore() {
  if (supabaseStoreLite) return supabaseStoreLite;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) {
    supabaseStoreLite = { async getFeatureFlags() { return {}; } };
    return supabaseStoreLite;
  }
  // динамический импорт без типов — минимальная реализация через REST
  supabaseStoreLite = {
    async getFeatureFlags() {
      try {
        const req = await fetch(`${url}/rest/v1/feature_flags?select=flag_name,enabled&enabled=eq.true`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'count=none'
          }
        });
        if (!req.ok) return {};
        const data = await req.json();
        const rows = data as any[];
        const out: Record<string, boolean> = {};
        for (const row of rows) {
          if (row && typeof row.flag_name === 'string') out[row.flag_name] = !!row.enabled;
        }
        return out;
      } catch {
        return {};
      }
    }
  };
  return supabaseStoreLite;
}

app.get('/health/supabase', async (_req: Request, res: Response) => {
  try {
    const store = getSupabaseStore();
    // Простая операция: получить фич-флаги (должна вернуть объект, даже пустой)
    const flags = await store.getFeatureFlags();
    res.json({ ok: true, flagsCount: Object.keys(flags).length, capturedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'supabase_unhealthy', message: error?.message ?? String(error) });
  }
});

// Presence: active clients list
app.get('/api/admin/presence/clients', async (_req: Request, res: Response) => {
  try {
    if (!presenceService) {
      res.status(200).json({ ok: true, clients: [], mode: 'disabled' });
      return;
    }
    const clients = await presenceService.getActiveClients();
    res.json({ ok: true, clients, capturedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'presence_fetch_failed', message: error?.message ?? String(error) });
  }
});
