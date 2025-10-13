/**
 * Prometheus metrics для Cycle-2 коннектора
 * Метрики для платежей, замков, watchdog и build info
 */
import { Counter, Gauge } from 'prom-client';
export function registerCycle2Metrics(registry) {
    // Payments metrics
    const paymentsIntentCreated = new Counter({
        name: 'payments_intent_created_total',
        help: 'Total number of payment intents created',
        labelNames: ['provider', 'service'],
        registers: [registry],
    });
    const paymentsStatusTransitions = new Counter({
        name: 'payments_status_transitions_total',
        help: 'Total number of payment status transitions',
        labelNames: ['provider', 'from', 'to'],
        registers: [registry],
    });
    const paymentsWebhookVerified = new Counter({
        name: 'payments_webhook_verified_total',
        help: 'Total number of webhook verifications',
        labelNames: ['provider', 'ok'],
        registers: [registry],
    });
    const paymentsErrors = new Counter({
        name: 'payments_errors_total',
        help: 'Total number of payment errors',
        labelNames: ['provider', 'stage'],
        registers: [registry],
    });
    // Lock metrics
    const lockOpenAttempts = new Counter({
        name: 'lock_open_attempts_total',
        help: 'Total number of lock open attempts',
        labelNames: ['deviceType', 'result'],
        registers: [registry],
    });
    const lockState = new Gauge({
        name: 'lock_state',
        help: 'Current lock state (0=closed, 1=opened, 2=fault)',
        labelNames: ['deviceType'],
        registers: [registry],
    });
    // Watchdog metrics
    const watchdogRestarts = new Counter({
        name: 'watchdog_restarts_total',
        help: 'Total number of watchdog restarts',
        labelNames: ['reason'],
        registers: [registry],
    });
    // Build info
    const appBuildInfo = new Gauge({
        name: 'app_build_info',
        help: 'Build information (always 1)',
        labelNames: ['version', 'channel'],
        registers: [registry],
    });
    // Set build info
    const version = process.env.APP_VERSION || '0.1.0';
    const channel = process.env.AGENT_ENV || 'DEV';
    appBuildInfo.labels(version, channel).set(1);
    return {
        paymentsIntentCreated,
        paymentsStatusTransitions,
        paymentsWebhookVerified,
        paymentsErrors,
        lockOpenAttempts,
        lockState,
        watchdogRestarts,
        appBuildInfo,
    };
}
// Export singleton metrics collector
let metricsInstance = null;
export function getCycle2Metrics(registry) {
    if (!metricsInstance) {
        metricsInstance = registerCycle2Metrics(registry);
    }
    return metricsInstance;
}
