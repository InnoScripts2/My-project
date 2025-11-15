/**
 * Security Prometheus Metrics
 * 
 * Exposes security metrics for monitoring
 */

import { Counter, Gauge, Registry } from 'prom-client';

export interface SecurityMetrics {
  hardeningChecksTotal: Counter;
  hardeningCheckStatus: Gauge;
  wazuhAgentConnected: Gauge;
  wazuhAlertsTotal: Counter;
  firezoneConnected: Gauge;
  remoteSessionsActive: Gauge;
  auditEventsTotal: Counter;
  updatesAppliedTotal: Counter;
  rollbacksTotal: Counter;
}

export function createSecurityMetrics(registry: Registry): SecurityMetrics {
  const hardeningChecksTotal = new Counter({
    name: 'security_hardening_checks_total',
    help: 'Total number of hardening checks performed',
    labelNames: ['status'],
    registers: [registry],
  });

  const hardeningCheckStatus = new Gauge({
    name: 'security_hardening_check_status',
    help: 'Status of individual hardening checks (1=passed, 0=failed)',
    labelNames: ['checkId'],
    registers: [registry],
  });

  const wazuhAgentConnected = new Gauge({
    name: 'security_wazuh_agent_connected',
    help: 'Wazuh agent connection status (1=connected, 0=disconnected)',
    registers: [registry],
  });

  const wazuhAlertsTotal = new Counter({
    name: 'security_wazuh_alerts_total',
    help: 'Total number of Wazuh alerts',
    labelNames: ['severity'],
    registers: [registry],
  });

  const firezoneConnected = new Gauge({
    name: 'security_firezone_connected',
    help: 'Firezone tunnel status (1=connected, 0=disconnected)',
    registers: [registry],
  });

  const remoteSessionsActive = new Gauge({
    name: 'security_remote_sessions_active',
    help: 'Number of active remote sessions',
    labelNames: ['protocol'],
    registers: [registry],
  });

  const auditEventsTotal = new Counter({
    name: 'security_audit_events_total',
    help: 'Total number of audit events',
    labelNames: ['category'],
    registers: [registry],
  });

  const updatesAppliedTotal = new Counter({
    name: 'security_updates_applied_total',
    help: 'Total number of updates applied',
    labelNames: ['success'],
    registers: [registry],
  });

  const rollbacksTotal = new Counter({
    name: 'security_rollbacks_total',
    help: 'Total number of rollbacks performed',
    registers: [registry],
  });

  return {
    hardeningChecksTotal,
    hardeningCheckStatus,
    wazuhAgentConnected,
    wazuhAlertsTotal,
    firezoneConnected,
    remoteSessionsActive,
    auditEventsTotal,
    updatesAppliedTotal,
    rollbacksTotal,
  };
}
