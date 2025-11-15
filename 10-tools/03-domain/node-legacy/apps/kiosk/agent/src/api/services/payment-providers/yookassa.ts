/**
 * YooKassa payment provider adapter
 */

export interface YooKassaConfig {
  shopId: string;
  secretKey: string;
  webhookUrl?: string;
  returnUrl?: string;
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
    confirmation_url?: string;
    confirmation_data?: string;
  };
  metadata?: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

export class YooKassaAdapter {
  private config: YooKassaConfig;

  constructor(config: YooKassaConfig) {
    this.config = config;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResponse> {
    // Real implementation would use YooKassa API
    // For now, return a mock response structure
    const intentId = `yk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    console.log('[YooKassaAdapter] Creating payment:', input);
    console.warn('[YooKassaAdapter] Using mock implementation - configure shopId and secretKey for production');

    return {
      id: intentId,
      status: 'pending',
      amount: {
        value: (input.amount / 100).toFixed(2),
        currency: input.currency,
      },
      confirmation: {
        type: 'qr',
        confirmation_data: `https://yookassa.ru/checkout/${intentId}`,
      },
      metadata: input.metadata,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };
  }

  async getPaymentStatus(paymentId: string): Promise<string> {
    // Real implementation would fetch from YooKassa API
    console.log('[YooKassaAdapter] Getting payment status:', paymentId);
    console.warn('[YooKassaAdapter] Using mock implementation');
    
    return 'pending';
  }

  async processWebhook(body: any, signature?: string): Promise<{ intentId: string; status: string }> {
    // Real implementation would validate signature and process webhook
    console.log('[YooKassaAdapter] Processing webhook:', body);
    console.warn('[YooKassaAdapter] Using mock implementation');

    return {
      intentId: body.object?.id || body.id,
      status: body.object?.status || body.status || 'pending',
    };
  }

  private validateSignature(body: string, signature: string): boolean {
    // Real implementation would validate HMAC signature
    return true;
  }
}
