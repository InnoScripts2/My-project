import type { PaymentModule } from './payment-module.js';
export interface PaymentsCollectorOptions {
    register?: {
        registerMetric(metric: {
            name?: string;
        }): void;
    };
}
export interface PaymentsCollector {
    register(): void;
    update(): void;
}
/**
 * Minimal Prometheus collector placeholder for the in-memory payment module.
 */
export declare function createPaymentsPrometheusCollector(_module: PaymentModule, _options?: PaymentsCollectorOptions): PaymentsCollector;
//# sourceMappingURL=prometheus.d.ts.map