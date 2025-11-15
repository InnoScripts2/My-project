import { selfCheckPassed, type ObdSelfCheckReport } from '../devices/obd/ObdSelfCheck.js';

export interface ObdLogContext {
  portPath?: string | null;
  baudRate?: number;
  attempts?: number;
  delayMs?: number;
  transport?: 'serial' | 'bluetooth';
  bluetoothAddress?: string | null;
  bluetoothName?: string | null;
  bluetoothChannel?: number;
  adapterIdentity?: string | null;
  origin?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
  id?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  notes?: string;
}

export interface SelfCheckComponentResult { component: string; status: SelfCheckOutcome; summary: string; durationMs: number; attempts: number; metrics?: any; errors?: string[]; warnings?: string[]; }
export interface SelfCheckLogEntry { id: string; startedAt: string; completedAt: string; durationMs: number; status: SelfCheckOutcome; environment: string; origin: string; results: SelfCheckComponentResult[]; metadata: Record<string, unknown>; notes?: string; }
export type SelfCheckOutcome = 'passed' | 'warning' | 'failed';
function generateSelfCheckId(prefix: string): string { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
export function buildObdSelfCheckEntry(report: ObdSelfCheckReport, context: ObdLogContext = {}): SelfCheckLogEntry {
  const status = determineOutcome(report);
  const startedAtIso = resolveIso(context.startedAt) ?? findFirstStart(report);
  const completedAtIso = resolveIso(context.completedAt) ?? computeCompletedAt(report, startedAtIso);
  const durationMs = computeDurationMs(startedAtIso, completedAtIso, report);

  const result: SelfCheckComponentResult = {
    component: 'obd',
    status,
    summary: report.summary,
    durationMs,
    attempts: report.attemptsPerformed,
    metrics: report.metrics,
    errors: collectDistinct(report.steps.flatMap((step) => step.errors)),
    warnings: report.consistent ? undefined : ['Inconsistent readings between attempts'],
  };

  const metadata = {
    attemptsPlanned: report.attemptsPlanned,
    attemptsPerformed: report.attemptsPerformed,
    portPath: context.portPath ?? null,
    baudRate: context.baudRate,
    delayMs: context.delayMs,
    requestedAttempts: context.attempts,
    transport: context.transport ?? null,
    bluetoothAddress: context.bluetoothAddress ?? null,
    bluetoothName: context.bluetoothName ?? null,
    bluetoothChannel: context.bluetoothChannel,
    adapterIdentity: context.adapterIdentity ?? null,
    ...context.metadata,
  } satisfies Record<string, unknown>;

  return {
    id: context.id ?? generateSelfCheckId('obd'),
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationMs,
    status,
    environment: context.environment ?? 'DEV',
    origin: context.origin ?? 'manual',
    results: [result],
    metadata,
    notes: context.notes,
  };
}

function determineOutcome(report: ObdSelfCheckReport): SelfCheckOutcome {
  if (selfCheckPassed(report)) return 'passed';
  if (report.passes > 0) return 'warning';
  return 'failed';
}

function resolveIso(value?: Date | string): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return undefined;
}

function findFirstStart(report: ObdSelfCheckReport): string {
  const first = report.steps[0];
  return first?.startedAt ?? new Date().toISOString();
}

function computeCompletedAt(report: ObdSelfCheckReport, fallbackStart: string): string {
  let latest = new Date(fallbackStart).getTime();
  for (const step of report.steps) {
    const started = new Date(step.startedAt).getTime();
    const finished = started + step.durationMs;
    if (finished > latest) {
      latest = finished;
    }
  }
  return new Date(latest).toISOString();
}

function computeDurationMs(startIso: string, endIso: string, report: ObdSelfCheckReport): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return end - start;
  }
  // Fallback to sum of step durations
  return report.steps.reduce((acc, step) => acc + (step.durationMs ?? 0), 0);
}

function collectDistinct(values: string[]): string[] | undefined {
  const filtered = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (filtered.length === 0) return undefined;
  return Array.from(new Set(filtered));
}
