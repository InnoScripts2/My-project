import { PaymentMetricsSnapshot } from '../payments/metrics.js';

export type AgentEnv = 'DEV' | 'QA' | 'PROD';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly description: string;
  readonly detectedAt: string;
  readonly data?: Record<string, unknown>;
}

export interface AlertEvaluationInput {
  readonly environment: AgentEnv;
  readonly timestamp?: Date;
  readonly payments?: PaymentMetricsSnapshot;
}

export function evaluateAlerts(input: AlertEvaluationInput): Alert[] {
  const now = input.timestamp ?? new Date();
  const alerts: Alert[] = [];

  if (input.payments) {
    alerts.push(...evaluatePaymentAlerts(input.payments, now, input.environment));
  }

  return alerts.sort(sortBySeverity);
}

function evaluatePaymentAlerts(snapshot: PaymentMetricsSnapshot, now: Date, environment: AgentEnv): Alert[] {
  const alerts: Alert[] = [];

  if (snapshot.pendingOver90s > 0) {
    const severity: AlertSeverity = environment === 'DEV' ? 'warning' : 'critical';
    alerts.push({
      id: 'payments.pending_over_90s',
      severity,
      title: 'Зависшие оплаты',
      description: `Обнаружено ${snapshot.pendingOver90s} оплат(ы) без подтверждения более 90 секунд`,
      detectedAt: now.toISOString(),
      data: {
        pendingOver90s: snapshot.pendingOver90s,
        totalIntents: snapshot.totalIntents,
        lastEventAt: snapshot.lastEventAt ?? null,
        environment
      }
    });
  }

  return alerts;
}

const severityWeight: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2
};

function sortBySeverity(a: Alert, b: Alert): number {
  const diff = severityWeight[b.severity] - severityWeight[a.severity];
  if (diff !== 0) {
    return diff;
  }
  return a.id.localeCompare(b.id);
}
