/**
 * OBD Alerts Integration
 * Defines and evaluates alerts for OBD diagnostic workflow
 */

import type { Alert, AlertSeverity, AlertEvaluationInput } from '../../monitoring/alerts.js';

export interface ObdMetricsSnapshot {
  adapterUnavailableDuration?: number; // milliseconds
  connectionFailureRate?: number; // 0-1
  paymentConversionRate?: number; // 0-1
  reportDeliveryFailureRate?: number; // 0-1
  stuckSessions?: Array<{
    sessionId: string;
    state: string;
    stuckDuration: number; // milliseconds
  }>;
  timestamp: string;
}

/**
 * Evaluate OBD-specific alerts
 */
export function evaluateObdAlerts(snapshot: ObdMetricsSnapshot, input: AlertEvaluationInput): Alert[] {
  const alerts: Alert[] = [];
  const now = input.timestamp ?? new Date();

  // Alert 1: Adapter unavailable >5min (CRITICAL)
  if (snapshot.adapterUnavailableDuration && snapshot.adapterUnavailableDuration > 5 * 60 * 1000) {
    alerts.push({
      id: 'obd.adapter_unavailable',
      severity: 'critical',
      title: 'OBD адаптер недоступен',
      description: `Адаптер недоступен более ${Math.floor(snapshot.adapterUnavailableDuration / 60000)} минут`,
      detectedAt: now.toISOString(),
      data: {
        durationMinutes: Math.floor(snapshot.adapterUnavailableDuration / 60000),
        environment: input.environment,
      },
    });
  }

  // Alert 2: High connection failure rate >30% (WARNING)
  if (snapshot.connectionFailureRate !== undefined && snapshot.connectionFailureRate > 0.3) {
    alerts.push({
      id: 'obd.high_connection_failure_rate',
      severity: 'warning',
      title: 'Высокий процент ошибок подключения',
      description: `${Math.round(snapshot.connectionFailureRate * 100)}% попыток подключения не удаются`,
      detectedAt: now.toISOString(),
      data: {
        failureRatePercent: Math.round(snapshot.connectionFailureRate * 100),
        threshold: 30,
        environment: input.environment,
      },
    });
  }

  // Alert 3: Low payment conversion <50% (WARNING)
  if (snapshot.paymentConversionRate !== undefined && snapshot.paymentConversionRate < 0.5) {
    alerts.push({
      id: 'obd.low_payment_conversion',
      severity: 'warning',
      title: 'Низкая конверсия оплаты',
      description: `Только ${Math.round(snapshot.paymentConversionRate * 100)}% сканирований приводят к оплате`,
      detectedAt: now.toISOString(),
      data: {
        conversionRatePercent: Math.round(snapshot.paymentConversionRate * 100),
        threshold: 50,
        environment: input.environment,
      },
    });
  }

  // Alert 4: High report delivery failure rate >10% (WARNING)
  if (snapshot.reportDeliveryFailureRate !== undefined && snapshot.reportDeliveryFailureRate > 0.1) {
    alerts.push({
      id: 'obd.high_report_delivery_failure_rate',
      severity: 'warning',
      title: 'Высокий процент ошибок отправки отчетов',
      description: `${Math.round(snapshot.reportDeliveryFailureRate * 100)}% отчетов не удается доставить`,
      detectedAt: now.toISOString(),
      data: {
        failureRatePercent: Math.round(snapshot.reportDeliveryFailureRate * 100),
        threshold: 10,
        environment: input.environment,
      },
    });
  }

  // Alert 5: Stuck sessions >15min (WARNING)
  if (snapshot.stuckSessions && snapshot.stuckSessions.length > 0) {
    for (const session of snapshot.stuckSessions) {
      if (session.stuckDuration > 15 * 60 * 1000) {
        alerts.push({
          id: `obd.stuck_session.${session.sessionId}`,
          severity: 'warning',
          title: 'Зависшая диагностическая сессия',
          description: `Сессия ${session.sessionId} застряла в состоянии ${session.state} более ${Math.floor(session.stuckDuration / 60000)} минут`,
          detectedAt: now.toISOString(),
          data: {
            sessionId: session.sessionId,
            state: session.state,
            stuckDurationMinutes: Math.floor(session.stuckDuration / 60000),
            threshold: 15,
            environment: input.environment,
          },
        });
      }
    }
  }

  return alerts;
}

/**
 * Create alert snapshot from monitoring data
 */
export function createObdMetricsSnapshot(data: {
  adapterLastSeen?: Date;
  connectionAttempts: number;
  connectionFailures: number;
  scansCompleted: number;
  paymentsPaid: number;
  reportsDelivered: number;
  reportsFailed: number;
  activeSessions: Array<{
    sessionId: string;
    state: string;
    updatedAt: string;
  }>;
}): ObdMetricsSnapshot {
  const now = new Date();

  // Calculate adapter unavailable duration
  let adapterUnavailableDuration: number | undefined;
  if (data.adapterLastSeen) {
    adapterUnavailableDuration = now.getTime() - data.adapterLastSeen.getTime();
  }

  // Calculate connection failure rate
  let connectionFailureRate: number | undefined;
  if (data.connectionAttempts > 0) {
    connectionFailureRate = data.connectionFailures / data.connectionAttempts;
  }

  // Calculate payment conversion rate
  let paymentConversionRate: number | undefined;
  if (data.scansCompleted > 0) {
    paymentConversionRate = data.paymentsPaid / data.scansCompleted;
  }

  // Calculate report delivery failure rate
  let reportDeliveryFailureRate: number | undefined;
  const totalReportAttempts = data.reportsDelivered + data.reportsFailed;
  if (totalReportAttempts > 0) {
    reportDeliveryFailureRate = data.reportsFailed / totalReportAttempts;
  }

  // Identify stuck sessions
  const stuckSessions = data.activeSessions
    .map(session => {
      const updatedAt = new Date(session.updatedAt);
      const stuckDuration = now.getTime() - updatedAt.getTime();
      return {
        sessionId: session.sessionId,
        state: session.state,
        stuckDuration,
      };
    })
    .filter(session => session.stuckDuration > 15 * 60 * 1000);

  return {
    adapterUnavailableDuration,
    connectionFailureRate,
    paymentConversionRate,
    reportDeliveryFailureRate,
    stuckSessions: stuckSessions.length > 0 ? stuckSessions : undefined,
    timestamp: now.toISOString(),
  };
}

/**
 * Format alert for notification
 */
export function formatObdAlertForNotification(alert: Alert): string {
  let message = `[${alert.severity.toUpperCase()}] ${alert.title}\n\n`;
  message += `${alert.description}\n\n`;
  
  if (alert.data) {
    message += 'Детали:\n';
    for (const [key, value] of Object.entries(alert.data)) {
      message += `- ${key}: ${value}\n`;
    }
  }

  message += `\nОбнаружено: ${alert.detectedAt}`;
  
  return message;
}
