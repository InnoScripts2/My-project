/**
 * Unified payment service for kiosk-agent
 */

import { PaymentStore, type PaymentRecord } from './payment-store.js';
import { YooKassaAdapter, type YooKassaConfig } from './payment-providers/yookassa.js';
import { DevPaymentProvider, type DevPaymentConfig } from './payment-providers/dev.js';

export interface PaymentServiceConfig {
  environment: 'DEV' | 'PROD';
  provider: 'dev' | 'yookassa';
  devConfig?: DevPaymentConfig;
  yookassaConfig?: YooKassaConfig;
  dbPath?: string;
}

export interface CreateIntentInput {
  amount: number;
  currency: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntent {
  intentId: string;
  amount: number;
  currency: string;
  status: string;
  qrCodeData?: string;
  qrCodeUrl?: string;
  createdAt: number;
  expiresAt: number;
}

export class PaymentService {
  private store: PaymentStore;
  private provider: YooKassaAdapter | DevPaymentProvider;
  private environment: 'DEV' | 'PROD';

  constructor(config: PaymentServiceConfig) {
    this.environment = config.environment;
    this.store = new PaymentStore(config.dbPath);

    if (config.provider === 'yookassa' && config.yookassaConfig) {
      this.provider = new YooKassaAdapter(config.yookassaConfig);
    } else if (config.provider === 'dev' || config.environment === 'DEV') {
      this.provider = new DevPaymentProvider(config.devConfig);
    } else {
      throw new Error('Invalid payment provider configuration');
    }
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    try {
      const response = await this.provider.createPayment({
        amount: input.amount,
        currency: input.currency,
        description: `Payment for session ${input.sessionId || 'unknown'}`,
        metadata: input.metadata,
      });

      const now = Date.now();
      const expiresAt = response.expires_at 
        ? new Date(response.expires_at).getTime()
        : now + 600000; // 10 minutes default

      const confirmation = response.confirmation;
      const qrCodeUrl = confirmation && typeof confirmation === 'object' && 'confirmation_url' in confirmation
        ? (confirmation as { confirmation_url?: string }).confirmation_url
        : undefined;

      const record: PaymentRecord = {
        intentId: response.id,
        sessionId: input.sessionId,
        amount: input.amount,
        currency: input.currency,
        status: 'pending',
        provider: this.environment === 'DEV' ? 'dev' : 'yookassa',
        qrCodeData: response.confirmation?.confirmation_data,
        qrCodeUrl,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };

      this.store.save(record);

      return {
        intentId: record.intentId,
        amount: record.amount,
        currency: record.currency,
        status: record.status,
        qrCodeData: record.qrCodeData,
        qrCodeUrl: record.qrCodeUrl,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      };

    } catch (error: any) {
      console.error('[PaymentService] Create intent error:', error);
      throw error;
    }
  }

  async getStatus(intentId: string): Promise<string | null> {
    const record = this.store.get(intentId);
    if (!record) return null;

    // Check with provider for latest status
    try {
      const providerStatus = await this.provider.getPaymentStatus(intentId);
      
      // Map provider status to our status
      const mappedStatus = this.mapProviderStatus(providerStatus);
      
      if (mappedStatus !== record.status) {
        this.store.update(intentId, { 
          status: mappedStatus as any,
          ...(mappedStatus === 'confirmed' ? { confirmedAt: Date.now() } : {})
        });
      }

      return mappedStatus;
    } catch (error) {
      console.error('[PaymentService] Get status error:', error);
      return record.status;
    }
  }

  async getIntent(intentId: string): Promise<PaymentIntent | null> {
    const record = this.store.get(intentId);
    if (!record) return null;

    return {
      intentId: record.intentId,
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      qrCodeData: record.qrCodeData,
      qrCodeUrl: record.qrCodeUrl,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  async confirmDev(intentId: string): Promise<boolean> {
    if (this.environment !== 'DEV') {
      throw new Error('Manual confirmation only available in DEV mode');
    }

    if (!(this.provider instanceof DevPaymentProvider)) {
      throw new Error('Manual confirmation only available with DevPaymentProvider');
    }

    const confirmed = await this.provider.confirmPayment(intentId);
    
    if (confirmed) {
      this.store.update(intentId, {
        status: 'confirmed',
        confirmedAt: Date.now(),
      });
    }

    return confirmed;
  }

  async cancel(intentId: string): Promise<boolean> {
    const record = this.store.get(intentId);
    if (!record) return false;

    if (this.provider instanceof DevPaymentProvider) {
      await this.provider.cancelPayment(intentId);
    }

    this.store.update(intentId, { status: 'expired' });
    return true;
  }

  async processWebhook(body: any, signature?: string): Promise<boolean> {
    try {
      if (!(this.provider instanceof YooKassaAdapter)) {
        console.warn('[PaymentService] Webhooks only supported for YooKassa');
        return false;
      }

      const result = await this.provider.processWebhook(body, signature);
      const mappedStatus = this.mapProviderStatus(result.status);

      const updated = this.store.update(result.intentId, {
        status: mappedStatus as any,
        ...(mappedStatus === 'confirmed' ? { confirmedAt: Date.now() } : {})
      });

      return updated;

    } catch (error: any) {
      console.error('[PaymentService] Webhook processing error:', error);
      return false;
    }
  }

  private mapProviderStatus(providerStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'waiting_for_capture': 'pending',
      'succeeded': 'confirmed',
      'canceled': 'expired',
      'failed': 'failed',
    };

    return statusMap[providerStatus] || providerStatus;
  }

  close(): void {
    this.store.close();
  }
}
