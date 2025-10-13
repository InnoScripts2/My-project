import type { PaymentModule } from './payment-module.js';

export interface PaymentsCollectorOptions {
  register?: {
    registerMetric(metric: { name?: string }): void;
  };
}

export interface PaymentsCollector {
  register(): void;
  update(): void;
}

/**
 * Minimal Prometheus collector placeholder for the in-memory payment module.
 */
export function createPaymentsPrometheusCollector(
  _module: PaymentModule,
  _options: PaymentsCollectorOptions = {}
): PaymentsCollector {
  return {
    register() {
      // Noop: metrics wiring will be implemented once Prometheus registry is defined
    },
    update() {
      // Noop: runtime metrics are not yet collected for dev payment module
    },
  };
}
