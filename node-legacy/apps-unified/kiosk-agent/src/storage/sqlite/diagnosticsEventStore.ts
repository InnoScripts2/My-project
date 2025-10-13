import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type {
  DiagnosticTimelineEvent,
  DiagnosticOperation,
  DiagnosticState,
} from '../../devices/obd/DiagnosticSessionManager.js';

export interface DiagnosticsEventStoreSummarizeOptions {
  since?: string;
  limitFailures?: number;
  maxDays?: number;
}

export interface DiagnosticsEventStoreSummaryDailyEntry {
  date: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  failureRate: number;
  byOperation: Record<DiagnosticOperation, {
    total: number;
    success: number;
    failure: number;
  }>;
}

export interface DiagnosticsEventStoreRollingEntry {
  windowDays: number;
  from: string;
  until: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  failureRate: number;
  byOperation: Record<DiagnosticOperation, {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    failureRate: number;
  }>;
  topFailures: Array<{ error: string; count: number }>;
}

export interface DiagnosticsEventStoreSummary {
  capturedAt: string;
  range: {
    since?: string;
    until?: string;
    totalEvents: number;
  };
  operations: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    failureRate: number;
    averageDurationMs: number | null;
    p95DurationMs: number | null;
    byOperation: Record<DiagnosticOperation, {
      total: number;
      success: number;
      failure: number;
      successRate: number;
      failureRate: number;
      averageDurationMs: number | null;
      minDurationMs: number | null;
      maxDurationMs: number | null;
      p95DurationMs: number | null;
      lastEventAt?: string;
    }>;
    daily: DiagnosticsEventStoreSummaryDailyEntry[];
    trends: {
      overall: DiagnosticsEventStoreTrendEntry;
      byOperation: Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry>;
    };
  };
  failures: {
    total: number;
    byOperation: Record<DiagnosticOperation, number>;
    byError: Array<{ error: string; count: number }>;
    recent: Array<{
      id: string;
      at: string;
      operation: DiagnosticOperation;
      error?: string;
      attemptsAllowed?: number;
      attempt?: number;
    }>;
  };
  reliability: {
    meanTimeBetweenFailuresMs: number | null;
    meanTimeToRecoveryMs: number | null;
    currentFailureStreak: number;
    lastFailureAt?: string;
  };
  connection: {
    transitions: number;
    totalsByState: Record<DiagnosticState, number>;
    uptimeRatio: number | null;
    segments: Array<{
      state: DiagnosticState;
      since: string;
      until: string;
      durationMs: number;
    }>;
  };
  rolling: {
    last7Days: DiagnosticsEventStoreRollingEntry;
    last30Days: DiagnosticsEventStoreRollingEntry;
  };
}

export interface DiagnosticsEventStoreTrendEntry {
  totalDelta: number;
  successRateDelta: number;
  failureRateDelta: number;
  status: DiagnosticsEventStoreTrendStatus;
  reason: string;
  confidence: number;
}

export type DiagnosticsEventStoreTrendStatus =
  | 'improving'
  | 'stable'
  | 'regressing'
  | 'insufficient_data';

export interface DiagnosticsEventStore {
  readonly enabled: boolean;
  readonly driver: 'sqlite' | 'noop' | 'pg' | 'supabase';
  readonly details?: string;
  record(event: DiagnosticTimelineEvent): void;
  getRecent?(limit?: number): DiagnosticTimelineEvent[];
  prune?(beforeIso: string): void;
  summarize?(options?: DiagnosticsEventStoreSummarizeOptions): DiagnosticsEventStoreSummary;
  close?(): void;
}

interface DailyOperationAccumulator {
  success: number;
  failure: number;
}

interface DailyAccumulator {
  total: number;
  success: number;
  failure: number;
  operations: Record<DiagnosticOperation, DailyOperationAccumulator>;
}

type OperationEvent = Extract<DiagnosticTimelineEvent, { type: 'operation' }>;

interface OperationWithTimestamp {
  event: OperationEvent;
  timestamp: number;
}

interface RollingOperationMetrics {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  failureRate: number;
}

const TREND_MIN_EVENTS_FOR_STATUS = 5;
const TREND_SUCCESS_RATE_THRESHOLD = 0.05;
const TREND_FAILURE_RATE_THRESHOLD = 0.05;
const TREND_TOTAL_DELTA_THRESHOLD = 1;

function createEmptyTrendEntry(): DiagnosticsEventStoreTrendEntry {
  return {
    totalDelta: 0,
    successRateDelta: 0,
    failureRateDelta: 0,
    status: 'insufficient_data',
    reason: 'Недостаточно наблюдений для анализа тренда',
    confidence: 0,
  };
}

interface SqliteStoreOptions {
  databasePath?: string;
  maxRows?: number;
  namespace?: string;
}

const DEFAULT_MAX_ROWS = 5000;
const DEFAULT_NAMESPACE = 'diagnostics';
const DEFAULT_SUMMARY_FAILURE_LIMIT = 20;
const DEFAULT_MAX_DAILY_BUCKETS = 14;

function createDailyAccumulator(): DailyAccumulator {
  return {
    total: 0,
    success: 0,
    failure: 0,
    operations: createDailyOperationAccumulator(),
  };
}

function extractDateKey(iso: string | undefined): string | null {
  if (typeof iso !== 'string' || iso.length < 10) {
    if (!iso) return null;
    const parsed = Date.parse(iso ?? '');
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString().slice(0, 10);
  }
  const key = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return key;
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function resolveMaxDays(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_DAILY_BUCKETS;
  }
  return Math.floor(value);
}

function buildDailySummaryEntries(
  buckets: Map<string, DailyAccumulator>,
  maxDays: number
): DiagnosticsEventStoreSummaryDailyEntry[] {
  if (!buckets.size || maxDays <= 0) {
    return [];
  }
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => b.localeCompare(a));
  const limitedKeys = sortedKeys.slice(0, maxDays);
  return limitedKeys.map((date) => {
    const bucket = buckets.get(date)!;
    const { total, success, failure } = bucket;
    const successRate = total ? success / total : 0;
    const failureRate = total ? failure / total : 0;
    const byOperation = OPERATIONS.reduce((acc, operation) => {
      const operationBucket = bucket.operations[operation] ?? { success: 0, failure: 0 };
      acc[operation] = {
        total: operationBucket.success + operationBucket.failure,
        success: operationBucket.success,
        failure: operationBucket.failure,
      };
      return acc;
    }, {} as DiagnosticsEventStoreSummaryDailyEntry['byOperation']);

    return {
      date,
      total,
      success,
      failure,
      successRate,
      failureRate,
      byOperation,
    };
  });
}

const OPERATIONS: DiagnosticOperation[] = ['read_dtc', 'live_data', 'status', 'self_check', 'clear_dtc'];
const STATES: DiagnosticState[] = ['disconnected', 'connecting', 'authenticating', 'ready', 'reading', 'clearing', 'error'];

function createDailyOperationAccumulator(): Record<DiagnosticOperation, DailyOperationAccumulator> {
  return OPERATIONS.reduce((acc, operation) => {
    acc[operation] = { success: 0, failure: 0 };
    return acc;
  }, {} as Record<DiagnosticOperation, DailyOperationAccumulator>);
}

function createStateTotals(): Record<DiagnosticState, number> {
  return STATES.reduce((acc, state) => {
    acc[state] = 0;
    return acc;
  }, {} as Record<DiagnosticState, number>);
}

function createZeroCounters(): Record<DiagnosticOperation, number> {
  return {
    read_dtc: 0,
    live_data: 0,
    status: 0,
    self_check: 0,
    clear_dtc: 0,
  };
}

interface OperationAccumulator {
  total: number;
  success: number;
  failure: number;
  lastEventAt?: string;
}

function createOperationAccumulator(): Record<DiagnosticOperation, OperationAccumulator> {
  return {
    read_dtc: { total: 0, success: 0, failure: 0 },
    live_data: { total: 0, success: 0, failure: 0 },
    status: { total: 0, success: 0, failure: 0 },
    self_check: { total: 0, success: 0, failure: 0 },
    clear_dtc: { total: 0, success: 0, failure: 0 },
  };
}

function createDurationBuckets(): Record<DiagnosticOperation, number[]> {
  return {
    read_dtc: [],
    live_data: [],
    status: [],
    self_check: [],
    clear_dtc: [],
  };
}

function createRollingOperationBuckets(): Record<DiagnosticOperation, RollingOperationMetrics> {
  return OPERATIONS.reduce((acc, operation) => {
    acc[operation] = {
      total: 0,
      success: 0,
      failure: 0,
      successRate: 0,
      failureRate: 0,
    };
    return acc;
  }, {} as Record<DiagnosticOperation, RollingOperationMetrics>);
}

function createEmptyRollingEntry(windowDays: number, captureMs: number): DiagnosticsEventStoreRollingEntry {
  const untilIso = new Date(captureMs).toISOString();
  const fromIso = new Date(captureMs - windowDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    windowDays,
    from: fromIso,
    until: untilIso,
    total: 0,
    success: 0,
    failure: 0,
    successRate: 0,
    failureRate: 0,
    byOperation: createRollingOperationBuckets(),
    topFailures: [],
  };
}

function createEmptyOperationMetrics(): DiagnosticsEventStoreSummary['operations']['byOperation'] {
  return {
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
  };
}

function computeAverage(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function computePercentile(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  if (percentile <= 0) return values[0] ?? null;
  if (percentile >= 100) return values.at(-1) ?? null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function applyOperationMetrics(
  counts: Record<DiagnosticOperation, OperationAccumulator>,
  durations: Record<DiagnosticOperation, number[]>
): DiagnosticsEventStoreSummary['operations']['byOperation'] {
  const metrics = createEmptyOperationMetrics();
  for (const operation of OPERATIONS) {
    const count = counts[operation]!;
    const bucket = durations[operation] ?? [];
    const total = count.total;
    const success = count.success;
    const failure = count.failure;
    const successRate = total ? success / total : 0;
    const failureRate = total ? failure / total : 0;
    const average = computeAverage(bucket);
    const p95 = computePercentile(bucket, 95);
    const min = bucket.length ? Math.min(...bucket) : null;
    const max = bucket.length ? Math.max(...bucket) : null;
    metrics[operation] = {
      total,
      success,
      failure,
      successRate,
      failureRate,
      averageDurationMs: average != null ? Math.round(average) : null,
      minDurationMs: min != null ? min : null,
      maxDurationMs: max != null ? max : null,
      p95DurationMs: p95 != null ? Math.round(p95) : null,
      lastEventAt: count.lastEventAt,
    };
  }
  return metrics;
}

function computeMeanTimeBetweenFailures(events: DiagnosticTimelineEvent[]): number | null {
  const failures = events
    .filter((event): event is Extract<DiagnosticTimelineEvent, { type: 'operation' }> => {
      return event.type === 'operation' && event.outcome === 'failure';
    })
    .map((event) => Date.parse(event.at))
    .filter((timestamp): timestamp is number => Number.isFinite(timestamp));

  if (failures.length < 2) {
    return null;
  }

  let total = 0;
  for (let index = 1; index < failures.length; index += 1) {
    total += failures[index]! - failures[index - 1]!;
  }

  return Math.round(total / (failures.length - 1));
}

function computeMeanTimeToRecovery(events: DiagnosticTimelineEvent[]): number | null {
  let total = 0;
  let count = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!(event.type === 'operation' && event.outcome === 'failure')) continue;
    const failureTime = Date.parse(event.at);
    if (!Number.isFinite(failureTime)) continue;
    for (let cursor = index + 1; cursor < events.length; cursor += 1) {
      const candidate = events[cursor];
      if (candidate.type !== 'operation') continue;
      const recoveryTime = Date.parse(candidate.at);
      if (!Number.isFinite(recoveryTime) || recoveryTime <= failureTime) continue;
      if (candidate.outcome === 'success') {
        total += recoveryTime - failureTime;
        count += 1;
        break;
      }
    }
  }
  return count > 0 ? Math.round(total / count) : null;
}

function computeCurrentFailureStreak(events: DiagnosticTimelineEvent[]): number {
  let streak = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'operation') continue;
    if (event.outcome === 'failure') {
      streak += 1;
    } else if (event.outcome === 'success') {
      break;
    }
  }
  return streak;
}

function buildConnectionSummaryFromEvents(
  events: DiagnosticTimelineEvent[],
  captureMs: number,
  since?: string
): {
  segments: DiagnosticsEventStoreSummary['connection']['segments'];
  totalsByState: Record<DiagnosticState, number>;
  transitions: number;
} {
  const totalsByState = createStateTotals();
  const segments: DiagnosticsEventStoreSummary['connection']['segments'] = [];
  let transitions = 0;

  const parseTimestamp = (value?: string): number | undefined => {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  };

  let currentState: DiagnosticState = 'disconnected';
  let currentSinceMs = parseTimestamp(since) ?? parseTimestamp(events[0]?.at) ?? captureMs;

  const pushSegment = (state: DiagnosticState, fromMs: number | undefined, toMs: number | undefined): void => {
    if (fromMs === undefined || toMs === undefined) return;
    if (toMs <= fromMs) return;
    const duration = toMs - fromMs;
    totalsByState[state] += duration;
    segments.push({
      state,
      since: new Date(fromMs).toISOString(),
      until: new Date(toMs).toISOString(),
      durationMs: duration,
    });
  };

  for (const event of events) {
    if (event.type !== 'state_change') continue;
    const eventMs = parseTimestamp(event.at);
    if (eventMs === undefined) continue;

    pushSegment(currentState, currentSinceMs, eventMs);

    if (event.previousState && event.previousState !== event.state) {
      transitions += 1;
    }

    currentState = event.state;
    currentSinceMs = eventMs;
  }

  pushSegment(currentState, currentSinceMs, captureMs);

  if (!segments.length) {
    const startMs = parseTimestamp(since) ?? captureMs;
    const duration = Math.max(0, captureMs - startMs);
    totalsByState[currentState] += duration;
    segments.push({
      state: currentState,
      since: new Date(startMs).toISOString(),
      until: new Date(captureMs).toISOString(),
      durationMs: duration,
    });
  }

  return { segments, totalsByState, transitions };
}

function computeRollingWindow(
  operationEvents: OperationWithTimestamp[],
  captureMs: number,
  windowDays: number
): DiagnosticsEventStoreRollingEntry {
  const windowLengthMs = Math.max(1, windowDays) * 24 * 60 * 60 * 1000;
  const windowStartMs = captureMs - windowLengthMs;
  const buckets = createRollingOperationBuckets();
  const failureReasons = new Map<string, number>();
  let success = 0;
  let failure = 0;

  for (const { event, timestamp } of operationEvents) {
    if (timestamp < windowStartMs) continue;
    const bucket = buckets[event.operation]!;
    bucket.total += 1;
    if (event.outcome === 'success') {
      bucket.success += 1;
      success += 1;
    } else if (event.outcome === 'failure') {
      bucket.failure += 1;
      failure += 1;
      const reason = event.error ?? 'unknown_failure';
      failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
    }
  }

  for (const operation of OPERATIONS) {
    const entry = buckets[operation]!;
    entry.successRate = entry.total ? entry.success / entry.total : 0;
    entry.failureRate = entry.total ? entry.failure / entry.total : 0;
  }

  const total = success + failure;
  const successRate = total ? success / total : 0;
  const failureRate = total ? failure / total : 0;

  const topFailures = Array.from(failureReasons.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => (b.count === a.count ? a.error.localeCompare(b.error) : b.count - a.count))
    .slice(0, 10);

  return {
    windowDays,
    from: new Date(windowStartMs).toISOString(),
    until: new Date(captureMs).toISOString(),
    total,
    success,
    failure,
    successRate,
    failureRate,
    byOperation: buckets,
    topFailures,
  };
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function classifyTrendStatus(
  currentTotal: number,
  baselineTotal: number,
  successRateDelta: number,
  failureRateDelta: number,
  totalDelta: number
): { status: DiagnosticsEventStoreTrendStatus; reason: string; confidence: number } {
  const totalEvents = currentTotal + baselineTotal;
  const eventSupport = clamp(totalEvents / (TREND_MIN_EVENTS_FOR_STATUS * 2));
  const deltaSupportBase = Math.max(
    Math.abs(successRateDelta) / TREND_SUCCESS_RATE_THRESHOLD,
    Math.abs(failureRateDelta) / TREND_FAILURE_RATE_THRESHOLD,
    Math.abs(totalDelta) / TREND_TOTAL_DELTA_THRESHOLD
  );
  const deltaSupport = clamp(deltaSupportBase);

  if (Math.max(currentTotal, baselineTotal) < TREND_MIN_EVENTS_FOR_STATUS) {
    const max = Math.max(currentTotal, baselineTotal);
    return {
      status: 'insufficient_data',
      reason: `Недостаточно данных: доступно ${max} операций, требуется минимум ${TREND_MIN_EVENTS_FOR_STATUS}`,
      confidence: Number((eventSupport / 2).toFixed(2)),
    };
  }

  const improvingBySuccess = successRateDelta >= TREND_SUCCESS_RATE_THRESHOLD;
  const improvingByFailures = failureRateDelta <= -TREND_FAILURE_RATE_THRESHOLD;
  const regressingBySuccess = successRateDelta <= -TREND_SUCCESS_RATE_THRESHOLD;
  const regressingByFailures = failureRateDelta >= TREND_FAILURE_RATE_THRESHOLD;
  const improvingByVolume = totalDelta >= TREND_TOTAL_DELTA_THRESHOLD;
  const regressingByVolume = totalDelta <= -TREND_TOTAL_DELTA_THRESHOLD;

  if (improvingBySuccess || improvingByFailures) {
    if (!regressingByVolume) {
      const reason = improvingBySuccess
        ? `Процент успешных операций вырос на ${(successRateDelta * 100).toFixed(1)} п.п.`
        : `Процент отказов снизился на ${(Math.abs(failureRateDelta) * 100).toFixed(1)} п.п.`;
      const confidence = Number((((eventSupport + deltaSupport) / 2)).toFixed(2));
      return { status: 'improving', reason, confidence };
    }
  }

  if (regressingBySuccess || regressingByFailures || regressingByVolume) {
    const confidence = Number((((eventSupport + deltaSupport) / 2)).toFixed(2));
    if (regressingByFailures) {
      return {
        status: 'regressing',
        reason: `Процент отказов вырос на ${(failureRateDelta * 100).toFixed(1)} п.п.`,
        confidence,
      };
    }
    if (regressingBySuccess) {
      return {
        status: 'regressing',
        reason: `Процент успешных операций снизился на ${(Math.abs(successRateDelta) * 100).toFixed(1)} п.п.`,
        confidence,
      };
    }
    return {
      status: 'regressing',
      reason: `Общий объём операций сократился на ${(Math.abs(totalDelta)).toFixed(1)} в сутки`,
      confidence,
    };
  }

  if (improvingByVolume) {
    return {
      status: 'improving',
      reason: `Общий объём операций вырос на ${totalDelta.toFixed(1)} в сутки`,
      confidence: Number((((eventSupport + deltaSupport) / 2)).toFixed(2)),
    };
  }

  return {
    status: 'stable',
    reason: 'Существенных изменений в динамике не зафиксировано',
    confidence: Number(((eventSupport * 0.75)).toFixed(2)),
  };
}

function computeTrendEntry(
  current: DiagnosticsEventStoreRollingEntry,
  baseline: DiagnosticsEventStoreRollingEntry
): DiagnosticsEventStoreTrendEntry {
  const currentAvg = current.windowDays > 0 ? current.total / current.windowDays : 0;
  const baselineAvg = baseline.windowDays > 0 ? baseline.total / baseline.windowDays : 0;
  const totalDelta = currentAvg - baselineAvg;
  const successRateDelta = current.successRate - baseline.successRate;
  const failureRateDelta = current.failureRate - baseline.failureRate;
  const { status, reason, confidence } = classifyTrendStatus(
    current.total,
    baseline.total,
    successRateDelta,
    failureRateDelta,
    totalDelta
  );
  return {
    totalDelta,
    successRateDelta,
    failureRateDelta,
    status,
    reason,
    confidence,
  };
}

function computeOperationTrends(
  current: DiagnosticsEventStoreRollingEntry,
  baseline: DiagnosticsEventStoreRollingEntry
): Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry> {
  const result: Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry> = {} as Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry>;
  for (const operation of OPERATIONS) {
    const currentMetrics = current.byOperation[operation] ?? { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 };
    const baselineMetrics = baseline.byOperation[operation] ?? { total: 0, success: 0, failure: 0, successRate: 0, failureRate: 0 };
    const currentAvg = current.windowDays > 0 ? currentMetrics.total / current.windowDays : 0;
    const baselineAvg = baseline.windowDays > 0 ? baselineMetrics.total / baseline.windowDays : 0;
    const successRateDelta = currentMetrics.successRate - baselineMetrics.successRate;
    const failureRateDelta = currentMetrics.failureRate - baselineMetrics.failureRate;
    const totalDelta = currentAvg - baselineAvg;
    const { status, reason, confidence } = classifyTrendStatus(
      currentMetrics.total,
      baselineMetrics.total,
      successRateDelta,
      failureRateDelta,
      totalDelta
    );
    result[operation] = {
      totalDelta,
      successRateDelta,
      failureRateDelta,
      status,
      reason,
      confidence,
    };
  }
  return result;
}

function createEmptyTrendMap(): Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry> {
  return OPERATIONS.reduce((acc, operation) => {
    acc[operation] = createEmptyTrendEntry();
    return acc;
  }, {} as Record<DiagnosticOperation, DiagnosticsEventStoreTrendEntry>);
}

function ensureDirectoryExists(filePath: string): void {
  const directory = dirname(filePath);
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    // directory already exists or cannot be created; let downstream operations surface errors
  }
}

function createNoopStore(reason: string): DiagnosticsEventStore {
  return {
    enabled: false,
    driver: 'noop',
    details: reason,
    record() {
      /* intentionally blank */
    },
  };
}

export function createDiagnosticsEventStore(options: SqliteStoreOptions = {}): DiagnosticsEventStore {
  const require = createRequire(import.meta.url);
  let DatabaseCtor: any;
  try {
    DatabaseCtor = require('better-sqlite3');
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    return createNoopStore(`better-sqlite3 unavailable: ${hint}`);
  }

  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const databasePath = options.databasePath ?? join(process.cwd(), 'data', `${namespace}.sqlite`);
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  ensureDirectoryExists(databasePath);

  const db = new DatabaseCtor(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnostic_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      operation TEXT,
      outcome TEXT,
      state TEXT,
      previous_state TEXT,
      attempt INTEGER,
      attempts_allowed INTEGER,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_diagnostic_events_created_at
      ON diagnostic_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_diagnostic_events_type
      ON diagnostic_events(type);
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO diagnostic_events (
      id,
      created_at,
      type,
      payload,
      operation,
      outcome,
      state,
      previous_state,
      attempt,
      attempts_allowed,
      duration_ms
    ) VALUES (@id, @created_at, @type, @payload, @operation, @outcome, @state, @previous_state, @attempt, @attempts_allowed, @duration_ms)
  `);

  const countStmt = db.prepare('SELECT COUNT(1) as total FROM diagnostic_events');
  const deleteStmt = db.prepare('DELETE FROM diagnostic_events WHERE id IN (SELECT id FROM diagnostic_events ORDER BY created_at ASC LIMIT @limit)');
  const selectRecentStmt = db.prepare('SELECT payload FROM diagnostic_events ORDER BY created_at DESC LIMIT @limit');
  const selectWindowStmt = db.prepare('SELECT payload FROM diagnostic_events WHERE @since IS NULL OR created_at >= @since ORDER BY created_at ASC');

  const enforceBudget = (): void => {
    if (!maxRows || maxRows <= 0) {
      return;
    }
    const { total } = countStmt.get() as { total: number };
    if (total > maxRows) {
      deleteStmt.run({ limit: total - maxRows });
    }
  };

  return {
    enabled: true,
    driver: 'sqlite',
    details: databasePath,
    record(event: DiagnosticTimelineEvent) {
      try {
        insertStmt.run({
          id: event.id,
          created_at: event.at,
          type: event.type,
          payload: JSON.stringify(event),
          operation: event.type === 'operation' ? event.operation : null,
          outcome: event.type === 'operation' ? event.outcome : null,
          state: event.type === 'state_change' ? event.state : event.connection?.state ?? null,
          previous_state: event.type === 'state_change' ? event.previousState : null,
          attempt: event.type === 'operation' ? event.attempt : null,
          attempts_allowed: event.type === 'operation' ? event.attemptsAllowed : null,
          duration_ms: event.type === 'operation' ? event.durationMs : null,
        });
        enforceBudget();
      } catch (error) {
        // Persisting events should never disrupt runtime diagnostics tracking, so swallow errors quietly.
      }
    },
    getRecent(limit = 100): DiagnosticTimelineEvent[] {
      try {
        const rows = selectRecentStmt.all({ limit });
        return rows.map((row: { payload: string }) => JSON.parse(row.payload) as DiagnosticTimelineEvent);
      } catch {
        return [];
      }
    },
    prune(beforeIso: string): void {
      try {
        db.prepare('DELETE FROM diagnostic_events WHERE created_at < @threshold').run({ threshold: beforeIso });
      } catch {
        // ignore prune errors
      }
    },
    summarize(options: DiagnosticsEventStoreSummarizeOptions = {}): DiagnosticsEventStoreSummary {
      const since = options.since;
      const limitFailures = options.limitFailures ?? DEFAULT_SUMMARY_FAILURE_LIMIT;
      try {
        const rows = selectWindowStmt.all({ since: since ?? null }) as Array<{ payload: string }>;
        const events = rows.map((row) => {
          try {
            return JSON.parse(row.payload) as DiagnosticTimelineEvent;
          } catch {
            return undefined;
          }
        }).filter((event): event is DiagnosticTimelineEvent => !!event);

        const captureMs = Date.now();
        const operationCounts = createOperationAccumulator();
        const durationBuckets = createDurationBuckets();
        const maxDailyBuckets = resolveMaxDays(options.maxDays);
        const dailyBuckets = new Map<string, DailyAccumulator>();
        const failureCounts = createZeroCounters();
        const failureReasons = new Map<string, number>();
        const failureEvents: OperationEvent[] = [];
        const operationEventsWithTime: OperationWithTimestamp[] = [];

        for (const event of events) {
          if (event.type !== 'operation') continue;
          const timestamp = Date.parse(event.at);
          if (Number.isFinite(timestamp)) {
            operationEventsWithTime.push({ event, timestamp });
          }
          const dateKey = extractDateKey(event.at);
          if (dateKey) {
            let dailyBucket = dailyBuckets.get(dateKey);
            if (!dailyBucket) {
              dailyBucket = createDailyAccumulator();
              dailyBuckets.set(dateKey, dailyBucket);
            }
            dailyBucket.total += 1;
            if (event.outcome === 'success') {
              dailyBucket.success += 1;
              dailyBucket.operations[event.operation]!.success += 1;
            } else if (event.outcome === 'failure') {
              dailyBucket.failure += 1;
              dailyBucket.operations[event.operation]!.failure += 1;
            }
          }
          const accumulator = operationCounts[event.operation];
          accumulator.total += 1;
          accumulator.lastEventAt = event.at;
          if (event.outcome === 'success') {
            accumulator.success += 1;
          } else {
            accumulator.failure += 1;
            failureEvents.push(event);
            failureCounts[event.operation] += 1;
            const reason = event.error ?? 'unknown_failure';
            failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
          }
          if (Number.isFinite(event.durationMs)) {
            durationBuckets[event.operation].push(event.durationMs);
          }
        }

  const rollingLast7Days = computeRollingWindow(operationEventsWithTime, captureMs, 7);
  const rollingLast30Days = computeRollingWindow(operationEventsWithTime, captureMs, 30);
  const operationTrends = computeOperationTrends(rollingLast7Days, rollingLast30Days);
  const overallTrend = computeTrendEntry(rollingLast7Days, rollingLast30Days);

    const operationsByOperation = applyOperationMetrics(operationCounts, durationBuckets);
        const totalSuccess = OPERATIONS.reduce((sum, key) => sum + operationsByOperation[key]!.success, 0);
        const totalFailure = OPERATIONS.reduce((sum, key) => sum + operationsByOperation[key]!.failure, 0);
        const totalOperations = totalSuccess + totalFailure;
        const successRate = totalOperations ? totalSuccess / totalOperations : 0;
        const failureRate = totalOperations ? totalFailure / totalOperations : 0;
        const allDurations = OPERATIONS.flatMap((operation) => durationBuckets[operation]!);
        const averageDuration = computeAverage(allDurations);
    const p95Duration = computePercentile(allDurations, 95);
    const daily = buildDailySummaryEntries(dailyBuckets, maxDailyBuckets);

        const sortedFailureReasons = Array.from(failureReasons.entries())
          .map(([error, count]) => ({ error, count }))
          .sort((a, b) => (b.count === a.count ? a.error.localeCompare(b.error) : b.count - a.count));

        const recentFailures = failureEvents
          .slice(-limitFailures)
          .map((event) => ({
            id: event.id,
            at: event.at,
            operation: event.operation,
            error: event.error,
            attemptsAllowed: event.attemptsAllowed,
            attempt: event.attempt,
          }));

        const meanTimeBetweenFailures = computeMeanTimeBetweenFailures(events);
        const meanTimeToRecovery = computeMeanTimeToRecovery(events);
        const currentFailureStreak = computeCurrentFailureStreak(events);
        const lastFailureAt = failureEvents.at(-1)?.at;

        const { segments, totalsByState, transitions } = buildConnectionSummaryFromEvents(events, captureMs, since);
        let totalConnectionDuration = 0;
        for (const value of Object.values(totalsByState)) {
          totalConnectionDuration += value;
        }
        const uptimeRatio = totalConnectionDuration > 0 ? totalsByState.ready / totalConnectionDuration : null;

        return {
          capturedAt: new Date(captureMs).toISOString(),
          range: {
            since,
            until: events.at(-1)?.at,
            totalEvents: events.length,
          },
          operations: {
            total: totalOperations,
            success: totalSuccess,
            failure: totalFailure,
            successRate,
            failureRate,
            averageDurationMs: averageDuration != null ? Math.round(averageDuration) : null,
            p95DurationMs: p95Duration != null ? p95Duration : null,
            byOperation: operationsByOperation,
            daily,
            trends: {
              overall: overallTrend,
              byOperation: operationTrends,
            },
          },
          failures: {
            total: totalFailure,
            byOperation: failureCounts,
            byError: sortedFailureReasons,
            recent: recentFailures,
          },
          reliability: {
            meanTimeBetweenFailuresMs: meanTimeBetweenFailures,
            meanTimeToRecoveryMs: meanTimeToRecovery,
            currentFailureStreak,
            lastFailureAt,
          },
          connection: {
            transitions,
            totalsByState,
            uptimeRatio,
            segments,
          },
          rolling: {
            last7Days: rollingLast7Days,
            last30Days: rollingLast30Days,
          },
        };
      } catch {
        const emptyByOperation = createEmptyOperationMetrics();
        const fallbackCaptureMs = Date.now();
        return {
          capturedAt: new Date(fallbackCaptureMs).toISOString(),
          range: {
            since,
            until: undefined,
            totalEvents: 0,
          },
          operations: {
            total: 0,
            success: 0,
            failure: 0,
            successRate: 0,
            failureRate: 0,
            averageDurationMs: null,
            p95DurationMs: null,
            byOperation: emptyByOperation,
            daily: [],
            trends: {
              overall: createEmptyTrendEntry(),
              byOperation: createEmptyTrendMap(),
            },
          },
          failures: {
            total: 0,
            byOperation: createZeroCounters(),
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
            totalsByState: createStateTotals(),
            uptimeRatio: null,
            segments: [],
          },
          rolling: {
            last7Days: createEmptyRollingEntry(7, fallbackCaptureMs),
            last30Days: createEmptyRollingEntry(30, fallbackCaptureMs),
          },
        };
      }
    },
    close(): void {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    },
  };
}

export const diagnosticsEventStore = createDiagnosticsEventStore();
