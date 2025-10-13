// Минимальный заглушечный менеджер диагностических операций
export type DiagnosticOperation = 'read_dtc' | 'clear_dtc' | 'read_status' | 'self_check' | 'status' | 'live_data';

interface DiagnosticTimelineEventBase { id: string; ts: number; type: 'operation' | 'state_change'; }
interface DiagnosticOperationEvent extends DiagnosticTimelineEventBase {
  type: 'operation';
  operation: DiagnosticOperation;
  phase?: 'begin' | 'retry';
  attempt?: number;
  totalAttempts?: number;
  summary?: unknown;
  error?: string;
  dtc?: any[];
  status?: any;
  live?: any;
  rawResult?: unknown;
  outcome?: 'success' | 'error';
}
interface DiagnosticStateChangeEvent extends DiagnosticTimelineEventBase {
  type: 'state_change';
  state: 'begin' | 'end';
  operation?: DiagnosticOperation;
  snapshotCaptured?: boolean;
}
type DiagnosticTimelineEvent = DiagnosticOperationEvent | DiagnosticStateChangeEvent;

interface DiagnosticSnapshot { active: boolean; op?: DiagnosticOperation; startedAt?: number; timeline: DiagnosticTimelineEvent[] }

interface RunOptions {
  attempts?: number;
  baseDelayMs?: number;
  captureSnapshot?: boolean;
  summarizeSuccess?: (value: unknown) => unknown;
  summarizeFailure?: (value: unknown) => unknown;
}

class DiagnosticSessionManagerImpl {
  private snap: DiagnosticSnapshot = { active: false, timeline: [] };
  private errors: Array<{ ts: number; error: string }> = [];
  private metrics = { operations: 0, errors: 0, successes: 0, lastOperationAt: 0 };
  private idCounter = 0;

  private nextId(): string { return `evt_${++this.idCounter}`; }

  private pushEvent(evt: Omit<DiagnosticOperationEvent, 'id' | 'ts'>): DiagnosticOperationEvent;
  private pushEvent(evt: Omit<DiagnosticStateChangeEvent, 'id' | 'ts'>): DiagnosticStateChangeEvent;
  private pushEvent(evt: any): any {
    const full = { ...evt, id: this.nextId(), ts: Date.now() } as DiagnosticTimelineEvent;
    this.snap.timeline.push(full);
    return full;
  }

  begin(op: DiagnosticOperation) {
    this.snap.active = true;
    this.snap.op = op;
    this.snap.startedAt = Date.now();
    this.metrics.operations++;
    this.metrics.lastOperationAt = Date.now();
    this.pushEvent({ type: 'state_change', state: 'begin', operation: op });
    this.pushEvent({ type: 'operation', operation: op, phase: 'begin', attempt: 1, totalAttempts: 1 });
    return { startedAt: this.snap.startedAt, op };
  }

  end() {
    const ended = this.snap.active;
    this.pushEvent({ type: 'state_change', state: 'end', operation: this.snap.op });
    this.snap.active = false;
    return { endedAt: Date.now(), wasActive: ended };
  }

  isActive() { return this.snap.active; }

  async runOperation(op: DiagnosticOperation, fn: () => Promise<any>, options?: RunOptions): Promise<any> {
    const attempts = Math.max(1, Math.min(10, options?.attempts ?? 1));
    const baseDelayMs = Math.max(0, Math.min(10_000, options?.baseDelayMs ?? 0));
    this.begin(op);
    let lastError: any = null;
    let result: any;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        this.pushEvent({ type: 'operation', operation: op, phase: 'retry', attempt, totalAttempts: attempts });
        if (baseDelayMs > 0) await new Promise(r => setTimeout(r, baseDelayMs * attempt));
      }
      try {
        result = await fn();
        if (options?.captureSnapshot) {
          this.pushEvent({ type: 'state_change', state: 'begin', operation: op, snapshotCaptured: true });
        }
        // Успех
        this.metrics.successes++;
        const summary = options?.summarizeSuccess ? options.summarizeSuccess(result) : undefined;
        let opEvt: Omit<DiagnosticOperationEvent, 'id' | 'ts'> = {
          type: 'operation',
          operation: op,
          outcome: 'success',
          attempt,
          totalAttempts: attempts,
          summary,
          rawResult: result,
        };
        if (result && typeof result === 'object' && (result as any).ok) {
          const data = (result as any).data;
          if (op === 'read_dtc' && Array.isArray(data)) {
            opEvt = { ...opEvt, dtc: data };
          }
          if (op === 'status' && data) {
            opEvt = { ...opEvt, status: data };
          }
          if (op === 'live_data' && data) {
            opEvt = { ...opEvt, live: data };
          }
        }
        this.pushEvent(opEvt);
        this.end();
        return result;
      } catch (e: any) {
        lastError = e;
        this.metrics.errors++;
        const errMsg = String(e?.message || e);
        this.errors.push({ ts: Date.now(), error: errMsg });
        const summary = options?.summarizeFailure ? options.summarizeFailure(e) : { error: errMsg };
        this.pushEvent({ type: 'operation', operation: op, outcome: 'error', attempt, totalAttempts: attempts, error: errMsg, summary });
        if (attempt === attempts) {
          this.end();
          throw e;
        }
      }
    }
    // Теоретически недостижимо
    this.end();
    return result;
  }

  getSnapshot(): DiagnosticSnapshot { return { ...this.snap, timeline: [...this.snap.timeline] }; }

  getTimeline(opts?: { limit?: number; newerThanId?: string }) {
    let items = this.snap.timeline;
    if (opts?.newerThanId) { const idx = items.findIndex(e => e.id === opts.newerThanId); if (idx >= 0) items = items.slice(idx + 1); }
    const l = opts?.limit || 200; return items.slice(-l);
  }

  getMetricsSnapshot() { return { ...this.metrics }; }
  getLatestEventId() { return this.snap.timeline.length ? this.snap.timeline[this.snap.timeline.length - 1].id : null; }
  getInsights(opts?: { recentFailures?: number; windowMs?: number }) {
    const recentFailures = typeof opts?.recentFailures === 'number' ? opts!.recentFailures : 0;
    const windowMs = typeof opts?.windowMs === 'number' ? opts!.windowMs : 0;
    const now = Date.now();
    const failuresWindow = windowMs > 0 ? this.snap.timeline.filter(e => e.type === 'operation' && e.outcome === 'error' && (now - e.ts) <= windowMs) : this.snap.timeline.filter(e => e.type === 'operation' && e.outcome === 'error');
    const recent = recentFailures > 0 ? failuresWindow.slice(-recentFailures) : failuresWindow;
    return {
      avgOps: this.metrics.operations,
      errorRate: this.metrics.operations > 0 ? this.metrics.errors / this.metrics.operations : 0,
      recentErrors: recent.map(e => ({ id: e.id, at: e.ts, operation: (e as any).operation, error: (e as any).error })),
    };
  }
  getHistoricalSummary(_opts?: any) { return { totalOps: this.metrics.operations, totalErrors: this.metrics.errors, successes: this.metrics.successes }; }
  acknowledgeError() { this.errors = []; }
}

export const diagnosticSessionManager = new DiagnosticSessionManagerImpl();
