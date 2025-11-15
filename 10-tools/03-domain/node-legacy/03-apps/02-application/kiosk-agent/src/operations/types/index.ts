export interface MonitorDefinition {
  name: string;
  type: 'http' | 'ping' | 'tcp' | 'dns';
  url?: string;
  interval: number;
  retryInterval: number;
  maxRetries: number;
  timeout: number;
  notificationIds: string[];
}

export interface MonitorResponse {
  monitorId: string;
  name: string;
  type: string;
  status: 'up' | 'down' | 'pending';
  uptime: number;
  createdAt: string;
}

export interface MonitorStatus {
  monitorId: string;
  status: 'up' | 'down' | 'pending';
  lastCheckAt: string;
  responseTime: number;
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
}

export interface Heartbeat {
  timestamp: string;
  status: 'up' | 'down';
  responseTime?: number;
  message?: string;
}

export interface IncidentDefinition {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  affectedServices: string[];
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string;
}

export interface IncidentUpdate {
  description: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  timestamp: string;
}

export interface IncidentResponse {
  incidentId: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
  updates: IncidentUpdate[];
}

export interface UptimeReport {
  totalTime: number;
  uptime: number;
  downtime: number;
  uptimePercentage: number;
  incidentsCount: number;
  slaTarget: number;
  slaMet: boolean;
}

export interface MTTRReport {
  incidents: Array<{
    incidentId: string;
    detectedAt: string;
    resolvedAt: string;
    duration: number;
  }>;
  averageMTTR: number;
  medianMTTR: number;
  maxMTTR: number;
  mttrTarget: number;
  mttrMet: boolean;
}

export interface SLAReport {
  month: string;
  uptimePercentage: number;
  slaMet: boolean;
  incidentsCount: number;
  mttr: number;
  downtime: Array<{
    startTime: string;
    endTime: string;
    duration: number;
    reason: string;
  }>;
}

export interface DiagnosisStep {
  step: string;
  command?: string;
  expectedOutput: string;
}

export interface ResolutionStep {
  step: string;
  command?: string;
  note?: string;
}

export interface Playbook {
  name: string;
  title: string;
  symptoms: string[];
  diagnosis: DiagnosisStep[];
  resolution: ResolutionStep[];
  escalation: string;
  estimatedTime: number;
}

export interface AggregatedHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  timestamp: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  message?: string;
}
