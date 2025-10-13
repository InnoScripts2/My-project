import { selfCheckPassed } from '../devices/obd/ObdSelfCheck.js';
import { generateSelfCheckId } from './types.js';
export function buildObdSelfCheckEntry(report, context = {}) {
    const status = determineOutcome(report);
    const startedAtIso = resolveIso(context.startedAt) ?? findFirstStart(report);
    const completedAtIso = resolveIso(context.completedAt) ?? computeCompletedAt(report, startedAtIso);
    const durationMs = computeDurationMs(startedAtIso, completedAtIso, report);
    const result = {
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
        protocolProfile: context.protocolProfile ?? null,
        protocolUsed: context.protocolUsed ?? report.metrics.protocolUsed ?? null,
        ...context.metadata,
    };
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
function determineOutcome(report) {
    if (selfCheckPassed(report))
        return 'passed';
    if (report.passes > 0)
        return 'warning';
    return 'failed';
}
function resolveIso(value) {
    if (!value)
        return undefined;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string')
        return new Date(value).toISOString();
    return undefined;
}
function findFirstStart(report) {
    const first = report.steps[0];
    return first?.startedAt ?? new Date().toISOString();
}
function computeCompletedAt(report, fallbackStart) {
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
function computeDurationMs(startIso, endIso, report) {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        return end - start;
    }
    // Fallback to sum of step durations
    return report.steps.reduce((acc, step) => acc + (step.durationMs ?? 0), 0);
}
function collectDistinct(values) {
    const filtered = values.map((value) => value.trim()).filter((value) => value.length > 0);
    if (filtered.length === 0)
        return undefined;
    return Array.from(new Set(filtered));
}
