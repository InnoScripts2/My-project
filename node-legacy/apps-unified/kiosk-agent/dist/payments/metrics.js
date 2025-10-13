export class InMemoryPaymentMetrics {
    constructor(options = {}) {
        this.events = [];
        this.tracking = new Map();
        this.maxEvents = options.maxEvents ?? 500;
    }
    async record(event) {
        this.pushEvent(event);
        const entry = this.ensureTracking(event);
        entry.status = event.status;
        entry.lastEventTimestamp = this.resolveTimestamp(event);
        if (event.type === 'manual_confirmed') {
            entry.manualConfirmations += 1;
        }
        if (event.type === 'dev_confirmed') {
            entry.devConfirmations += 1;
        }
        if (event.type === 'intent_created') {
            entry.amount = event.amount;
            entry.currency = event.currency;
        }
    }
    getSnapshot(now = new Date()) {
        const nowMs = now.getTime();
        let pendingOver90s = 0;
        let manualConfirmations = 0;
        let devConfirmations = 0;
        const lastEvent = this.events[this.events.length - 1];
        for (const entry of this.tracking.values()) {
            if (entry.status === 'pending' && nowMs - entry.createdAt > 90000) {
                pendingOver90s += 1;
            }
            manualConfirmations += entry.manualConfirmations;
            devConfirmations += entry.devConfirmations;
        }
        return {
            totalIntents: this.tracking.size,
            pendingOver90s,
            manualConfirmations,
            devConfirmations,
            lastEventAt: lastEvent ? this.resolveIso(lastEvent) : undefined,
        };
    }
    getEvents() {
        return this.events;
    }
    getTracking(intentId) {
        return this.tracking.get(intentId);
    }
    pushEvent(event) {
        this.events.push(event);
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
    }
    ensureTracking(event) {
        const existing = this.tracking.get(event.intentId);
        if (existing) {
            if (event.type === 'intent_created') {
                existing.createdAt = this.resolveTimestamp(event);
            }
            return existing;
        }
        const createdAt = event.type === 'intent_created' ? this.resolveTimestamp(event) : Date.now();
        const entry = {
            intentId: event.intentId,
            createdAt,
            status: event.status,
            lastEventTimestamp: event.timestampIso ? Date.parse(event.timestampIso) : undefined,
            manualConfirmations: 0,
            devConfirmations: 0,
            amount: event.amount,
            currency: event.currency,
        };
        this.tracking.set(event.intentId, entry);
        return entry;
    }
    resolveTimestamp(event) {
        if (event.timestampIso) {
            const parsed = Date.parse(event.timestampIso);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
        return Date.now();
    }
    resolveIso(event) {
        if (event.timestampIso) {
            return event.timestampIso;
        }
        const timestamp = this.resolveTimestamp(event);
        return new Date(timestamp).toISOString();
    }
}
