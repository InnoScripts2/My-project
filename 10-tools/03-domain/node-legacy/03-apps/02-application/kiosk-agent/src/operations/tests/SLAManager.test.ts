import { test } from 'node:test';
import assert from 'node:assert';
import { SLAManager } from '../SLAManager.js';

const mockDb = {
  query: async (sql: string, params: any[]) => {
    if (sql.includes('downtime')) {
      return [
        {
          start_time: '2025-01-01T10:00:00Z',
          end_time: '2025-01-01T12:00:00Z',
        },
      ];
    }
    if (sql.includes('incidents')) {
      return [
        {
          incident_id: 'inc-001',
          detected_at: '2025-01-01T10:00:00Z',
          resolved_at: '2025-01-01T11:00:00Z',
        },
      ];
    }
    return [];
  },
  insert: async (table: string, data: any) => {
    return { id: 'test-id', ...data };
  },
};

test('SLAManager - calculateUptime computes percentage correctly', async () => {
  const slaManager = new SLAManager(mockDb);
  const report = await slaManager.calculateUptime('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z');

  assert.ok(report.uptimePercentage > 0, 'Uptime percentage should be greater than 0');
  assert.ok(report.uptimePercentage < 100, 'Uptime percentage should be less than 100 due to downtime');
  assert.strictEqual(report.slaTarget, 99.5, 'SLA target should be 99.5');
  assert.strictEqual(typeof report.slaMet, 'boolean', 'slaMet should be boolean');
});

test('SLAManager - trackDowntime saves record', async () => {
  const slaManager = new SLAManager(mockDb);
  await assert.doesNotReject(
    async () => {
      await slaManager.trackDowntime('2025-01-01T10:00:00Z', '2025-01-01T12:00:00Z', 'Test downtime');
    },
    'trackDowntime should not throw'
  );
});

test('SLAManager - getMTTR calculates average correctly', async () => {
  const slaManager = new SLAManager(mockDb);
  const report = await slaManager.getMTTR('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z');

  assert.ok(report.averageMTTR > 0, 'Average MTTR should be greater than 0');
  assert.strictEqual(report.mttrTarget, 7200, 'MTTR target should be 7200 seconds (2 hours)');
  assert.strictEqual(typeof report.mttrMet, 'boolean', 'mttrMet should be boolean');
});

test('SLAManager - generateSLAReport includes all metrics', async () => {
  const slaManager = new SLAManager(mockDb);
  const report = await slaManager.generateSLAReport('2025-01');

  assert.strictEqual(report.month, '2025-01', 'Month should match input');
  assert.ok(typeof report.uptimePercentage === 'number', 'uptimePercentage should be number');
  assert.ok(typeof report.slaMet === 'boolean', 'slaMet should be boolean');
  assert.ok(typeof report.incidentsCount === 'number', 'incidentsCount should be number');
  assert.ok(typeof report.mttr === 'number', 'mttr should be number');
});
