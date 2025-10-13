import { obdConnectionManager } from './ObdConnectionManager.js';
import { diagnosticsEventStore } from '../../storage/diagnostics/index.js';
const HISTORY_LIMIT = 32;
const TIMELINE_LIMIT = 64;
function resolveLimit(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return TIMELINE_LIMIT;
    }
    return Math.min(Math.floor(value), TIMELINE_LIMIT);
}
function resolveRecentLimit(value, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
}
function createZeroCounters() {
    return {
        read_dtc: 0,
        live_data: 0,
        status: 0,
        self_check: 0,
        clear_dtc: 0,
    };
}
function createStateTotals() {
    return {
        disconnected: 0,
        connecting: 0,
        authenticating: 0,
        ready: 0,
        reading: 0,
        clearing: 0,
        error: 0,
    };
}
function isOperationEvent(event) {
    return event.type === 'operation';
}
function computeMeanTimeBetweenFailures(events) {
    if (events.length < 2)
        return null;
    let total = 0;
    let count = 0;
    for (let index = 1; index < events.length; index += 1) {
        const previous = Date.parse(events[index - 1].at);
        const current = Date.parse(events[index].at);
        if (!Number.isFinite(previous) || !Number.isFinite(current) || current <= previous) {
            continue;
        }
        total += current - previous;
        count += 1;
    }
    return count > 0 ? Math.round(total / count) : null;
}
function computeMeanTimeToRecovery(timeline) {
    let total = 0;
    let count = 0;
    for (let index = 0; index < timeline.length; index += 1) {
        const event = timeline[index];
        if (!isOperationEvent(event) || event.outcome !== 'failure')
            continue;
        const failureTime = Date.parse(event.at);
        if (!Number.isFinite(failureTime))
            continue;
        for (let cursor = index + 1; cursor < timeline.length; cursor += 1) {
            const candidate = timeline[cursor];
            if (!isOperationEvent(candidate))
                continue;
            const recoveryTime = Date.parse(candidate.at);
            if (!Number.isFinite(recoveryTime) || recoveryTime <= failureTime)
                continue;
            if (candidate.outcome === 'success') {
                total += recoveryTime - failureTime;
                count += 1;
                break;
            }
        }
    }
    return count > 0 ? Math.round(total / count) : null;
}
function computeCurrentFailureStreak(timeline) {
    let streak = 0;
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
        const event = timeline[index];
        if (!isOperationEvent(event))
            continue;
        if (event.outcome === 'failure') {
            streak += 1;
        }
        else if (event.outcome === 'success') {
            break;
        }
    }
    return streak;
}
function createEmptyOperationStats() {
    return {
        read_dtc: { success: 0, failure: 0, totalDurationMs: 0 },
        live_data: { success: 0, failure: 0, totalDurationMs: 0 },
        status: { success: 0, failure: 0, totalDurationMs: 0 },
        self_check: { success: 0, failure: 0, totalDurationMs: 0 },
        clear_dtc: { success: 0, failure: 0, totalDurationMs: 0 },
    };
}
function stringifyError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function isFailureResult(result) {
    return !!result && typeof result === 'object' && 'ok' in result && !result.ok;
}
async function delay(ms) {
    if (ms <= 0)
        return;
    await new Promise((resolve) => setTimeout(resolve, ms));
}
export class DiagnosticSessionManager {
    constructor(connectionManager = obdConnectionManager, eventStore = diagnosticsEventStore) {
        this.state = 'disconnected';
        this.listeners = new Set();
        this.history = [];
        this.lastError = null;
        this.activeOperation = null;
        this.lastUpdatedAt = new Date().toISOString();
        this.reconnectAttempts = 0;
        this.timeline = [];
        this.operationStats = createEmptyOperationStats();
        this.eventCounter = 0;
        this.eventStore = eventStore;
        this.disposeConnectionListener = connectionManager.addSnapshotListener((snapshot) => {
            this.reconnectAttempts = snapshot.reconnectAttempts;
            this.latestConnection = snapshot;
            this.syncWithConnectionSnapshot(snapshot);
        });
    }
    getSnapshot() {
        return {
            state: this.state,
            activeOperation: this.activeOperation ? { ...this.activeOperation } : null,
            lastError: this.lastError ? { ...this.lastError } : null,
            lastUpdatedAt: this.lastUpdatedAt,
            history: [...this.history],
            reconnectAttempts: this.reconnectAttempts,
            connection: this.latestConnection ? { ...this.latestConnection } : undefined,
            timeline: this.cloneTimeline(),
            metrics: this.buildMetrics(),
        };
    }
    getTimeline(options = {}) {
        const limit = resolveLimit(options.limit);
        let startIndex = 0;
        if (options.newerThanId) {
            const anchorIndex = this.timeline.findIndex((event) => event.id === options.newerThanId);
            if (anchorIndex >= 0) {
                startIndex = anchorIndex + 1;
            }
            else {
                startIndex = Math.max(0, this.timeline.length - limit);
            }
        }
        const slice = this.timeline.slice(startIndex);
        const capped = slice.length > limit ? slice.slice(slice.length - limit) : slice;
        return capped.map((event) => this.cloneEvent(event));
    }
    getMetricsSnapshot() {
        return this.buildMetrics();
    }
    getLatestEventId() {
        return this.timeline.at(-1)?.id;
    }
    getInsights(options = {}) {
        const capturedAt = new Date();
        const nowMs = capturedAt.getTime();
        const windowMs = typeof options.windowMs === 'number' && Number.isFinite(options.windowMs) && options.windowMs > 0
            ? Math.floor(options.windowMs)
            : undefined;
        const windowStartMs = windowMs ? nowMs - windowMs : undefined;
        const metrics = this.buildMetrics();
        const operationsByOperation = {};
        for (const [operation, stats] of Object.entries(metrics.operations.byOperation)) {
            const total = stats.success + stats.failure;
            operationsByOperation[operation] = {
                total,
                success: stats.success,
                failure: stats.failure,
                successRate: total ? stats.success / total : 0,
                failureRate: total ? stats.failure / total : 0,
                averageDurationMs: stats.averageDurationMs,
            };
        }
        const failureEvents = this.timeline.filter((event) => event.type === 'operation' && event.outcome === 'failure');
        const filteredFailures = windowStartMs != null
            ? failureEvents.filter((event) => Date.parse(event.at) >= windowStartMs)
            : failureEvents;
        const failureCounts = createZeroCounters();
        const failureReasonCounts = new Map();
        for (const event of filteredFailures) {
            failureCounts[event.operation] += 1;
            const key = event.error ?? 'unknown_failure';
            failureReasonCounts.set(key, (failureReasonCounts.get(key) ?? 0) + 1);
        }
        const recentLimit = resolveRecentLimit(options.recentFailures, 5);
        const recentFailures = filteredFailures
            .slice(-recentLimit)
            .map((event) => ({
            id: event.id,
            at: event.at,
            operation: event.operation,
            attempt: event.attempt,
            attemptsAllowed: event.attemptsAllowed,
            error: event.error,
            summary: event.summary,
        }))
            .reverse();
        const failureReasons = Array.from(failureReasonCounts.entries())
            .map(([error, count]) => ({ error, count }))
            .sort((a, b) => (b.count === a.count ? a.error.localeCompare(b.error) : b.count - a.count));
        const mtbfMs = computeMeanTimeBetweenFailures(failureEvents);
        const mttrMs = computeMeanTimeToRecovery(this.timeline);
        const failureStreak = computeCurrentFailureStreak(this.timeline);
        const lastFailureAt = failureEvents.at(-1)?.at;
        const connectionSegments = this.buildConnectionSegments(windowStartMs, nowMs);
        const connectionTotals = createStateTotals();
        for (const segment of connectionSegments) {
            connectionTotals[segment.state] += segment.durationMs;
        }
        const totalDuration = Object.values(connectionTotals).reduce((sum, value) => sum + value, 0);
        const uptimeRatio = totalDuration > 0 ? connectionTotals.ready / totalDuration : null;
        return {
            capturedAt: capturedAt.toISOString(),
            operations: {
                total: metrics.operations.total,
                success: metrics.operations.success,
                failure: metrics.operations.failure,
                successRate: metrics.operations.total ? metrics.operations.success / metrics.operations.total : 0,
                failureRate: metrics.operations.total ? metrics.operations.failure / metrics.operations.total : 0,
                byOperation: operationsByOperation,
            },
            failures: {
                recent: recentFailures,
                byOperation: failureCounts,
                byError: failureReasons,
            },
            connection: {
                state: this.state,
                lastUpdatedAt: this.lastUpdatedAt,
                transitions: this.history.length,
                totalsByState: connectionTotals,
                segments: connectionSegments,
            },
            timeline: {
                totalEvents: this.timeline.length,
                windowStart: windowStartMs != null ? new Date(windowStartMs).toISOString() : undefined,
            },
            reliability: {
                meanTimeBetweenFailuresMs: mtbfMs,
                meanTimeToRecoveryMs: mttrMs,
                uptimeRatio,
                currentFailureStreak: failureStreak,
                lastFailureAt,
            },
        };
    }
    getHistoricalSummary(options = {}) {
        if (!this.eventStore.enabled || typeof this.eventStore.summarize !== 'function') {
            return null;
        }
        return this.eventStore.summarize(options);
    }
    addListener(listener) {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.listeners.delete(listener);
        };
    }
    dispose() {
        this.disposeConnectionListener();
        this.listeners.clear();
    }
    async runOperation(operation, task, options = {}) {
        const attempts = options.attempts ?? 3;
        const baseDelayMs = options.baseDelayMs ?? 250;
        const captureConnection = options.captureSnapshot ?? false;
        this.startOperation(operation, attempts);
        let attempt = 0;
        let lastError;
        while (attempt < attempts) {
            try {
                const result = await task();
                if (isFailureResult(result)) {
                    const errorMessage = result.error ?? `${operation}_failed`;
                    const summary = options.summarizeFailure?.(result);
                    this.registerFailure(operation, errorMessage, {
                        summary,
                        captureConnection,
                    });
                }
                else {
                    const summary = options.summarizeSuccess?.(result);
                    this.finishOperation(operation, {
                        summary,
                        captureConnection,
                    });
                }
                return result;
            }
            catch (error) {
                lastError = error;
                attempt += 1;
                if (attempt >= attempts) {
                    const summary = options.summarizeFailure?.(error);
                    this.registerFailure(operation, stringifyError(error), {
                        summary,
                        captureConnection,
                    });
                    throw error;
                }
                this.updateActiveOperationAttempt(attempt + 1, attempts);
                await delay(baseDelayMs * attempt);
            }
        }
        const summary = options.summarizeFailure?.(lastError);
        this.registerFailure(operation, stringifyError(lastError), {
            summary,
            captureConnection,
        });
        throw lastError;
    }
    acknowledgeError() {
        if (this.state === 'error') {
            this.transition('ready', 'error_acknowledged');
            this.lastError = null;
        }
    }
    startOperation(operation, maxAttempts) {
        const nextState = operation === 'clear_dtc' ? 'clearing' : 'reading';
        this.transition(nextState, `${operation}_start`);
        this.activeOperation = {
            name: operation,
            startedAt: new Date().toISOString(),
            attempt: 1,
            maxAttempts,
        };
        this.notifyListeners();
    }
    updateActiveOperationAttempt(attempt, maxAttempts) {
        if (!this.activeOperation)
            return;
        this.activeOperation = {
            ...this.activeOperation,
            attempt,
            maxAttempts,
        };
        this.notifyListeners();
    }
    finishOperation(operation, details = {}) {
        const eventAt = new Date();
        const eventAtIso = eventAt.toISOString();
        const active = this.activeOperation;
        const durationMs = active ? Math.max(0, eventAt.getTime() - new Date(active.startedAt).getTime()) : 0;
        const attempt = active?.attempt ?? 1;
        const attemptsAllowed = active?.maxAttempts ?? attempt;
        this.operationStats[operation].success += 1;
        this.operationStats[operation].totalDurationMs += durationMs;
        this.recordTimelineEvent({
            id: this.nextEventId(),
            type: 'operation',
            at: eventAtIso,
            operation,
            outcome: 'success',
            attempt,
            attemptsAllowed,
            durationMs,
            summary: details.summary,
            connection: details.captureConnection ? this.buildConnectionSummary() : undefined,
        });
        if (this.activeOperation?.name === operation) {
            this.activeOperation = null;
        }
        this.lastError = null;
        this.transition('ready', `${operation}_ok`);
    }
    registerFailure(operation, message, details = {}) {
        const eventAt = new Date();
        const eventAtIso = eventAt.toISOString();
        const active = this.activeOperation;
        const durationMs = active ? Math.max(0, eventAt.getTime() - new Date(active.startedAt).getTime()) : 0;
        const attempt = active?.attempt ?? 1;
        const attemptsAllowed = active?.maxAttempts ?? attempt;
        this.operationStats[operation].failure += 1;
        this.recordTimelineEvent({
            id: this.nextEventId(),
            type: 'operation',
            at: eventAtIso,
            operation,
            outcome: 'failure',
            attempt,
            attemptsAllowed,
            durationMs,
            summary: details.summary,
            error: message,
            connection: details.captureConnection ? this.buildConnectionSummary() : undefined,
        });
        if (this.activeOperation?.name === operation) {
            this.activeOperation = null;
        }
        const entry = {
            message,
            at: eventAtIso,
            operation,
        };
        this.lastError = entry;
        this.transition('error', `${operation}_failed`);
    }
    syncWithConnectionSnapshot(snapshot) {
        if (snapshot.state === 'connected') {
            if (this.state === 'disconnected' || this.state === 'connecting' || this.state === 'error') {
                this.transition(this.activeOperation ? this.state : 'ready', 'connection_ready');
            }
        }
        else if (snapshot.state === 'connecting') {
            if (this.state !== 'reading' && this.state !== 'clearing') {
                this.transition('connecting', 'connection_connecting');
            }
        }
        else {
            if (this.state !== 'disconnected') {
                this.activeOperation = null;
                this.transition('disconnected', 'connection_lost');
            }
        }
    }
    transition(nextState, reason) {
        if (this.state === nextState && !reason)
            return;
        const previousState = this.state;
        this.state = nextState;
        this.lastUpdatedAt = new Date().toISOString();
        const at = this.lastUpdatedAt;
        this.history.push({ state: nextState, at, reason });
        if (this.history.length > HISTORY_LIMIT) {
            this.history.splice(0, this.history.length - HISTORY_LIMIT);
        }
        this.recordTimelineEvent({
            id: this.nextEventId(),
            type: 'state_change',
            at,
            state: nextState,
            previousState,
            reason,
            reconnectAttempts: this.reconnectAttempts,
            connection: this.buildConnectionSummary(),
        });
        this.notifyListeners();
    }
    cloneTimeline() {
        return this.timeline.map((event) => this.cloneEvent(event));
    }
    cloneEvent(event) {
        return {
            ...event,
            connection: event.connection ? { ...event.connection } : undefined,
        };
    }
    buildConnectionSegments(windowStartMs, nowMs) {
        const entries = [...this.history];
        const segments = [];
        const nowIso = new Date(nowMs).toISOString();
        if (entries.length === 0) {
            const lastChangeMs = Date.parse(this.lastUpdatedAt);
            let startMs = Number.isFinite(lastChangeMs) ? lastChangeMs : nowMs;
            if (windowStartMs != null && startMs < windowStartMs) {
                startMs = windowStartMs;
            }
            const duration = Math.max(0, nowMs - startMs);
            segments.push({
                state: this.state,
                since: new Date(startMs).toISOString(),
                until: nowIso,
                durationMs: duration,
            });
            return segments;
        }
        for (let index = 0; index < entries.length; index += 1) {
            const current = entries[index];
            const next = entries[index + 1];
            const startMs = Date.parse(current.at);
            if (!Number.isFinite(startMs)) {
                continue;
            }
            let endMs = next ? Date.parse(next.at) : nowMs;
            if (!Number.isFinite(endMs)) {
                endMs = nowMs;
            }
            if (windowStartMs != null && endMs <= windowStartMs) {
                continue;
            }
            let segmentStart = startMs;
            if (windowStartMs != null && segmentStart < windowStartMs) {
                segmentStart = windowStartMs;
            }
            const duration = Math.max(0, endMs - segmentStart);
            if (duration <= 0) {
                continue;
            }
            segments.push({
                state: current.state,
                since: new Date(segmentStart).toISOString(),
                until: next ? new Date(endMs).toISOString() : nowIso,
                durationMs: duration,
            });
        }
        if (segments.length === 0) {
            const fallbackStart = windowStartMs != null ? windowStartMs : nowMs;
            segments.push({
                state: this.state,
                since: new Date(fallbackStart).toISOString(),
                until: nowIso,
                durationMs: Math.max(0, nowMs - fallbackStart),
            });
        }
        return segments;
    }
    buildMetrics() {
        const byOperation = {};
        let successTotal = 0;
        let failureTotal = 0;
        for (const [operation, stats] of Object.entries(this.operationStats)) {
            successTotal += stats.success;
            failureTotal += stats.failure;
            byOperation[operation] = {
                success: stats.success,
                failure: stats.failure,
                averageDurationMs: stats.success ? Math.round(stats.totalDurationMs / stats.success) : 0,
            };
        }
        return {
            operations: {
                total: successTotal + failureTotal,
                success: successTotal,
                failure: failureTotal,
                byOperation,
            },
            lastOperation: this.lastOperationEvent
                ? {
                    operation: this.lastOperationEvent.operation,
                    outcome: this.lastOperationEvent.outcome,
                    durationMs: this.lastOperationEvent.durationMs,
                    at: this.lastOperationEvent.at,
                    attempt: this.lastOperationEvent.attempt,
                    summary: this.lastOperationEvent.summary,
                    error: this.lastOperationEvent.error,
                }
                : undefined,
        };
    }
    recordTimelineEvent(event) {
        this.timeline.push(event);
        if (this.timeline.length > TIMELINE_LIMIT) {
            this.timeline.splice(0, this.timeline.length - TIMELINE_LIMIT);
        }
        if (event.type === 'operation') {
            this.lastOperationEvent = event;
        }
        this.persistEvent(event);
    }
    nextEventId() {
        this.eventCounter += 1;
        return `evt_${this.eventCounter.toString(36)}`;
    }
    buildConnectionSummary() {
        if (!this.latestConnection)
            return undefined;
        const { state, transport, identity, bluetoothName, lastConnectedAt, lastError } = this.latestConnection;
        return {
            state,
            transport,
            identity,
            bluetoothName,
            lastConnectedAt,
            lastError,
        };
    }
    notifyListeners() {
        if (!this.listeners.size)
            return;
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            }
            catch {
                // ignore listener errors
            }
        }
    }
    persistEvent(event) {
        if (!this.eventStore.enabled) {
            return;
        }
        try {
            this.eventStore.record(event);
        }
        catch {
            // Disk persistence must never break in-memory tracking; ignore persistence failures.
        }
    }
}
export const diagnosticSessionManager = new DiagnosticSessionManager();
