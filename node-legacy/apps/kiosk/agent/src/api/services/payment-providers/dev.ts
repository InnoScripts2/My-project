/**
 * DEV-only payment provider for testing
 * MUST NOT be used in production
 */

export interface DevPaymentConfig {
  autoConfirmDelayMs?: number;
  manualMode?: boolean;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  id: string;
  status: string;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_data?: string;
  };
  metadata?: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

export class DevPaymentProvider {
  private config: Required<DevPaymentConfig>;
  private payments: Map<string, PaymentResponse> = new Map();

  constructor(config?: DevPaymentConfig) {
    this.config = {
      autoConfirmDelayMs: config?.autoConfirmDelayMs || 2000,
      manualMode: config?.manualMode || false,
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResponse> {
    const intentId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const payment: PaymentResponse = {
      id: intentId,
      status: 'pending',
      amount: {
        value: (input.amount / 100).toFixed(2),
        currency: input.currency,
      },
      confirmation: {
        type: 'qr',
        confirmation_data: `DEV_QR_${intentId}`,
      },
      metadata: input.metadata,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };

    this.payments.set(intentId, payment);

    // Auto-confirm if not in manual mode
    if (!this.config.manualMode) {
      setTimeout(() => {
        const current = this.payments.get(intentId);
        if (current && current.status === 'pending') {
          current.status = 'succeeded';
          console.log(`[DevPaymentProvider] Auto-confirmed payment ${intentId}`);
        }
      }, this.config.autoConfirmDelayMs);
    }

    console.log('[DevPaymentProvider] Created payment:', intentId);
    return payment;
  }

  async getPaymentStatus(paymentId: string): Promise<string> {
    const payment = this.payments.get(paymentId);
    return payment?.status || 'unknown';
  }

  async confirmPayment(paymentId: string): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (!payment) return false;
    
    if (payment.status !== 'pending') {
      console.warn(`[DevPaymentProvider] Cannot confirm payment ${paymentId} with status ${payment.status}`);
      return false;
    }

    payment.status = 'succeeded';
    console.log(`[DevPaymentProvider] Manually confirmed payment ${paymentId}`);
    return true;
  }

  async cancelPayment(paymentId: string): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (!payment) return false;

    payment.status = 'canceled';
    console.log(`[DevPaymentProvider] Canceled payment ${paymentId}`);
    return true;
  }
}
