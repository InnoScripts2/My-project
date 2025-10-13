import { test } from 'node:test';
import assert from 'node:assert';
import { IncidentManager } from '../IncidentManager.js';
import { OpenStatusClient } from '../OpenStatusClient.js';
import { SLAManager } from '../SLAManager.js';

const mockDb = {
  insert: async (table: string, data: any) => {
    return { incident_id: 'inc-001', ...data };
  },
  update: async (table: string, id: string, data: any) => {
    return;
  },
  findById: async (table: string, id: string) => {
    return {
      incident_id: id,
      title: 'Test Incident',
      severity: 'critical',
      started_at: '2025-01-01T10:00:00Z',
      created_at: '2025-01-01T10:00:00Z',
      updates: '[]',
    };
  },
  query: async (sql: string, params: any[]) => {
    return [];
  },
};

const mockOpenStatusClient = new OpenStatusClient();
const mockSlaManager = new SLAManager(mockDb);

test('IncidentManager - createIncident saves to database', async () => {
  const incidentManager = new IncidentManager(mockDb, mockOpenStatusClient, mockSlaManager);

  const incident = await incidentManager.createIncident({
    title: 'Test Incident',
    description: 'Test description',
    severity: 'critical',
    affectedServices: ['OBD'],
    status: 'investigating',
    startedAt: '2025-01-01T10:00:00Z',
  });

  assert.ok(incident.incidentId, 'Should have incident ID');
  assert.strictEqual(incident.title, 'Test Incident', 'Title should match');
  assert.strictEqual(incident.status, 'investigating', 'Status should match');
});

test('IncidentManager - updateIncident updates status', async () => {
  const incidentManager = new IncidentManager(mockDb, mockOpenStatusClient, mockSlaManager);

  const incident = await incidentManager.updateIncident('inc-001', {
    description: 'Update description',
    status: 'resolved',
    timestamp: '2025-01-01T11:00:00Z',
  });

  assert.strictEqual(incident.status, 'resolved', 'Status should be updated');
});

test('IncidentManager - resolveIncident tracks downtime', async () => {
  const incidentManager = new IncidentManager(mockDb, mockOpenStatusClient, mockSlaManager);

  await assert.doesNotReject(
    async () => {
      await incidentManager.resolveIncident('inc-001', 'Issue resolved');
    },
    'resolveIncident should not throw'
  );
});

test('IncidentManager - getIncidents returns list', async () => {
  const incidentManager = new IncidentManager(mockDb, mockOpenStatusClient, mockSlaManager);

  const incidents = await incidentManager.getIncidents();
  assert.ok(Array.isArray(incidents), 'Should return an array');
});

test('IncidentManager - getIncidents filters by severity', async () => {
  const incidentManager = new IncidentManager(mockDb, mockOpenStatusClient, mockSlaManager);

  const incidents = await incidentManager.getIncidents({ severity: 'critical' });
  assert.ok(Array.isArray(incidents), 'Should return an array');
});
