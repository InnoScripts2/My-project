import { v4 as uuidv4 } from 'uuid';
import type { IncidentDefinition, IncidentUpdate, IncidentResponse } from './types/index.js';
import type { OpenStatusClient } from './OpenStatusClient.js';
import type { SLAManager } from './SLAManager.js';

interface DatabaseAdapter {
  insert(table: string, data: any): Promise<any>;
  update(table: string, id: string, data: any): Promise<void>;
  findById(table: string, id: string): Promise<any>;
  query(sql: string, params: any[]): Promise<any[]>;
}

interface MetricsService {
  incrementCounter(name: string, labels: Record<string, string>): void;
  observeHistogram(name: string, value: number, labels: Record<string, string>): void;
}

export class IncidentManager {
  private db: DatabaseAdapter;
  private openStatusClient: OpenStatusClient;
  private slaManager: SLAManager;
  private metricsService?: MetricsService;

  constructor(
    db: DatabaseAdapter,
    openStatusClient: OpenStatusClient,
    slaManager: SLAManager,
    metricsService?: MetricsService
  ) {
    this.db = db;
    this.openStatusClient = openStatusClient;
    this.slaManager = slaManager;
    this.metricsService = metricsService;
  }

  async createIncident(incident: IncidentDefinition): Promise<IncidentResponse> {
    const incidentId = uuidv4();
    const createdAt = new Date().toISOString();

    const incidentRecord = {
      incident_id: incidentId,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      affected_services: JSON.stringify(incident.affectedServices),
      status: incident.status,
      started_at: incident.startedAt,
      created_at: createdAt,
      updates: JSON.stringify([]),
    };

    await this.db.insert('incidents', incidentRecord);

    await this.openStatusClient.createIncident(incident);

    await this.slaManager.trackDowntime(incident.startedAt, null, incident.title);

    if (this.metricsService) {
      this.metricsService.incrementCounter('incidents_created_total', { severity: incident.severity });
    }

    return {
      incidentId,
      title: incident.title,
      status: incident.status,
      createdAt,
      updates: [],
    };
  }

  async updateIncident(incidentId: string, update: IncidentUpdate): Promise<IncidentResponse> {
    const incident = await this.db.findById('incidents', incidentId);
    
    const updates = JSON.parse(incident.updates || '[]');
    updates.push(update);

    await this.db.update('incidents', incidentId, {
      status: update.status,
      updates: JSON.stringify(updates),
      updated_at: new Date().toISOString(),
    });

    await this.openStatusClient.updateIncident(incidentId, update);

    return {
      incidentId,
      title: incident.title,
      status: update.status,
      createdAt: incident.created_at,
      resolvedAt: incident.resolved_at,
      updates,
    };
  }

  async resolveIncident(incidentId: string, resolution: string): Promise<void> {
    const incident = await this.db.findById('incidents', incidentId);
    const resolvedAt = new Date().toISOString();

    await this.db.update('incidents', incidentId, {
      status: 'resolved',
      resolved_at: resolvedAt,
      resolution,
      updated_at: resolvedAt,
    });

    await this.slaManager.trackDowntime(incident.started_at, resolvedAt, incident.title);

    await this.openStatusClient.resolveIncident(incidentId);

    const duration = (new Date(resolvedAt).getTime() - new Date(incident.started_at).getTime()) / 1000;
    
    if (this.metricsService) {
      this.metricsService.observeHistogram('incident_resolution_duration_seconds', duration, {
        severity: incident.severity,
      });
      this.metricsService.incrementCounter('incidents_resolved_total', { severity: incident.severity });
    }
  }

  async getIncidents(filters: { severity?: string; status?: string } = {}): Promise<IncidentResponse[]> {
    let sql = 'SELECT * FROM incidents WHERE 1=1';
    const params: any[] = [];

    if (filters.severity) {
      sql += ' AND severity = ?';
      params.push(filters.severity);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    const incidents = await this.db.query(sql, params);

    return incidents.map((inc: any) => ({
      incidentId: inc.incident_id,
      title: inc.title,
      status: inc.status,
      createdAt: inc.created_at,
      resolvedAt: inc.resolved_at,
      updates: JSON.parse(inc.updates || '[]'),
    }));
  }

  async escalateIncident(incidentId: string, escalationLevel: number): Promise<void> {
    await this.db.update('incidents', incidentId, {
      escalation_level: escalationLevel,
      escalated_at: new Date().toISOString(),
    });
  }
}
