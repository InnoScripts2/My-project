import { test } from 'node:test';
import assert from 'node:assert';
import { UptimeKumaClient } from '../UptimeKumaClient.js';

test('UptimeKumaClient - initClient sets configuration', () => {
  const client = new UptimeKumaClient();
  client.initClient('http://localhost:3001', 'test-token');
  assert.ok(true, 'initClient should not throw');
});

test('UptimeKumaClient - createMonitor requires initialization', async () => {
  const client = new UptimeKumaClient();
  await assert.rejects(
    async () => {
      await client.createMonitor({
        name: 'test-monitor',
        type: 'http',
        url: 'http://localhost:8080',
        interval: 60,
        retryInterval: 60,
        maxRetries: 3,
        timeout: 30,
        notificationIds: [],
      });
    },
    /not initialized/,
    'Should throw error when not initialized'
  );
});

test('UptimeKumaClient - listMonitors requires initialization', async () => {
  const client = new UptimeKumaClient();
  await assert.rejects(
    async () => {
      await client.listMonitors();
    },
    /not initialized/,
    'Should throw error when not initialized'
  );
});

test('UptimeKumaClient - getMonitorStatus requires initialization', async () => {
  const client = new UptimeKumaClient();
  await assert.rejects(
    async () => {
      await client.getMonitorStatus('mon-001');
    },
    /not initialized/,
    'Should throw error when not initialized'
  );
});
