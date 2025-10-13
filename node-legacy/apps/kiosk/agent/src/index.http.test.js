import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './index.js';
import { diagnosticSessionManager } from './devices/obd/DiagnosticSessionManager.js';
const waitForServer = (server) => {
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'server should provide an address');
    const { port } = address;
    assert.ok(typeof port === 'number' && port > 0, 'server must listen on a port');
    return `http://127.0.0.1:${port}`;
};
test('GET /api/obd/diagnostics/timeline returns timeline and metrics', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());
    const baseUrl = waitForServer(server);
    const baselineLatest = diagnosticSessionManager.getLatestEventId();
    await diagnosticSessionManager.runOperation('read_dtc', async () => ({ ok: true, data: [] }), {
        attempts: 1,
        baseDelayMs: 0,
    });
    await assert.rejects(() => diagnosticSessionManager.runOperation('live_data', async () => {
        throw new Error('live_data_failed');
    }, {
        attempts: 1,
        baseDelayMs: 0,
    }));
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
    const responseEventIds = payload.events.map((event) => event.id);
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
        assert.ok(connection.segments.every((segment) => typeof segment.durationMs === 'number'));
    }
    else {
        assert.equal(historyResponse.status, 503);
        assert.equal(historyPayload.ok, false);
    }
    diagnosticSessionManager.acknowledgeError();
});
test('POST /api/obd/ai-insights returns 403 in PROD and 200 in DEV', async (t) => {
    const originalEnv = process.env.AGENT_ENV;
    const server = app.listen(0);
    t.after(() => {
        server.close();
        if (originalEnv === undefined)
            delete process.env.AGENT_ENV;
        else
            process.env.AGENT_ENV = originalEnv;
    });
    const baseUrl = waitForServer(server);
    // Force PROD behavior
    process.env.AGENT_ENV = 'PROD';
    let res = await fetch(new URL('/api/obd/ai-insights', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(res.status, 403);
    // DEV allows, but if not configured, we expect 501
    process.env.AGENT_ENV = 'DEV';
    res = await fetch(new URL('/api/obd/ai-insights', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    assert.ok([200, 501].includes(res.status));
});
