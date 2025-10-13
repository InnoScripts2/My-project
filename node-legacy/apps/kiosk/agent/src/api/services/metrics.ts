/**
 * Prometheus metrics for kiosk-agent
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsService {
  private registry: Registry;

  // Payment metrics
  public paymentsIntentsTotal: Counter;
  public paymentsConfirmedTotal: Counter;
  public paymentsFailedTotal: Counter;
  public paymentsDuration: Histogram;
  public paymentsWebhookReceived: Counter;

  // Session metrics
  public sessionsCreatedTotal: Counter;
  public sessionsCompletedTotal: Counter;
  public sessionsExpiredTotal: Counter;
  public sessionsDuration: Histogram;
  public sessionsActiveGauge: Gauge;

  // Diagnostics metrics
  public diagnosticsScansTotal: Counter;
  public diagnosticsDtcFound: Counter;
  public diagnosticsDuration: Histogram;

  // Reports metrics
  public reportsGeneratedTotal: Counter;
  public reportsDeliveredTotal: Counter;
  public reportsFailedTotal: Counter;

  constructor() {
    this.registry = new Registry();

    // Payment metrics
    this.paymentsIntentsTotal = new Counter({
      name: 'payments_intents_total',
      help: 'Total number of payment intents created',
      labelNames: ['status', 'env'],
      registers: [this.registry],
    });

    this.paymentsConfirmedTotal = new Counter({
      name: 'payments_confirmed_total',
      help: 'Total number of confirmed payments',
      labelNames: ['env'],
      registers: [this.registry],
    });

    this.paymentsFailedTotal = new Counter({
      name: 'payments_failed_total',
      help: 'Total number of failed payments',
      labelNames: ['reason', 'env'],
      registers: [this.registry],
    });

    this.paymentsDuration = new Histogram({
      name: 'payments_duration_seconds',
      help: 'Duration of payment processing',
      labelNames: ['status', 'env'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.paymentsWebhookReceived = new Counter({
      name: 'payments_webhook_received_total',
      help: 'Total number of payment webhooks received',
      labelNames: ['status'],
      registers: [this.registry],
    });

    // Session metrics
    this.sessionsCreatedTotal = new Counter({
      name: 'sessions_created_total',
      help: 'Total number of sessions created',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.sessionsCompletedTotal = new Counter({
      name: 'sessions_completed_total',
      help: 'Total number of completed sessions',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.sessionsExpiredTotal = new Counter({
      name: 'sessions_expired_total',
      help: 'Total number of expired sessions',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.sessionsDuration = new Histogram({
      name: 'sessions_duration_seconds',
      help: 'Duration of sessions',
      labelNames: ['type', 'status'],
      buckets: [60, 300, 600, 1200, 1800, 3600],
      registers: [this.registry],
    });

    this.sessionsActiveGauge = new Gauge({
      name: 'sessions_active',
      help: 'Number of currently active sessions',
      labelNames: ['type'],
      registers: [this.registry],
    });

    // Diagnostics metrics
    this.diagnosticsScansTotal = new Counter({
      name: 'diagnostics_scans_total',
      help: 'Total number of diagnostic scans',
      labelNames: ['make'],
      registers: [this.registry],
    });

    this.diagnosticsDtcFound = new Counter({
      name: 'diagnostics_dtc_found_total',
      help: 'Total number of DTC codes found',
      labelNames: ['severity'],
      registers: [this.registry],
    });

    this.diagnosticsDuration = new Histogram({
      name: 'diagnostics_duration_seconds',
      help: 'Duration of diagnostic scans',
      labelNames: ['make'],
      buckets: [10, 30, 60, 120, 300],
      registers: [this.registry],
    });

    // Reports metrics
    this.reportsGeneratedTotal = new Counter({
      name: 'reports_generated_total',
      help: 'Total number of reports generated',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.reportsDeliveredTotal = new Counter({
      name: 'reports_delivered_total',
      help: 'Total number of reports delivered',
      labelNames: ['type', 'method'],
      registers: [this.registry],
    });

    this.reportsFailedTotal = new Counter({
      name: 'reports_failed_total',
      help: 'Total number of failed report deliveries',
      labelNames: ['type', 'method', 'reason'],
      registers: [this.registry],
    });
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

// Singleton instance
let metricsServiceInstance: MetricsService | null = null;

export function getMetricsService(): MetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new MetricsService();
  }
  return metricsServiceInstance;
}
