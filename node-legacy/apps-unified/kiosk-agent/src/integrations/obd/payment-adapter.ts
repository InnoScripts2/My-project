import { obdSessionManager } from './session-manager.js';

export interface PaymentIntent {
  intentId: string;
  qrCode?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt?: string;
}

export interface PaymentStatus {
  status: 'pending' | 'success' | 'failed' | 'manual_confirmed' | 'succeeded';
  timestamp: string;
}

export interface PaymentsModule {
  createIntent(params: {
    amount: number;
    currency: string;
    meta?: Record<string, unknown>;
  }): Promise<{ intent: any; breakdown?: any }>;
  getStatus(intentId: string): Promise<string | null>;
  confirmDev(intentId: string): Promise<any>;
}

export class ObdPaymentAdapter {
  private intentToSessionMap: Map<string, string> = new Map();

  constructor(private paymentsModule: PaymentsModule) {}

  async createDiagnosticsPayment(sessionId: string): Promise<PaymentIntent> {
    const session = obdSessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'completed') {
      throw new Error(`Session ${sessionId} is not completed yet`);
    }

    const result = await this.paymentsModule.createIntent({
      amount: 48000, // 480 RUB in kopecks
      currency: 'RUB',
      meta: {
        service: 'OBD_DIAGNOSTICS',
        sessionId,
        vehicleMake: session.vehicleMake,
        vehicleModel: session.vehicleModel,
      },
    });

    const intent = result.intent;
    this.intentToSessionMap.set(intent.id, sessionId);

    return {
      intentId: intent.id,
      qrCode: intent.confirmationUrl || intent.confirmation?.confirmation_url,
      amount: 480,
      currency: 'RUB',
      status: intent.status,
      createdAt: intent.createdAt,
    };
  }

  async checkPaymentStatus(intentId: string): Promise<PaymentStatus> {
    const status = await this.paymentsModule.getStatus(intentId);
    
    return {
      status: this.normalizeStatus(status || 'pending'),
      timestamp: new Date().toISOString(),
    };
  }

  async confirmPayment(intentId: string): Promise<boolean> {
    try {
      const result = await this.paymentsModule.confirmDev(intentId);
      
      if (result && (result.intent?.status === 'succeeded' || result.intent?.status === 'manual_confirmed')) {
        const sessionId = this.intentToSessionMap.get(intentId);
        if (sessionId) {
          obdSessionManager.markSessionPaid(sessionId);
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[ObdPaymentAdapter] confirmPayment failed:', error);
      return false;
    }
  }

  getSessionIdFromIntent(intentId: string): string | undefined {
    return this.intentToSessionMap.get(intentId);
  }

  private normalizeStatus(status: string): PaymentStatus['status'] {
    const normalized = status.toLowerCase();
    if (normalized === 'succeeded' || normalized === 'success' || normalized === 'manual_confirmed') {
      return 'succeeded';
    }
    if (normalized === 'failed' || normalized === 'canceled' || normalized === 'cancelled') {
      return 'failed';
    }
    return 'pending';
  }
}
