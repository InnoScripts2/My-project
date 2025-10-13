export class PaymentModule {
    intents = new Map();
    env;
    constructor(environment) {
        this.env = environment;
    }
    createIntent(payload) {
        const id = this.buildIntentId();
        const intent = {
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
    getStatus(id) {
        const intent = this.intents.get(id);
        return intent ? intent.status : 'not_found';
    }
    getIntent(id) {
        return this.intents.get(id);
    }
    confirmDev(id) {
        const intent = this.intents.get(id);
        if (!intent)
            return undefined;
        intent.status = 'confirmed';
        intent.confirmedAt = new Date().toISOString();
        return intent;
    }
    manualConfirm(payload) {
        const intent = this.intents.get(payload.id);
        if (!intent)
            return undefined;
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
    buildIntentId() {
        const random = Math.random().toString(36).slice(2, 8);
        return `pi_${Date.now()}_${random}`;
    }
}
