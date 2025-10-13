export type PaymentStatus = 'created' | 'confirmed' | 'manual';

export interface PaymentIntentRecord {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  meta?: Record<string, unknown>;
  createdAt: string;
  confirmedAt?: string;
  environment: string;
}

export interface CreateIntentPayload {
  amount: number;
  currency: string;
  meta?: Record<string, unknown>;
}

export interface ManualConfirmPayload {
  id: string;
  meta?: Record<string, unknown>;
}

export class PaymentModule {
  private readonly intents = new Map<string, PaymentIntentRecord>();
  private readonly env: string;

  constructor(environment: string) {
    this.env = environment;
  }

  createIntent(payload: CreateIntentPayload) {
    const id = this.buildIntentId();
    const intent: PaymentIntentRecord = {
      id,
      amount: payload.amount,
      currency: payload.currency,
      status: 'created',
      meta: payload.meta,
      createdAt: new Date().toISOString(),
      environment: this.env,
    };

    this.intents.set(id, intent);

    return {
      intent,
      breakdown: {
        subtotal: payload.amount,
        currency: payload.currency,
      },
    };
  }

  getStatus(id: string): PaymentStatus | 'not_found' {
    const intent = this.intents.get(id);
    return intent ? intent.status : 'not_found';
  }

  getIntent(id: string) {
    return this.intents.get(id);
  }

  confirmDev(id: string) {
    const intent = this.intents.get(id);
    if (!intent) return undefined;
    intent.status = 'confirmed';
    intent.confirmedAt = new Date().toISOString();
    return intent;
  }

  manualConfirm(payload: ManualConfirmPayload) {
    const intent = this.intents.get(payload.id);
    if (!intent) return undefined;
    intent.status = 'manual';
    intent.meta = {
      ...intent.meta,
      ...payload.meta,
    };
    return intent;
  }

  getMetricsSnapshot() {
    const intents = [...this.intents.values()];
    const confirmed = intents.filter(intent => intent.status === 'confirmed').length;
    const manual = intents.filter(intent => intent.status === 'manual').length;
    return {
      total: intents.length,
      confirmed,
      manual,
    };
  }

  private buildIntentId() {
    const random = Math.random().toString(36).slice(2, 8);
    return `pi_${Date.now()}_${random}`;
  }
}
