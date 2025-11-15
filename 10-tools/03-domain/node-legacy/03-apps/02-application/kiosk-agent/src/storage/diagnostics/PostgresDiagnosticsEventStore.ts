import { Pool } from 'pg'
import type {
  DiagnosticTimelineEvent,
  DiagnosticOperation,
  DiagnosticState,
} from '../../devices/obd/DiagnosticSessionManager.js'
import type {
  DiagnosticsEventStore,
  DiagnosticsEventStoreSummary,
  DiagnosticsEventStoreSummarizeOptions,
    DiagnosticsEventStoreTrendEntry,
} from '../sqlite/diagnosticsEventStore.js'

function getPgPool(): Pool {
  const { DATABASE_URL } = process.env
  if (DATABASE_URL) {
    return new Pool({ connectionString: DATABASE_URL })
  }
  const {
    PGHOST = '127.0.0.1',
    PGPORT = '5432',
    PGUSER = 'postgres',
    PGPASSWORD = 'postgres',
    PGDATABASE = 'kiosk',
  } = process.env
  return new Pool({
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
  })
}

/**
 * DiagnosticsEventStore backed by PostgreSQL diagnostics_events table.
 * Schema expected (see infra/sql-server/init/001_schema.sql):
 *   diagnostics_events(session_id TEXT, id TEXT PRIMARY KEY, ts TIMESTAMPTZ, type TEXT, payload JSONB)
 */
export function createPostgresDiagnosticsEventStore(): DiagnosticsEventStore {
  const pool = getPgPool()

  const insertText = `
    INSERT INTO diagnostics_events (id, ts, type, payload)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, type = EXCLUDED.type, payload = EXCLUDED.payload
  `

  // NOTE: selectRecent not implemented to keep sync interface; see getRecent comment.

  const pruneText = `
    DELETE FROM diagnostics_events WHERE ts < $1
  `

  // Keep a bounded in-memory buffer for fast sync summaries (no DB roundtrip).
  const MAX_BUFFER = 5000
  const ring: DiagnosticTimelineEvent[] = []

  function pushEvent(event: DiagnosticTimelineEvent): void {
    ring.push(event)
    if (ring.length > MAX_BUFFER) {
      ring.splice(0, ring.length - MAX_BUFFER)
    }
  }

  // ---- Lightweight aggregations reused from sqlite implementation ----
  const OPERATIONS: DiagnosticOperation[] = ['read_dtc', 'live_data', 'status', 'self_check', 'clear_dtc']
  const STATES: DiagnosticState[] = ['disconnected', 'connecting', 'authenticating', 'ready', 'reading', 'clearing', 'error']

  function extractDateKey(iso?: string): string | null {
    if (!iso) return null
    if (iso.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
    const parsed = Date.parse(iso)
    if (!Number.isFinite(parsed)) return null
    return new Date(parsed).toISOString().slice(0, 10)
  }

  function computeAverage(values: number[]): number | null {
    if (!values.length) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  function computePercentile(values: number[], percentile: number): number | null {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    if (percentile <= 0) return sorted[0] ?? null
    if (percentile >= 100) return sorted.at(-1) ?? null
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1))
    return sorted[idx] ?? null
  }

  function createZeroCounters(): Record<DiagnosticOperation, number> {
    return { read_dtc: 0, live_data: 0, status: 0, self_check: 0, clear_dtc: 0 }
  }

  function createStateTotals(): Record<DiagnosticState, number> {
    return STATES.reduce((acc, s) => { acc[s] = 0; return acc }, {} as Record<DiagnosticState, number>)
  }

  function buildConnectionSummaryFromEvents(
    events: DiagnosticTimelineEvent[], captureMs: number, since?: string
  ) {
    const totalsByState = createStateTotals()
    const segments: Array<{ state: DiagnosticState; since: string; until: string; durationMs: number }> = []
    let transitions = 0
    const parseTs = (v?: string) => v ? (Number.isFinite(Date.parse(v)) ? Date.parse(v) : undefined) : undefined
    let currentState: DiagnosticState = 'disconnected'
    let currentSinceMs = parseTs(since) ?? parseTs((events[0] as any)?.at) ?? captureMs
    const push = (state: DiagnosticState, from?: number, to?: number) => {
      if (from == null || to == null || to <= from) return
      const duration = to - from
      totalsByState[state] += duration
      segments.push({ state, since: new Date(from).toISOString(), until: new Date(to).toISOString(), durationMs: duration })
    }
    for (const ev of events) {
      if ((ev as any).type !== 'state_change') continue
      const atMs = parseTs((ev as any).at)
      if (atMs == null) continue
      push(currentState, currentSinceMs, atMs)
      if ((ev as any).previousState && (ev as any).previousState !== (ev as any).state) transitions += 1
      currentState = (ev as any).state
      currentSinceMs = atMs
    }
    push(currentState, currentSinceMs, captureMs)
    if (!segments.length) {
      const startMs = parseTs(since) ?? captureMs
      const duration = Math.max(0, captureMs - startMs)
      totalsByState[currentState] += duration
      segments.push({ state: currentState, since: new Date(startMs).toISOString(), until: new Date(captureMs).toISOString(), durationMs: duration })
    }
    return { segments, totalsByState, transitions }
  }

  function computeMeanTimeBetweenFailures(events: DiagnosticTimelineEvent[]): number | null {
    const failures = events.filter((e: any) => e.type === 'operation' && e.outcome === 'failure').map((e: any) => Date.parse(e.at)).filter(Number.isFinite)
    if (failures.length < 2) return null
    let total = 0
    for (let i = 1; i < failures.length; i++) total += (failures[i]! - failures[i - 1]!)
    return Math.round(total / (failures.length - 1))
  }

  function computeMeanTimeToRecovery(events: DiagnosticTimelineEvent[]): number | null {
    let total = 0, count = 0
    for (let i = 0; i < events.length; i++) {
      const ev: any = events[i]
      if (!(ev.type === 'operation' && ev.outcome === 'failure')) continue
      const failMs = Date.parse(ev.at); if (!Number.isFinite(failMs)) continue
      for (let k = i + 1; k < events.length; k++) {
        const cand: any = events[k]
        if (cand.type !== 'operation') continue
        const recMs = Date.parse(cand.at); if (!Number.isFinite(recMs) || recMs <= failMs) continue
        if (cand.outcome === 'success') { total += (recMs - failMs); count += 1; break }
      }
    }
    return count > 0 ? Math.round(total / count) : null
  }

  function computeCurrentFailureStreak(events: DiagnosticTimelineEvent[]): number {
    let streak = 0
    for (let i = events.length - 1; i >= 0; i--) {
      const ev: any = events[i]
      if (ev.type !== 'operation') continue
      if (ev.outcome === 'failure') streak += 1
      else if (ev.outcome === 'success') break
    }
    return streak
  }

  function summarizeFromEvents(
    events: DiagnosticTimelineEvent[],
    options: DiagnosticsEventStoreSummarizeOptions = {}
  ): DiagnosticsEventStoreSummary {
    const since = options.since
    const limitFailures = options.limitFailures ?? 20
    const captureMs = Date.now()
    const dailyMap = new Map<string, { total: number; success: number; failure: number; byOp: Record<DiagnosticOperation, { success: number; failure: number }> }>()
    const byOpTotals: Record<DiagnosticOperation, { total: number; success: number; failure: number; lastEventAt?: string }> = {
      read_dtc: { total: 0, success: 0, failure: 0 },
      live_data: { total: 0, success: 0, failure: 0 },
      status: { total: 0, success: 0, failure: 0 },
      self_check: { total: 0, success: 0, failure: 0 },
      clear_dtc: { total: 0, success: 0, failure: 0 },
    }
    const durationBuckets: Record<DiagnosticOperation, number[]> = { read_dtc: [], live_data: [], status: [], self_check: [], clear_dtc: [] }
    const failureCounts = createZeroCounters()
    const failureReasons = new Map<string, number>()
    const failureEvents: any[] = []

    // Filter by since if provided
    const filtered = typeof since === 'string' && since.length
      ? events.filter((e: any) => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) >= Date.parse(since))
      : events

    // Prepare rolling window computation support
    const opWithTs: Array<{ e: any; ts: number }> = []

    for (const e of filtered) {
      const ev = e as any
      if (ev.type !== 'operation') continue
      const ts = Date.parse(ev.at)
      if (Number.isFinite(ts)) opWithTs.push({ e: ev, ts })
      const dateKey = extractDateKey(ev.at)
      if (dateKey) {
        let bucket = dailyMap.get(dateKey)
        if (!bucket) {
          bucket = {
            total: 0,
            success: 0,
            failure: 0,
            byOp: OPERATIONS.reduce((acc, op) => { acc[op] = { success: 0, failure: 0 }; return acc }, {} as any),
          }
          dailyMap.set(dateKey, bucket)
        }
        bucket.total += 1
        const op = ev.operation as DiagnosticOperation
        if (ev.outcome === 'success') { bucket.success += 1; bucket.byOp[op].success += 1 }
        else if (ev.outcome === 'failure') { bucket.failure += 1; bucket.byOp[op].failure += 1 }
      }
      const op = ev.operation as DiagnosticOperation
      const acc = byOpTotals[op]
      acc.total += 1
      acc.lastEventAt = ev.at
      if (ev.outcome === 'success') acc.success += 1
      else { acc.failure += 1; failureEvents.push(ev); failureCounts[op] += 1; failureReasons.set(ev.error ?? 'unknown_failure', (failureReasons.get(ev.error ?? 'unknown_failure') ?? 0) + 1) }
      if (Number.isFinite(ev.durationMs)) durationBuckets[op].push(ev.durationMs)
    }

    const dailyKeys = Array.from(dailyMap.keys()).sort((a, b) => b.localeCompare(a))
    const maxDays = Math.max(1, Math.floor(options.maxDays ?? 14))
    const daily = dailyKeys.slice(0, maxDays).map((date) => {
      const b = dailyMap.get(date)!
      const byOperation = OPERATIONS.reduce((acc, op) => {
        const o = b.byOp[op]
        acc[op] = { total: o.success + o.failure, success: o.success, failure: o.failure }
        return acc
      }, {} as any)
      return { date, total: b.total, success: b.success, failure: b.failure, successRate: b.total ? b.success / b.total : 0, failureRate: b.total ? b.failure / b.total : 0, byOperation }
    })

    function rolling(windowDays: number) {
      const startMs = captureMs - windowDays * 24 * 60 * 60 * 1000
      const byOp = OPERATIONS.reduce((acc, op) => { acc[op] = { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 }; return acc }, {} as any)
      let success = 0, failure = 0
      for (const { e, ts } of opWithTs) {
        if (ts < startMs) continue
        const bucket = byOp[e.operation]
        bucket.total += 1
        if (e.outcome === 'success') { bucket.success += 1; success += 1 } else { bucket.failure += 1; failure += 1 }
      }
      for (const op of OPERATIONS) {
        const m = byOp[op]
        m.successRate = m.total ? m.success / m.total : 0
        m.failureRate = m.total ? m.failure / m.total : 0
      }
      const total = success + failure
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
      }
    }

    function classifyTrend(current: any, baseline: any): DiagnosticsEventStoreTrendEntry {
      const currentAvg = current.windowDays > 0 ? current.total / current.windowDays : 0
      const baselineAvg = baseline.windowDays > 0 ? baseline.total / baseline.windowDays : 0
      const totalDelta = currentAvg - baselineAvg
      const successRateDelta = current.successRate - baseline.successRate
      const failureRateDelta = current.failureRate - baseline.failureRate
      const maxTotal = Math.max(current.total, baseline.total)
      if (maxTotal < 5) return { totalDelta, successRateDelta, failureRateDelta, status: 'insufficient_data', reason: `Недостаточно данных`, confidence: Number(((maxTotal / 10)).toFixed(2)) }
      // Simple heuristics
      if (successRateDelta >= 0.05 || failureRateDelta <= -0.05)
        return { totalDelta, successRateDelta, failureRateDelta, status: 'improving', reason: 'Растёт успех/падает отказ', confidence: 0.7 }
      if (successRateDelta <= -0.05 || failureRateDelta >= 0.05 || totalDelta <= -1)
        return { totalDelta, successRateDelta, failureRateDelta, status: 'regressing', reason: 'Хуже успех/больше отказов/меньше объём', confidence: 0.7 }
      return { totalDelta, successRateDelta, failureRateDelta, status: 'stable', reason: 'Существенных изменений не обнаружено', confidence: 0.6 }
    }

    const opsMetrics = OPERATIONS.reduce((acc, op) => {
      const c = byOpTotals[op]
      const bucket = durationBuckets[op]
      const total = c.total, success = c.success, failure = c.failure
      const average = computeAverage(bucket)
      const p95 = computePercentile(bucket, 95)
      acc[op] = {
        total, success, failure,
        successRate: total ? success / total : 0,
        failureRate: total ? failure / total : 0,
        averageDurationMs: average != null ? Math.round(average) : null,
        minDurationMs: bucket.length ? Math.min(...bucket) : null,
        maxDurationMs: bucket.length ? Math.max(...bucket) : null,
        p95DurationMs: p95 != null ? Math.round(p95) : null,
        lastEventAt: c.lastEventAt,
      }
      return acc
    }, {} as any)

    const totalSuccess = OPERATIONS.reduce((s, op) => s + opsMetrics[op].success, 0)
    const totalFailure = OPERATIONS.reduce((s, op) => s + opsMetrics[op].failure, 0)
    const totalOperations = totalSuccess + totalFailure
    const allDurations = OPERATIONS.flatMap((op) => durationBuckets[op])
    const averageDuration = computeAverage(allDurations)
    const p95Duration = computePercentile(allDurations, 95)

    const rolling7 = rolling(7)
    const rolling30 = rolling(30)
    const overallTrend = classifyTrend(rolling7, rolling30)
    const byOperationTrends = OPERATIONS.reduce((acc, op) => {
      acc[op] = classifyTrend(
        { ...rolling7, total: rolling7.byOperation[op].total, successRate: rolling7.byOperation[op].successRate, failureRate: rolling7.byOperation[op].failureRate },
        { ...rolling30, total: rolling30.byOperation[op].total, successRate: rolling30.byOperation[op].successRate, failureRate: rolling30.byOperation[op].failureRate },
      )
      return acc
    }, {} as any)

    const { segments, totalsByState, transitions } = buildConnectionSummaryFromEvents(filtered, captureMs, since)
    let totalConnectionDuration = 0
    for (const v of Object.values(totalsByState)) totalConnectionDuration += v
    const uptimeRatio = totalConnectionDuration > 0 ? (totalsByState.ready / totalConnectionDuration) : null

    return {
      capturedAt: new Date(captureMs).toISOString(),
      range: { since, until: filtered.length ? (filtered[filtered.length - 1] as any).at : undefined, totalEvents: filtered.length },
      operations: {
        total: totalOperations,
        success: totalSuccess,
        failure: totalFailure,
        successRate: totalOperations ? totalSuccess / totalOperations : 0,
        failureRate: totalOperations ? totalFailure / totalOperations : 0,
        averageDurationMs: averageDuration != null ? Math.round(averageDuration) : null,
        p95DurationMs: p95Duration != null ? p95Duration : null,
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
        meanTimeBetweenFailuresMs: computeMeanTimeBetweenFailures(filtered),
        meanTimeToRecoveryMs: computeMeanTimeToRecovery(filtered),
        currentFailureStreak: computeCurrentFailureStreak(filtered),
        lastFailureAt: failureEvents.at(-1)?.at,
      },
      connection: { transitions, totalsByState, uptimeRatio, segments },
      rolling: { last7Days: rolling7, last30Days: rolling30 },
    }
  }

  const store: DiagnosticsEventStore = {
    enabled: true,
    // widen union in interface to include 'pg' in the sqlite definition file
    driver: 'pg' as any,
    record(event: DiagnosticTimelineEvent): void {
      // fire-and-forget best-effort; do not throw
      pool
        .query(insertText, [
          event.id,
          event.at,
          event.type,
          JSON.stringify(event),
        ])
        .catch(() => {/* ignore */})
      // keep in-memory buffer
      try { pushEvent(event) } catch { /* ignore */ }
    },
    getRecent(): DiagnosticTimelineEvent[] {
      // synchronous interface expects return; we can't block on async here.
      // To keep compatibility, return empty array quickly. The HTTP layer uses
      // in-memory timeline for recent events anyway. For explicit calls, consider
      // adding an async variant in future.
      // NOTE: DiagnosticSessionManager primarily uses summarize() when available.
      const n = 100
      return ring.slice(Math.max(0, ring.length - n))
    },
    prune(beforeIso: string): void {
      pool.query(pruneText, [beforeIso]).catch(() => {/* ignore */})
    },
    summarize(options: DiagnosticsEventStoreSummarizeOptions = {}): DiagnosticsEventStoreSummary {
      try {
        return summarizeFromEvents(ring, options)
      } catch {
        // Return an empty summary on error
        const now = Date.now()
        return {
          capturedAt: new Date(now).toISOString(),
          range: { since: options?.since, until: undefined, totalEvents: 0 },
          operations: {
            total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0,
            averageDurationMs: null, p95DurationMs: null,
            byOperation: {
              read_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, averageDurationMs: null, minDurationMs: null, maxDurationMs: null, p95DurationMs: null, lastEventAt: undefined },
              live_data: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, averageDurationMs: null, minDurationMs: null, maxDurationMs: null, p95DurationMs: null, lastEventAt: undefined },
              status: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, averageDurationMs: null, minDurationMs: null, maxDurationMs: null, p95DurationMs: null, lastEventAt: undefined },
              self_check: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, averageDurationMs: null, minDurationMs: null, maxDurationMs: null, p95DurationMs: null, lastEventAt: undefined },
              clear_dtc: { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, averageDurationMs: null, minDurationMs: null, maxDurationMs: null, p95DurationMs: null, lastEventAt: undefined },
            },
            daily: [],
            trends: { overall: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 }, byOperation: {
              read_dtc: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 },
              live_data: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 },
              status: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 },
              self_check: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 },
              clear_dtc: { totalDelta: 0, successRateDelta: 0, failureRateDelta: 0, status: 'insufficient_data', reason: 'Нет данных', confidence: 0 },
            } },
          },
          failures: { total: 0, byOperation: createZeroCounters(), byError: [], recent: [] },
          reliability: { meanTimeBetweenFailuresMs: null, meanTimeToRecoveryMs: null, currentFailureStreak: 0, lastFailureAt: undefined },
          connection: { transitions: 0, totalsByState: createStateTotals(), uptimeRatio: null, segments: [] },
          rolling: {
            last7Days: { windowDays: 7, from: new Date(now - 7 * 86400000).toISOString(), until: new Date(now).toISOString(), total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, byOperation: OPERATIONS.reduce((acc, op) => { acc[op] = { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 }; return acc }, {} as any), topFailures: [] },
            last30Days: { windowDays: 30, from: new Date(now - 30 * 86400000).toISOString(), until: new Date(now).toISOString(), total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0, byOperation: OPERATIONS.reduce((acc, op) => { acc[op] = { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 }; return acc }, {} as any), topFailures: [] },
          },
        }
      }
    },
  }

  return store
}
