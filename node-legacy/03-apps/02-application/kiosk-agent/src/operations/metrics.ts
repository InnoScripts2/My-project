import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export interface OperationsMetrics {
  uptimeMonitorsTotal: Gauge;
  uptimeMonitorStatus: Gauge;
  incidentsCreatedTotal: Counter;
  incidentsResolvedTotal: Counter;
  incidentResolutionDuration: Histogram;
  slaUptimePercentage: Gauge;
  slaMet: Gauge;
}

export function createOperationsMetrics(registry: Registry): OperationsMetrics {
  const uptimeMonitorsTotal = new Gauge({
    name: 'uptime_monitors_total',
    help: 'Total number of uptime monitors',
    registers: [registry],
  });

  const uptimeMonitorStatus = new Gauge({
    name: 'uptime_monitor_status',
    help: 'Monitor status (1 = up, 0 = down)',
    labelNames: ['monitorId', 'status'],
    registers: [registry],
  });

  const incidentsCreatedTotal = new Counter({
    name: 'incidents_created_total',
    help: 'Total number of incidents created',
    labelNames: ['severity'],
    registers: [registry],
  });

  const incidentsResolvedTotal = new Counter({
    name: 'incidents_resolved_total',
    help: 'Total number of incidents resolved',
    labelNames: ['severity'],
    registers: [registry],
  });

  const incidentResolutionDuration = new Histogram({
    name: 'incident_resolution_duration_seconds',
    help: 'Incident resolution duration (MTTR) in seconds',
    labelNames: ['severity'],
    buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
    registers: [registry],
  });

  const slaUptimePercentage = new Gauge({
    name: 'sla_uptime_percentage',
    help: 'Current SLA uptime percentage',
    registers: [registry],
  });

  const slaMet = new Gauge({
    name: 'sla_met',
    help: 'SLA compliance status (1 = met, 0 = breach)',
    registers: [registry],
  });

  return {
    uptimeMonitorsTotal,
    uptimeMonitorStatus,
    incidentsCreatedTotal,
    incidentsResolvedTotal,
    incidentResolutionDuration,
    slaUptimePercentage,
    slaMet,
  };
}

export class OperationsMetricsService {
  constructor(private metrics: OperationsMetrics) {}

  incrementCounter(name: string, labels: Record<string, string>): void {
    if (name === 'incidents_created_total' && labels.severity) {
      this.metrics.incidentsCreatedTotal.inc({ severity: labels.severity });
    } else if (name === 'incidents_resolved_total' && labels.severity) {
      this.metrics.incidentsResolvedTotal.inc({ severity: labels.severity });
    }
  }

  observeHistogram(name: string, value: number, labels: Record<string, string>): void {
    if (name === 'incident_resolution_duration_seconds' && labels.severity) {
      this.metrics.incidentResolutionDuration.observe({ severity: labels.severity }, value);
    }
  }

  updateSlaMetrics(uptimePercentage: number, slaMet: boolean): void {
    this.metrics.slaUptimePercentage.set(uptimePercentage);
    this.metrics.slaMet.set(slaMet ? 1 : 0);
  }

  updateMonitorMetrics(total: number, monitorStatuses: Array<{ monitorId: string; status: string }>): void {
    this.metrics.uptimeMonitorsTotal.set(total);
    monitorStatuses.forEach(({ monitorId, status }) => {
      this.metrics.uptimeMonitorStatus.set({ monitorId, status }, status === 'up' ? 1 : 0);
    });
  }
}
