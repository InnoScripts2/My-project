import test from 'node:test';
import assert from 'node:assert/strict';
process.on('uncaughtException', (error) => {
    console.error('uncaughtException', error);
});
process.on('unhandledRejection', (error) => {
    console.error('unhandledRejection', error);
});
import { DiagnosticSessionManager, } from './DiagnosticSessionManager.js';
import { obdConnectionManager } from './ObdConnectionManager.js';
class FakeConnectionManager {
    constructor() {
        this.snapshot = { state: 'disconnected', reconnectAttempts: 0 };
    }
    addSnapshotListener(listener) {
        this.listener = listener;
        listener(this.snapshot);
        return () => {
            if (this.listener === listener) {
                this.listener = undefined;
            }
        };
    }
    update(partial) {
        this.snapshot = { ...this.snapshot, ...partial };
        this.listener?.(this.snapshot);
    }
}
test('DiagnosticSessionManager follows connection snapshots', () => {
    const fake = new FakeConnectionManager();
    const manager = new DiagnosticSessionManager(fake);
    let snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'disconnected');
    fake.update({ state: 'connecting', reconnectAttempts: 1 });
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'connecting');
    const now = new Date().toISOString();
    fake.update({ state: 'connected', lastConnectedAt: now, reconnectAttempts: 0 });
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'ready');
    fake.update({ state: 'disconnected', lastError: 'connection_dropped', reconnectAttempts: 2 });
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'disconnected');
    assert.equal(snapshot.reconnectAttempts, 2);
    manager.dispose();
});
test('DiagnosticSessionManager tracks operations and failures', async () => {
    const fake = new FakeConnectionManager();
    const manager = new DiagnosticSessionManager(fake);
    fake.update({ state: 'connected', reconnectAttempts: 0 });
    const successResult = await manager.runOperation('read_dtc', async () => {
        const during = manager.getSnapshot();
        assert.equal(during.state, 'reading');
        return { ok: true, data: { dtc: [] } };
    }, { attempts: 2, baseDelayMs: 0 });
    console.log('after success runOperation', successResult);
    assert.equal(successResult.ok, true);
    let snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'ready');
    assert.equal(snapshot.lastError, null);
    console.log('before assert.rejects');
    await assert.rejects(() => manager.runOperation('live_data', async () => {
        throw new Error('temporary failure');
    }, { attempts: 1, baseDelayMs: 0 }));
    console.log('after assert.rejects');
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'error');
    assert.ok(snapshot.lastError);
    assert.equal(snapshot.lastError?.operation, 'live_data');
    manager.acknowledgeError();
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'ready');
    assert.equal(snapshot.lastError, null);
    const failureResult = await manager.runOperation('clear_dtc', async () => {
        return { ok: false, error: 'clear_failed' };
    }, { attempts: 1, baseDelayMs: 0 });
    console.log('after failure runOperation', failureResult);
    assert.equal(failureResult.ok, false);
    snapshot = manager.getSnapshot();
    assert.equal(snapshot.state, 'error');
    assert.equal(snapshot.lastError?.operation, 'clear_dtc');
    const operationEvents = snapshot.timeline.filter((event) => event.type === 'operation');
    assert.ok(operationEvents.find((event) => event.operation === 'read_dtc' && event.outcome === 'success'));
    assert.ok(operationEvents.find((event) => event.operation === 'live_data' && event.outcome === 'failure'));
    const clearFailure = operationEvents.find((event) => event.operation === 'clear_dtc' && event.outcome === 'failure');
    assert.ok(clearFailure);
    assert.equal(clearFailure?.error, 'clear_failed');
    const metrics = snapshot.metrics;
    assert.equal(metrics.operations.total, 3);
    assert.equal(metrics.operations.success, 1);
    assert.equal(metrics.operations.failure, 2);
    assert.equal(metrics.operations.byOperation.read_dtc.success, 1);
    assert.equal(metrics.operations.byOperation.live_data.failure, 1);
    assert.equal(metrics.operations.byOperation.clear_dtc.failure, 1);
    assert.equal(metrics.lastOperation?.operation, 'clear_dtc');
    assert.equal(metrics.lastOperation?.outcome, 'failure');
    assert.equal(metrics.lastOperation?.error, 'clear_failed');
    manager.dispose();
    // Ensure no background timers keep tests alive
    void obdConnectionManager.disconnect();
});
test('DiagnosticSessionManager timeline queries and metrics snapshot', async () => {
    const fake = new FakeConnectionManager();
    const manager = new DiagnosticSessionManager(fake);
    fake.update({ state: 'connected', reconnectAttempts: 0 });
    await manager.runOperation('read_dtc', async () => ({ ok: true, data: [] }), { attempts: 1, baseDelayMs: 0 });
    await assert.rejects(() => manager.runOperation('live_data', async () => {
        throw new Error('live_data_failed');
    }, { attempts: 1, baseDelayMs: 0 }));
    const timeline = manager.getTimeline();
    assert.ok(timeline.length >= 2);
    const latestId = timeline.at(-1)?.id;
    assert.ok(latestId);
    assert.equal(manager.getLatestEventId(), latestId);
    const noneAfterLatest = manager.getTimeline({ newerThanId: latestId });
    assert.equal(noneAfterLatest.length, 0);
    const limited = manager.getTimeline({ limit: 1 });
    assert.ok(limited.length <= 1);
    if (timeline.length >= 2) {
        const afterFirst = manager.getTimeline({ newerThanId: timeline[0].id });
        assert.equal(afterFirst.length, timeline.length - 1);
        assert.equal(afterFirst[0]?.id, timeline[1]?.id);
    }
    const metrics = manager.getMetricsSnapshot();
    assert.equal(metrics.operations.total, 2);
    assert.equal(metrics.operations.success, 1);
    assert.equal(metrics.operations.failure, 1);
    assert.equal(metrics.lastOperation?.operation, 'live_data');
    assert.equal(metrics.lastOperation?.outcome, 'failure');
    manager.dispose();
    void obdConnectionManager.disconnect();
});
test('DiagnosticSessionManager provides aggregated insights', async () => {
    const fake = new FakeConnectionManager();
    const manager = new DiagnosticSessionManager(fake);
    fake.update({ state: 'connected', reconnectAttempts: 0 });
    await manager.runOperation('status', async () => ({ ok: true, data: {} }), {
        attempts: 1,
        baseDelayMs: 0,
    });
    await assert.rejects(() => manager.runOperation('live_data', async () => {
        throw new Error('stream_fail');
    }, {
        attempts: 1,
        baseDelayMs: 0,
    }));
    const insights = manager.getInsights({ recentFailures: 1 });
    assert.equal(insights.operations.total, 2);
    assert.equal(insights.operations.failure, 1);
    assert.equal(insights.operations.byOperation.live_data.failure, 1);
    assert.equal(insights.failures.byOperation.live_data, 1);
    assert.equal(insights.failures.recent.length, 1);
    assert.equal(insights.failures.recent[0]?.operation, 'live_data');
    assert.equal(insights.connection.state, 'error');
    assert.ok(insights.connection.segments.length >= 1);
    assert.ok(insights.timeline.totalEvents >= 1);
    assert.equal(insights.reliability.currentFailureStreak, 1);
    assert.equal(insights.reliability.meanTimeBetweenFailuresMs, null);
    assert.equal(insights.reliability.meanTimeToRecoveryMs, null);
    if (insights.reliability.uptimeRatio != null) {
        assert.ok(insights.reliability.uptimeRatio >= 0 && insights.reliability.uptimeRatio <= 1);
    }
    manager.dispose();
    void obdConnectionManager.disconnect();
});
test('DiagnosticSessionManager getHistoricalSummary delegates to persistent store', () => {
    const fake = new FakeConnectionManager();
    const expected = {
        capturedAt: new Date().toISOString(),
        range: { totalEvents: 0, since: undefined, until: undefined },
        operations: {
            total: 0,
            success: 0,
            failure: 0,
            successRate: 0,
            failureRate: 0,
            averageDurationMs: null,
            p95DurationMs: null,
            byOperation: {
                read_dtc: {
                    total: 0,
                    success: 0,
                    failure: 0,
                    successRate: 0,
                    failureRate: 0,
                    averageDurationMs: null,
                    minDurationMs: null,
                    maxDurationMs: null,
                    p95DurationMs: null,
                    lastEventAt: undefined,
                },
                live_data: {
                    total: 0,
                    success: 0,
                    failure: 0,
                    successRate: 0,
                    failureRate: 0,
                    averageDurationMs: null,
                    minDurationMs: null,
                    maxDurationMs: null,
                    p95DurationMs: null,
                    lastEventAt: undefined,
                },
                status: {
                    total: 0,
                    success: 0,
                    failure: 0,
                    successRate: 0,
                    failureRate: 0,
                    averageDurationMs: null,
                    minDurationMs: null,
                    maxDurationMs: null,
                    p95DurationMs: null,
                    lastEventAt: undefined,
                },
                self_check: {
                    total: 0,
                    success: 0,
                    failure: 0,
                    successRate: 0,
                    failureRate: 0,
                    averageDurationMs: null,
                    minDurationMs: null,
                    maxDurationMs: null,
                    p95DurationMs: null,
                    lastEventAt: undefined,
                },
                clear_dtc: {
                    total: 0,
                    success: 0,
                    failure: 0,
                    successRate: 0,
                    failureRate: 0,
                    averageDurationMs: null,
                    minDurationMs: null,
                    maxDurationMs: null,
                    p95DurationMs: null,
                    lastEventAt: undefined,
                },
            },
            daily: [],
            trends: {
                overall: {
                    totalDelta: 0,
                    successRateDelta: 0,
                    failureRateDelta: 0,
                    status: 'insufficient_data',
                    reason: 'Недостаточно наблюдений для анализа тренда',
                    confidence: 0,
                },
                byOperation: {
                    read_dtc: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Недостаточно наблюдений для анализа тренда', confidence: 0 },
                    live_data: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Недостаточно наблюдений для анализа тренда', confidence: 0 },
                    status: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Недостаточно наблюдений для анализа тренда', confidence: 0 },
                    self_check: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Недостаточно наблюдений для анализа тренда', confidence: 0 },
                    clear_dtc: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Недостаточно наблюдений для анализа тренда', confidence: 0 },
                },
            },
        },
        failures: {
            total: 0,
            byOperation: {
                read_dtc: 0,
                live_data: 0,
                status: 0,
                self_check: 0,
                clear_dtc: 0,
            },
            byError: [],
            recent: [],
        },
        reliability: {
            meanTimeBetweenFailuresMs: null,
            meanTimeToRecoveryMs: null,
            currentFailureStreak: 0,
            lastFailureAt: undefined,
        },
        connection: {
            transitions: 0,
            totalsByState: {
                disconnected: 0,
                connecting: 0,
                authenticating: 0,
                ready: 0,
                reading: 0,
                clearing: 0,
                error: 0,
            },
            uptimeRatio: null,
            segments: [],
        },
        rolling: {
            last7Days: {
                windowDays: 7,
                from: '',
                until: '',
                total: 0,
                success: 0,
                failure: 0,
                successRate: 0,
                failureRate: 0,
                byOperation: {
                    read_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    live_data: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    status: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    self_check: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    clear_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                },
                topFailures: [],
            },
            last30Days: {
                windowDays: 30,
                from: '',
                until: '',
                total: 0,
                success: 0,
                failure: 0,
                successRate: 0,
                failureRate: 0,
                byOperation: {
                    read_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    live_data: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    status: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    self_check: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                    clear_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 },
                },
                topFailures: [],
            },
        },
    };
    let capturedOptions;
    const store = {
        enabled: true,
        driver: 'sqlite',
        record() { },
        summarize(options) {
            capturedOptions = options;
            return expected;
        },
    };
    const manager = new DiagnosticSessionManager(fake, store);
    const summary = manager.getHistoricalSummary({ limitFailures: 5 });
    assert.equal(summary, expected);
    assert.deepEqual(capturedOptions, { limitFailures: 5 });
    manager.dispose();
});
test('DiagnosticSessionManager getHistoricalSummary returns null when persistence disabled', () => {
    const fake = new FakeConnectionManager();
    const store = {
        enabled: false,
        driver: 'noop',
        record() { },
    };
    const manager = new DiagnosticSessionManager(fake, store);
    const summary = manager.getHistoricalSummary();
    assert.equal(summary, null);
    manager.dispose();
});
test('DiagnosticSessionManager forwards timeline events to external store', async () => {
    const fake = new FakeConnectionManager();
    const captured = [];
    const store = {
        enabled: true,
        driver: 'noop',
        record(event) {
            captured.push(event);
        },
    };
    const manager = new DiagnosticSessionManager(fake, store);
    fake.update({ state: 'connected', reconnectAttempts: 0 });
    await manager.runOperation('status', async () => ({ ok: true, data: {} }), {
        attempts: 1,
        baseDelayMs: 0,
    });
    await assert.rejects(() => manager.runOperation('live_data', async () => {
        throw new Error('stream_fail');
    }, {
        attempts: 1,
        baseDelayMs: 0,
    }));
    assert.ok(captured.some((event) => event.type === 'state_change'));
    assert.ok(captured.some((event) => event.type === 'operation' && event.operation === 'status'));
    assert.ok(captured.some((event) => event.type === 'operation' && event.operation === 'live_data'));
    manager.dispose();
});
