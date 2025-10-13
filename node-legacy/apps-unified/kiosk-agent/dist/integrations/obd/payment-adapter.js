import { obdSessionManager } from './session-manager.js';
export class ObdPaymentAdapter {
    constructor(paymentsModule) {
        this.paymentsModule = paymentsModule;
        this.intentToSessionMap = new Map();
    }
    async createDiagnosticsPayment(sessionId) {
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
    async checkPaymentStatus(intentId) {
        const status = await this.paymentsModule.getStatus(intentId);
        return {
            status: this.normalizeStatus(status || 'pending'),
            timestamp: new Date().toISOString(),
        };
    }
    async confirmPayment(intentId) {
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
        }
        catch (error) {
            console.error('[ObdPaymentAdapter] confirmPayment failed:', error);
            return false;
        }
    }
    getSessionIdFromIntent(intentId) {
        return this.intentToSessionMap.get(intentId);
    }
    normalizeStatus(status) {
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
