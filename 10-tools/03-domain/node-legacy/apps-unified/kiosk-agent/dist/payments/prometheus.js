import { Gauge, Registry } from 'prom-client';
export function createPaymentsPrometheusCollector(paymentModule, options = {}) {
    const register = options.register ?? new Registry();
    const totalIntents = new Gauge({
        name: 'payments_total_intents',
        help: 'Total number of payment intents observed by the agent',
        registers: [register]
    });
    const pendingOver90s = new Gauge({
        name: 'payments_pending_over_90_seconds',
        help: 'Number of payment intents that remain pending for more than 90 seconds',
        registers: [register]
    });
    const manualConfirmations = new Gauge({
        name: 'payments_manual_confirmations_total',
        help: 'Count of payment intents manually confirmed by operators',
        registers: [register]
    });
    const devConfirmations = new Gauge({
        name: 'payments_dev_confirmations_total',
        help: 'Count of payment intents force-confirmed in DEV environment',
        registers: [register]
    });
    const lastEventTimestamp = new Gauge({
        name: 'payments_last_event_timestamp_seconds',
        help: 'Unix timestamp of the most recent payment metrics event observed',
        registers: [register]
    });
    return {
        register,
        update() {
            const snapshot = paymentModule.getMetricsSnapshot();
            totalIntents.set(snapshot.totalIntents);
            pendingOver90s.set(snapshot.pendingOver90s);
            manualConfirmations.set(snapshot.manualConfirmations);
            devConfirmations.set(snapshot.devConfirmations);
            if (snapshot.lastEventAt) {
                const parsed = Date.parse(snapshot.lastEventAt);
                if (!Number.isNaN(parsed)) {
                    lastEventTimestamp.set(parsed / 1000);
                    return;
                }
            }
            lastEventTimestamp.set(0);
        }
    };
}
