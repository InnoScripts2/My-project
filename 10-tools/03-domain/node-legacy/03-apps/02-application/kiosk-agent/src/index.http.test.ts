import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from './index.js';
import { diagnosticSessionManager } from './devices/obd/DiagnosticSessionManager.js';
import { obdConnectionManager } from './devices/obd/ObdConnectionManager.js';

// Diagnostics for elusive uncaught errors in CI
process.on('uncaughtException', (err: any) => {
  // eslint-disable-next-line no-console
  console.error('[test][uncaughtException]', err, { proto: Object.getPrototypeOf(err) });
});
process.on('unhandledRejection', (reason: any) => {
  // eslint-disable-next-line no-console
  console.error('[test][unhandledRejection]', reason, { proto: reason ? Object.getPrototypeOf(reason) : null });
});

const waitForServer = async (server: ReturnType<typeof app.listen>): Promise<string> => {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  }
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should provide an address');
  const { port } = address as AddressInfo;
  assert.ok(typeof port === 'number' && port > 0, 'server must listen on a port');
  return `http://127.0.0.1:${port}`;
};

test('GET /api/obd/diagnostics/timeline returns timeline and metrics', { timeout: 15000 }, async (t) => {
  const server = app.listen(0);
  t.after(async () => {
    server.close();
    // Отключить любой активный OBD менеджер
    try { await obdConnectionManager.disconnect(); } catch (e) { void e; }
  });
  const baseUrl = await waitForServer(server);

  const baselineLatest = diagnosticSessionManager.getLatestEventId();

  await diagnosticSessionManager.runOperation('read_dtc', async () => ({ ok: true, data: [] } as const), {
    attempts: 1,
    baseDelayMs: 0,
  });

  await assert.rejects(
    () => diagnosticSessionManager.runOperation('live_data', async () => {
      throw new Error('live_data_failed');
    }, {
      attempts: 1,
      baseDelayMs: 0,
    })
  );

  const expectedEvents = diagnosticSessionManager.getTimeline({ newerThanId: baselineLatest });
  const expectedMetrics = diagnosticSessionManager.getMetricsSnapshot();
  const normalizedExpectedMetrics = JSON.parse(JSON.stringify(expectedMetrics));

  const timelineUrl = new URL('/api/obd/diagnostics/timeline', baseUrl);
  if (baselineLatest) {
    timelineUrl.searchParams.set('after', baselineLatest);
  }
  const response = await fetch(timelineUrl);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.events));
  const responseEventIds = payload.events.map((event: any) => event.id);
  const expectedEventIds = expectedEvents.map((event) => event.id);
  assert.ok(responseEventIds.length >= expectedEventIds.length);
  for (const id of expectedEventIds) {
    assert.ok(responseEventIds.includes(id), `timeline should include event ${id}`);
  }
  assert.deepEqual(payload.metrics, normalizedExpectedMetrics);
  assert.equal(payload.latestEventId, diagnosticSessionManager.getLatestEventId());

  const limitedUrl = new URL('/api/obd/diagnostics/timeline', baseUrl);
  if (baselineLatest) {
    limitedUrl.searchParams.set('after', baselineLatest);
  }
  limitedUrl.searchParams.set('limit', '1');
  const limitedResponse = await fetch(limitedUrl);
  assert.equal(limitedResponse.status, 200);
  const limitedPayload = await limitedResponse.json();
  assert.ok(Array.isArray(limitedPayload.events));
  assert.ok(limitedPayload.events.length <= 1);
  assert.deepEqual(limitedPayload.metrics, normalizedExpectedMetrics);

  const insightsUrl = new URL('/api/obd/diagnostics/insights', baseUrl);
  const insightsResponse = await fetch(insightsUrl);
  assert.equal(insightsResponse.status, 200);
  const insightsPayload = await insightsResponse.json();
  assert.equal(insightsPayload.ok, true);
  const insights = insightsPayload.insights;
  assert.ok(insights);
  assert.equal(insights.operations.failure, normalizedExpectedMetrics.operations.failure);
  assert.equal(insights.failures.byOperation.live_data, 1);
  assert.ok(Array.isArray(insights.failures.byError));
  assert.ok(insights.failures.byError.length >= 1);
  assert.ok(Array.isArray(insights.connection.segments));
  assert.ok(insights.connection.segments.length >= 1);
  assert.equal(insights.timeline.totalEvents, diagnosticSessionManager.getTimeline().length);

  const limitedInsightsUrl = new URL('/api/obd/diagnostics/insights', baseUrl);
  limitedInsightsUrl.searchParams.set('recentFailures', '1');
  limitedInsightsUrl.searchParams.set('windowMs', '60000');
  const limitedInsightsResponse = await fetch(limitedInsightsUrl);
  assert.equal(limitedInsightsResponse.status, 200);
  const limitedInsightsPayload = await limitedInsightsResponse.json();
  assert.equal(limitedInsightsPayload.ok, true);
  const limitedInsights = limitedInsightsPayload.insights;
  assert.ok(Array.isArray(limitedInsights.failures.recent));
  assert.ok(limitedInsights.failures.recent.length <= 1);

  const summaryProbe = diagnosticSessionManager.getHistoricalSummary();
  const historyUrl = new URL('/api/obd/diagnostics/history', baseUrl);
  const historyResponse = await fetch(historyUrl);
  const historyPayload = await historyResponse.json();
  if (summaryProbe) {
    assert.equal(historyResponse.status, 200);
    assert.equal(historyPayload.ok, true);
    assert.ok(historyPayload.summary);
    assert.equal(historyPayload.summary.operations.failure, summaryProbe.operations.failure);
    assert.ok(historyPayload.summary.connection);
  assert.ok(historyPayload.summary.operations.trends);
  assert.ok(historyPayload.summary.rolling);
    const connection = historyPayload.summary.connection;
    assert.ok(Array.isArray(connection.segments));
    assert.ok(connection.segments.every((segment: any) => typeof segment.durationMs === 'number'));
  } else {
    assert.equal(historyResponse.status, 503);
    assert.equal(historyPayload.ok, false);
  }

  diagnosticSessionManager.acknowledgeError();
});

test('POST /api/obd/ai-insights returns 403 in PROD and 200 in DEV', { timeout: 15000 }, async (t) => {
  const originalEnv = process.env.AGENT_ENV;
  const server = app.listen(0);
  t.after(() => {
    server.close();
    if (originalEnv === undefined) delete process.env.AGENT_ENV; else process.env.AGENT_ENV = originalEnv;
  });
  const baseUrl = await waitForServer(server);

  // Force PROD behavior
  process.env.AGENT_ENV = 'PROD';
  let res = await fetch(new URL('/api/obd/ai-insights', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  assert.equal(res.status, 403);

  // DEV allows, but if not configured, we expect 501
  process.env.AGENT_ENV = 'DEV';
  res = await fetch(new URL('/api/obd/ai-insights', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  assert.ok([200, 501].includes(res.status));
});
