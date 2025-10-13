import { createClient } from '@supabase/supabase-js';
function createSupabase() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('Supabase URL/Key are not configured. Set SUPABASE_URL and SUPABASE_KEY');
    }
    return createClient(url, key);
}
const OPERATIONS = ['read_dtc', 'live_data', 'status', 'self_check', 'clear_dtc'];
const STATES = ['disconnected', 'connecting', 'authenticating', 'ready', 'reading', 'clearing', 'error'];
function createZeroCounters() {
    return { read_dtc: 0, live_data: 0, status: 0, self_check: 0, clear_dtc: 0 };
}
function createStateTotals() {
    return STATES.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
}
function summarizeFromEvents(events, options = {}) {
    // Для краткости используем ту же реализацию, что и в PG-сторе (локальный ring-буфер)
    // Импортировать дублирующий код не будем, чтобы не плодить зависимости; логика совпадает.
    const captureMs = Date.now();
    const since = options.since;
    const limitFailures = options.limitFailures ?? 20;
    const dailyMap = new Map();
    const byOpTotals = {
        read_dtc: { total: 0, success: 0, failure: 0 },
        live_data: { total: 0, success: 0, failure: 0 },
        status: { total: 0, success: 0, failure: 0 },
        self_check: { total: 0, success: 0, failure: 0 },
        clear_dtc: { total: 0, success: 0, failure: 0 },
    };
    const durationBuckets = { read_dtc: [], live_data: [], status: [], self_check: [], clear_dtc: [] };
    const failureCounts = createZeroCounters();
    const failureReasons = new Map();
    const failureEvents = [];
    const filtered = typeof since === 'string' && since.length
        ? events.filter((e) => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) >= Date.parse(since))
        : events;
    const opWithTs = [];
    const dateKey = (iso) => {
        if (!iso)
            return null;
        if (iso.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(iso))
            return iso.slice(0, 10);
        const parsed = Date.parse(iso);
        if (!Number.isFinite(parsed))
            return null;
        return new Date(parsed).toISOString().slice(0, 10);
    };
    for (const e of filtered) {
        const ev = e;
        if (ev.type !== 'operation')
            continue;
        const ts = Date.parse(ev.at);
        if (Number.isFinite(ts))
            opWithTs.push({ e: ev, ts });
        const d = dateKey(ev.at);
        if (d) {
            let bucket = dailyMap.get(d);
            if (!bucket) {
                bucket = { total: 0, success: 0, failure: 0, byOp: OPERATIONS.reduce((acc, op) => { acc[op] = { success: 0, failure: 0 }; return acc; }, {}) };
                dailyMap.set(d, bucket);
            }
            bucket.total += 1;
            const op = ev.operation;
            if (ev.outcome === 'success') {
                bucket.success += 1;
                bucket.byOp[op].success += 1;
            }
            else if (ev.outcome === 'failure') {
                bucket.failure += 1;
                bucket.byOp[op].failure += 1;
            }
        }
        const op = ev.operation;
        const acc = byOpTotals[op];
        acc.total += 1;
        acc.lastEventAt = ev.at;
        if (ev.outcome === 'success')
            acc.success += 1;
        else {
            acc.failure += 1;
            failureEvents.push(ev);
            failureCounts[op] += 1;
            failureReasons.set(ev.error ?? 'unknown_failure', (failureReasons.get(ev.error ?? 'unknown_failure') ?? 0) + 1);
        }
        if (Number.isFinite(ev.durationMs))
            durationBuckets[op].push(ev.durationMs);
    }
    const dailyKeys = Array.from(dailyMap.keys()).sort((a, b) => b.localeCompare(a));
    const maxDays = Math.max(1, Math.floor(options.maxDays ?? 14));
    const daily = dailyKeys.slice(0, maxDays).map((date) => {
        const b = dailyMap.get(date);
        const byOperation = OPERATIONS.reduce((acc, op) => {
            const o = b.byOp[op];
            acc[op] = { total: o.success + o.failure, success: o.success, failure: o.failure };
            return acc;
        }, {});
        return { date, total: b.total, success: b.success, failure: b.failure, successRate: b.total ? b.success / b.total : 0, failureRate: b.total ? b.failure / b.total : 0, byOperation };
    });
    function rolling(windowDays) {
        const startMs = captureMs - windowDays * 24 * 60 * 60 * 1000;
        const byOp = OPERATIONS.reduce((acc, op) => { acc[op] = { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 }; return acc; }, {});
        let success = 0, failure = 0;
        for (const { e, ts } of opWithTs) {
            if (ts < startMs)
                continue;
            const bucket = byOp[e.operation];
            bucket.total += 1;
            if (e.outcome === 'success') {
                bucket.success += 1;
                success += 1;
            }
            else {
                bucket.failure += 1;
                failure += 1;
            }
        }
        for (const op of OPERATIONS) {
            const m = byOp[op];
            m.successRate = m.total ? m.success / m.total : 0;
            m.failureRate = m.total ? m.failure / m.total : 0;
        }
        const total = success + failure;
        return {
            windowDays,
            from: new Date(startMs).toISOString(),
            until: new Date(captureMs).toISOString(),
            total,
            success,
            failure,
            successRate: total ? success / total : 0,
            failureRate: total ? failure / total : 0,
            byOperation: byOp,
            topFailures: Array.from(failureReasons.entries()).map(([error, count]) => ({ error, count })).sort((a, b) => (b.count - a.count) || a.error.localeCompare(b.error)).slice(0, 10),
        };
    }
    function classifyTrend(current, baseline) {
        const currentAvg = current.windowDays > 0 ? current.total / current.windowDays : 0;
        const baselineAvg = baseline.windowDays > 0 ? baseline.total / baseline.windowDays : 0;
        const totalDelta = currentAvg - baselineAvg;
        const successRateDelta = current.successRate - baseline.successRate;
        const failureRateDelta = current.failureRate - baseline.failureRate;
        const maxTotal = Math.max(current.total, baseline.total);
        if (maxTotal < 5)
            return { totalDelta, successRateDelta, failureRateDelta, status: 'insufficient_data', reason: 'Недостаточно данных', confidence: Number(((maxTotal / 10)).toFixed(2)) };
        if (successRateDelta >= 0.05 || failureRateDelta <= -0.05)
            return { totalDelta, successRateDelta, failureRateDelta, status: 'improving', reason: 'Растёт успех/падает отказ', confidence: 0.7 };
        if (successRateDelta <= -0.05 || failureRateDelta >= 0.05 || totalDelta <= -1)
            return { totalDelta, successRateDelta, failureRateDelta, status: 'regressing', reason: 'Хуже успех/больше отказов/меньше объём', confidence: 0.7 };
        return { totalDelta, successRateDelta, failureRateDelta, status: 'stable', reason: 'Существенных изменений не обнаружено', confidence: 0.6 };
    }
    const opsMetrics = OPERATIONS.reduce((acc, op) => {
        const c = byOpTotals[op];
        const bucket = durationBuckets[op];
        const total = c.total, success = c.success, failure = c.failure;
        const average = bucket.length ? Math.round(bucket.reduce((a, b) => a + b, 0) / bucket.length) : null;
        const sorted = [...bucket].sort((a, b) => a - b);
        const p95 = sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]) : null;
        acc[op] = {
            total, success, failure,
            successRate: total ? success / total : 0,
            failureRate: total ? failure / total : 0,
            averageDurationMs: average,
            minDurationMs: bucket.length ? Math.min(...bucket) : null,
            maxDurationMs: bucket.length ? Math.max(...bucket) : null,
            p95DurationMs: p95,
            lastEventAt: c.lastEventAt,
        };
        return acc;
    }, {});
    const totalSuccess = OPERATIONS.reduce((s, op) => s + opsMetrics[op].success, 0);
    const totalFailure = OPERATIONS.reduce((s, op) => s + opsMetrics[op].failure, 0);
    const totalOperations = totalSuccess + totalFailure;
    const rolling7 = rolling(7);
    const rolling30 = rolling(30);
    const overallTrend = classifyTrend(rolling7, rolling30);
    const byOperationTrends = OPERATIONS.reduce((acc, op) => {
        acc[op] = classifyTrend({ ...rolling7, total: rolling7.byOperation[op].total, successRate: rolling7.byOperation[op].successRate, failureRate: rolling7.byOperation[op].failureRate }, { ...rolling30, total: rolling30.byOperation[op].total, successRate: rolling30.byOperation[op].successRate, failureRate: rolling30.byOperation[op].failureRate });
        return acc;
    }, {});
    // Соединение (грубая оценка из событий состояний):
    const totalsByState = createStateTotals();
    const segments = [];
    const parseTs = (v) => v ? (Number.isFinite(Date.parse(v)) ? Date.parse(v) : undefined) : undefined;
    let currentState = 'disconnected';
    let currentSinceMs = parseTs(filtered[0]?.at) ?? captureMs;
    const pushSeg = (state, from, to) => {
        if (from == null || to == null || to <= from)
            return;
        const duration = to - from;
        totalsByState[state] += duration;
        segments.push({ state, since: new Date(from).toISOString(), until: new Date(to).toISOString(), durationMs: duration });
    };
    for (const ev of filtered) {
        if (ev.type !== 'state_change')
            continue;
        const atMs = parseTs(ev.at);
        if (atMs == null)
            continue;
        pushSeg(currentState, currentSinceMs, atMs);
        currentState = ev.state;
        currentSinceMs = atMs;
    }
    pushSeg(currentState, currentSinceMs, captureMs);
    return {
        capturedAt: new Date(captureMs).toISOString(),
        range: { since, until: filtered.length ? filtered[filtered.length - 1].at : undefined, totalEvents: filtered.length },
        operations: {
            total: totalOperations,
            success: totalSuccess,
            failure: totalFailure,
            successRate: totalOperations ? totalSuccess / totalOperations : 0,
            failureRate: totalOperations ? totalFailure / totalOperations : 0,
            averageDurationMs: null,
            p95DurationMs: null,
            byOperation: opsMetrics,
            daily,
            trends: { overall: overallTrend, byOperation: byOperationTrends },
        },
        failures: {
            total: totalFailure,
            byOperation: failureCounts,
            byError: Array.from(failureReasons.entries()).map(([error, count]) => ({ error, count })).sort((a, b) => (b.count - a.count) || a.error.localeCompare(b.error)),
            recent: failureEvents.slice(-limitFailures).map((ev) => ({ id: ev.id, at: ev.at, operation: ev.operation, error: ev.error, attemptsAllowed: ev.attemptsAllowed, attempt: ev.attempt })),
        },
        reliability: {
            meanTimeBetweenFailuresMs: null,
            meanTimeToRecoveryMs: null,
            currentFailureStreak: 0,
            lastFailureAt: failureEvents.at(-1)?.at,
        },
        connection: { transitions: segments.length ? segments.length - 1 : 0, totalsByState, uptimeRatio: null, segments },
        rolling: { last7Days: rolling7, last30Days: rolling30 },
    };
}
export function createSupabaseDiagnosticsEventStore() {
    const supabase = createSupabase();
    const table = process.env.SUPABASE_DIAGNOSTICS_TABLE || 'diagnostics_events';
    const ring = [];
    const MAX_BUFFER = 5000;
    const store = {
        enabled: true,
        driver: 'supabase',
        details: 'supabase',
        record(event) {
            // Пишем как есть: id, ts, type, payload
            // ignore result; Supabase QueryPromise is thenable but not full Promise in typings
            void supabase
                .from(table)
                .upsert({ id: event.id, ts: event.at, type: event.type, payload: event })
                .then(() => { }, () => { });
            try {
                ring.push(event);
                if (ring.length > MAX_BUFFER)
                    ring.splice(0, ring.length - MAX_BUFFER);
            }
            catch { /* ignore */ }
        },
        getRecent() { return ring.slice(Math.max(0, ring.length - 100)); },
        prune(beforeIso) {
            void supabase.from(table).delete().lt('ts', beforeIso).then(() => { }, () => { });
        },
        summarize(options) {
            return summarizeFromEvents(ring, options);
        },
    };
    return store;
}
