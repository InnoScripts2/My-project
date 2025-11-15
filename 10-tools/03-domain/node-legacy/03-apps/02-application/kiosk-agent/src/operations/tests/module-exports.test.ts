import { test } from 'node:test';
import assert from 'node:assert';

test('Operations module exports exist', async () => {
  const { UptimeKumaClient } = await import('../UptimeKumaClient.js');
  const { OpenStatusClient } = await import('../OpenStatusClient.js');
  const { SLAManager } = await import('../SLAManager.js');
  const { IncidentManager } = await import('../IncidentManager.js');
  const { OnCallPlaybooks } = await import('../OnCallPlaybooks.js');
  const { HealthCheckAggregator } = await import('../HealthCheckAggregator.js');

  assert.ok(UptimeKumaClient, 'UptimeKumaClient should be exported');
  assert.ok(OpenStatusClient, 'OpenStatusClient should be exported');
  assert.ok(SLAManager, 'SLAManager should be exported');
  assert.ok(IncidentManager, 'IncidentManager should be exported');
  assert.ok(OnCallPlaybooks, 'OnCallPlaybooks should be exported');
  assert.ok(HealthCheckAggregator, 'HealthCheckAggregator should be exported');
});

test('Operations types exist', async () => {
  const types = await import('../types/index.js');
  
  assert.ok(types, 'Types module should be exported');
});
