import { InMemoryPaymentProvider, PaymentIntent, PaymentService, PaymentStatus } from '@selfservice/payments';
import { InMemoryPaymentMetrics, PaymentMetricsSnapshot } from './metrics.js';
import { PaymentsFallbackLogger, type AgentEnv } from './fallback-logger.js';

export interface PaymentSessionBreakdown {
  gross: number;
  net: number;
  partner?: {
    name: string;
    sharePercent: number;
    shareAmount: number;
  } | null;
}

export interface PaymentSessionRecord {
  intent: PaymentIntent;
  breakdown: PaymentSessionBreakdown;
  createdAtIso: string;
  lastStatus: PaymentStatus;
}

export interface CreateIntentInput {
  amount: number;
  currency: string;
  meta?: Record<string, unknown>;
}

export interface CreateIntentResult {
  intent: PaymentIntent;
  breakdown: PaymentSessionBreakdown;
}

export interface ManualConfirmationInput {
  intentId: string;
  operatorId: string;
  note?: string;
  meta?: Record<string, unknown>;
}

const REVSHARE_PCT = clampPercent(Number(process.env.REVSHARE_PCT ?? '0.04'));

export class PaymentModule {
  private readonly service: PaymentService;
  private readonly provider: any;
  private readonly metrics: InMemoryPaymentMetrics;
  private readonly fallbackLogger: PaymentsFallbackLogger;
  private readonly sessions = new Map<string, PaymentSessionRecord>();
  private readonly environment: AgentEnv;

  constructor(environment: AgentEnv) {
    this.environment = environment;
    this.metrics = new InMemoryPaymentMetrics();
    this.fallbackLogger = new PaymentsFallbackLogger();

    // Choose provider based on environment and configuration
    this.provider = this.createProvider(environment);
    this.service = new PaymentService(this.provider, { environment, metricsCollector: this.metrics });
  }

  private createProvider(environment: AgentEnv): any {
    // Try to use YooKassa only in PROD and only if deps are present; otherwise fallback gracefully
    if (environment === 'PROD' && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
      try {
        // Dynamic import to avoid hard dependency during tests/DEV
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('@selfservice/payments');
        if (pkg && pkg.YooKassaPaymentProvider) {
          console.log('[payments] Using YooKassa provider');
          return new pkg.YooKassaPaymentProvider({
            shopId: process.env.YOOKASSA_SHOP_ID,
            secretKey: process.env.YOOKASSA_SECRET_KEY,
            returnUrl: process.env.YOOKASSA_RETURN_URL
          });
        }
        console.warn('[payments] YooKassa provider not available in @selfservice/payments, falling back to InMemory');
      } catch (err) {
        console.warn('[payments] Failed to load YooKassa provider, falling back to InMemory:', (err as any)?.message || err);
      }
    }
    // Fallback (DEV/QA): in-memory provider with dev confirm
    console.log(`[payments] Using InMemory provider (environment: ${environment})`);
    return new InMemoryPaymentProvider({ allowDevConfirm: environment === 'DEV' });
  }

  async updateFromWebhook(yookassaId: string, status: string, meta?: Record<string, unknown>): Promise<boolean> {
    // If provider has webhook update method, use it
    if (typeof this.provider.updateFromWebhook === 'function') {
      return this.provider.updateFromWebhook(yookassaId, status, meta);
    }
    return false;
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const intent = await this.service.createIntent(input.amount, input.currency, input.meta);
    const breakdown = computeBreakdown(intent.amount, intent.meta);
    const record: PaymentSessionRecord = {
      intent,
      breakdown,
      createdAtIso: resolveCreatedAt(intent),
      lastStatus: intent.status,
    };
    this.sessions.set(intent.id, record);
    return { intent, breakdown };
  }

  async getIntent(intentId: string): Promise<PaymentSessionRecord | null> {
    const existing = this.sessions.get(intentId);
    if (existing) {
      if (existing.intent.history?.length) {
        existing.lastStatus = existing.intent.history[existing.intent.history.length - 1]!.status;
      }
      return existing;
    }
    const intent = await this.service.getIntent(intentId).catch(() => null);
    if (!intent) return null;
    const breakdown = computeBreakdown(intent.amount, intent.meta);
    const record: PaymentSessionRecord = {
      intent,
      breakdown,
      createdAtIso: resolveCreatedAt(intent),
      lastStatus: intent.status,
    };
    this.sessions.set(intent.id, record);
    return record;
  }

  async getStatus(intentId: string): Promise<PaymentStatus | null> {
    const status = await this.service.getStatus(intentId).catch(() => null);
    if (!status) return null;
    const session = this.sessions.get(intentId);
    if (session) {
      session.lastStatus = status;
      session.intent.status = status;
    }
    return status;
  }

  async confirmDev(intentId: string): Promise<PaymentSessionRecord | null> {
    const intent = await this.service.confirmDevPayment(intentId).catch(() => null);
    if (!intent) return null;
    const session = await this.ensureSession(intent);
    session.intent = intent;
    session.lastStatus = intent.status;
    return session;
  }

  async manualConfirm(input: ManualConfirmationInput): Promise<PaymentSessionRecord | null> {
    if (!input.operatorId) {
      throw new Error('operatorId required for manual confirmation');
    }
    const intent = await this.service.markManualConfirmation(input.intentId, {
      operatorId: input.operatorId,
      note: input.note,
      meta: input.meta,
    }).catch(() => null);
    if (!intent) return null;
    const session = await this.ensureSession(intent);
    session.intent = intent;
    session.lastStatus = intent.status;
    await this.fallbackLogger.appendManualConfirmation({
      intent,
      operatorId: input.operatorId,
      note: input.note,
      meta: input.meta,
      environment: this.environment,
    });
    return session;
  }

  getMetricsSnapshot(): PaymentMetricsSnapshot {
    return this.metrics.getSnapshot();
  }

  getMetricsEvents() {
    return this.metrics.getEvents();
  }

  private async ensureSession(intent: PaymentIntent): Promise<PaymentSessionRecord> {
    const existing = this.sessions.get(intent.id);
    if (existing) {
      existing.intent = intent;
      existing.lastStatus = intent.status;
      return existing;
    }
    const breakdown = computeBreakdown(intent.amount, intent.meta);
    const record: PaymentSessionRecord = {
      intent,
      breakdown,
      createdAtIso: resolveCreatedAt(intent),
      lastStatus: intent.status,
    };
    this.sessions.set(intent.id, record);
    return record;
  }
}

function computeBreakdown(amount: number, meta?: Record<string, unknown>): PaymentSessionBreakdown {
  const partner = resolvePartner(meta?.service);
  if (!partner) {
    return { gross: amount, net: amount };
  }
  const shareAmount = Math.round(amount * partner.sharePercent);
  return {
    gross: amount,
    net: amount - shareAmount,
    partner: {
      name: partner.name,
      sharePercent: partner.sharePercent,
      shareAmount,
    },
  };
}

function resolvePartner(service: unknown): { name: string; sharePercent: number } | null {
  if (service === 'obd') {
    return { name: 'Diagzone PRO', sharePercent: REVSHARE_PCT };
  }
  if (service === 'thickness') {
    return { name: 'rDevice', sharePercent: REVSHARE_PCT };
  }
  return null;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0.04;
  }
  return Math.min(0.05, Math.max(0, value));
}

function resolveCreatedAt(intent: PaymentIntent): string {
  const firstHistory = intent.history && intent.history.length > 0 ? intent.history[0] : null;
  return firstHistory?.timestampIso ?? new Date().toISOString();
}
