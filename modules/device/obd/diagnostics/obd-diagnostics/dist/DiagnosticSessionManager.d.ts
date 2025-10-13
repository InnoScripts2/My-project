import { type ObdConnectionSnapshot } from './ObdConnectionManager.js';
import type { DiagnosticsEventStore, DiagnosticsEventStoreSummary, DiagnosticsEventStoreSummarizeOptions } from '../../storage/sqlite/diagnosticsEventStore.js';
export type DiagnosticState = 'disconnected' | 'connecting' | 'authenticating' | 'ready' | 'reading' | 'clearing' | 'error';
export type DiagnosticOperation = 'read_dtc' | 'live_data' | 'status' | 'self_check' | 'clear_dtc';
export type DiagnosticOperationOutcome = 'success' | 'failure';
export interface DiagnosticOperationEvent {
    id: string;
    type: 'operation';
    at: string;
    operation: DiagnosticOperation;
    outcome: DiagnosticOperationOutcome;
    attempt: number;
    attemptsAllowed: number;
    durationMs: number;
    summary?: unknown;
    error?: string;
    connection?: DiagnosticConnectionSummary;
}
export interface DiagnosticStateChangeEvent {
    id: string;
    type: 'state_change';
    at: string;
    state: DiagnosticState;
    previousState: DiagnosticState;
    reason?: string;
    reconnectAttempts: number;
    connection?: DiagnosticConnectionSummary;
}
export type DiagnosticTimelineEvent = DiagnosticOperationEvent | DiagnosticStateChangeEvent;
export interface DiagnosticConnectionSummary {
    state: ObdConnectionSnapshot['state'];
    transport?: ObdConnectionSnapshot['transport'];
    identity?: string;
    bluetoothName?: string;
    lastConnectedAt?: string;
    lastError?: string;
}
export interface DiagnosticStateSnapshot {
    state: DiagnosticState;
    activeOperation?: {
        name: DiagnosticOperation;
        startedAt: string;
        attempt: number;
        maxAttempts: number;
    } | null;
    lastError?: {
        message: string;
        at: string;
        operation?: DiagnosticOperation;
    } | null;
    lastUpdatedAt: string;
    history: Array<{
        state: DiagnosticState;
        at: string;
        reason?: string;
    }>;
    reconnectAttempts: number;
    connection?: ObdConnectionSnapshot;
    timeline: DiagnosticTimelineEvent[];
    metrics: DiagnosticMetrics;
}
export interface DiagnosticEventRecorder extends DiagnosticsEventStore {
}
interface OperationOptions<T> {
    attempts?: number;
    baseDelayMs?: number;
    captureSnapshot?: boolean;
    summarizeSuccess?: (result: T) => unknown;
    summarizeFailure?: (error: unknown) => unknown;
}
type Listener = (snapshot: DiagnosticStateSnapshot) => void;
export interface DiagnosticMetrics {
    operations: {
        total: number;
        success: number;
        failure: number;
        byOperation: Record<DiagnosticOperation, {
            success: number;
            failure: number;
            averageDurationMs: number;
        }>;
    };
    lastOperation?: Pick<DiagnosticOperationEvent, 'operation' | 'outcome' | 'durationMs' | 'at' | 'attempt'> & {
        summary?: unknown;
        error?: string;
    };
}
export interface DiagnosticInsights {
    capturedAt: string;
    operations: {
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
            averageDurationMs: number;
        }>;
    };
    failures: {
        recent: Array<{
            id: string;
            at: string;
            operation: DiagnosticOperation;
            attempt: number;
            attemptsAllowed: number;
            error?: string;
            summary?: unknown;
        }>;
        byOperation: Record<DiagnosticOperation, number>;
        byError: Array<{
            error: string;
            count: number;
        }>;
    };
    connection: {
        state: DiagnosticState;
        lastUpdatedAt: string;
        transitions: number;
        totalsByState: Record<DiagnosticState, number>;
        segments: Array<{
            state: DiagnosticState;
            since: string;
            until: string;
            durationMs: number;
        }>;
    };
    timeline: {
        totalEvents: number;
        windowStart?: string;
    };
    reliability: {
        meanTimeBetweenFailuresMs: number | null;
        meanTimeToRecoveryMs: number | null;
        uptimeRatio: number | null;
        currentFailureStreak: number;
        lastFailureAt?: string;
    };
}
export declare class DiagnosticSessionManager {
    private state;
    private readonly listeners;
    private readonly history;
    private lastError;
    private activeOperation;
    private lastUpdatedAt;
    private reconnectAttempts;
    private latestConnection?;
    private readonly timeline;
    private readonly operationStats;
    private lastOperationEvent?;
    private eventCounter;
    private readonly eventStore;
    private readonly disposeConnectionListener;
    constructor(connectionManager?: import("./ObdConnectionManager.js").ObdConnectionManager, eventStore?: DiagnosticsEventStore);
    getSnapshot(): DiagnosticStateSnapshot;
    getTimeline(options?: {
        newerThanId?: string;
        limit?: number;
    }): DiagnosticTimelineEvent[];
    getMetricsSnapshot(): DiagnosticMetrics;
    getLatestEventId(): string | undefined;
    getInsights(options?: {
        recentFailures?: number;
        windowMs?: number;
    }): DiagnosticInsights;
    getHistoricalSummary(options?: DiagnosticsEventStoreSummarizeOptions): DiagnosticsEventStoreSummary | null;
    addListener(listener: Listener): () => void;
    dispose(): void;
    runOperation<T>(operation: DiagnosticOperation, task: () => Promise<T>, options?: OperationOptions<T>): Promise<T>;
    acknowledgeError(): void;
    private startOperation;
    private updateActiveOperationAttempt;
    private finishOperation;
    private registerFailure;
    private syncWithConnectionSnapshot;
    private transition;
    private cloneTimeline;
    private cloneEvent;
    private buildConnectionSegments;
    private buildMetrics;
    private recordTimelineEvent;
    private nextEventId;
    private buildConnectionSummary;
    private notifyListeners;
    private persistEvent;
}
export declare const diagnosticSessionManager: DiagnosticSessionManager;
export {};
