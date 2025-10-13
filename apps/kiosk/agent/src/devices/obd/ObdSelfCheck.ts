// Локальная копия ObdSelfCheck (адаптирована без внешнего пакета)
import { setTimeout as sleep } from 'node:timers/promises';
import type { ObdDtc, ObdLiveData, ObdResult, ObdStatus } from './Elm327Driver.js';

export interface EdiagLike {
  readStatus(): Promise<ObdResult<ObdStatus>>;
  readLiveData(): Promise<ObdResult<ObdLiveData>>;
  readDTC(): Promise<ObdResult<ObdDtc[]>>;
  getMetrics(): any;
}

export interface ObdSelfCheckOptions { attempts?: number; delayMs?: number; onAttemptStart?: (attempt: number) => void | Promise<void>; onAttemptFinish?: (step: ObdSelfCheckStep) => void | Promise<void>; }
export interface ObdSelfCheckStep { attempt: number; startedAt: string; durationMs: number; dtc?: ObdDtc[]; status?: ObdStatus; liveData?: ObdLiveData; errors: string[]; protocolUsed?: string; }
export interface ObdSelfCheckReport { attemptsPlanned: number; attemptsPerformed: number; passes: number; fails: number; consistent: boolean; summary: string; steps: ObdSelfCheckStep[]; metrics: { rpm?: { min: number; max: number }; coolantTempC?: { min: number; max: number }; vehicleSpeedKmh?: { min: number; max: number }; protocolUsed?: string; }; }

export async function runObdSelfCheck(driver: EdiagLike, options: ObdSelfCheckOptions = {}): Promise<ObdSelfCheckReport> {
  const attempts = Math.max(1, options.attempts ?? 3); const delayMs = Math.max(0, options.delayMs ?? 500); const steps: ObdSelfCheckStep[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await options.onAttemptStart?.(attempt); const started = Date.now(); const step: ObdSelfCheckStep = { attempt, startedAt: new Date(started).toISOString(), durationMs: 0, errors: [] };
    try { const metrics = driver.getMetrics(); if (metrics?.protocolUsed) step.protocolUsed = metrics.protocolUsed; } catch {}
    try { const statusResult = await driver.readStatus(); assignResult(statusResult, step, 'status'); } catch (e) { step.errors.push(prettyError('status', e)); }
  try { const liveResult = await driver.readLiveData(); assignResult(liveResult, step, 'liveData'); } catch (e) { step.errors.push(prettyError('liveData', e)); }
    try { const dtcResult = await driver.readDTC(); assignResult(dtcResult, step, 'dtc'); } catch (e) { step.errors.push(prettyError('readDtc', e)); }
    step.durationMs = Date.now() - started; steps.push(step); await options.onAttemptFinish?.(step); if (attempt < attempts && delayMs > 0) await sleep(delayMs);
  }
  const passes = steps.filter(s => s.errors.length === 0).length; const fails = steps.length - passes; const consistent = determineConsistency(steps); const summary = `${attempts} attempts: ${passes} passed, ${fails} failed. Consistency: ${consistent ? 'OK' : 'MISMATCH'}`;
  return { attemptsPlanned: attempts, attemptsPerformed: steps.length, passes, fails, consistent, summary, steps, metrics: collectMetrics(steps) };
}
function assignResult(result: ObdResult<ObdDtc[] | ObdStatus | ObdLiveData>, step: ObdSelfCheckStep, field: 'dtc'|'status'|'liveData') { if (result.ok) { if (field === 'dtc') step.dtc = normalizeDtcList(result.data as ObdDtc[]); else if (field === 'status') step.status = result.data as ObdStatus; else step.liveData = result.data as ObdLiveData; } else { step.errors.push(`${field}: ${(result as { ok: false; error: string }).error}`); } }
function prettyError(context: string, error: unknown): string { if (typeof error === 'string') return `${context}: ${error}`; if (error instanceof Error) return `${context}: ${error.message}`; try { return `${context}: ${JSON.stringify(error)}`; } catch { return `${context}: unknown`; } }
function determineConsistency(steps: ObdSelfCheckStep[]): boolean { const successful = steps.filter(s => s.errors.length === 0); if (successful.length <= 1) return true; const baseline = serializeStep(successful[0]); return successful.every(s => serializeStep(s) === baseline); }
function serializeStep(step: ObdSelfCheckStep): string { return JSON.stringify({ status: step.status, liveData: step.liveData, dtc: step.dtc }); }
function normalizeDtcList(dtcs: ObdDtc[]): ObdDtc[] { return [...dtcs].map(d => ({ ...d, status: (d as any).status, code: d.code })).sort((a,b)=>a.code.localeCompare(b.code)); }
function collectMetrics(steps: ObdSelfCheckStep[]): ObdSelfCheckReport['metrics'] { const metrics: ObdSelfCheckReport['metrics'] = {}; const liveSamples = steps.filter(s => s.errors.length === 0 && s.liveData).map(s => s.liveData!); const track = (key: keyof ObdLiveData, target: keyof ObdSelfCheckReport['metrics']) => { const values = liveSamples.map(sample => sample[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); if (values.length) metrics[target] = { min: Math.min(...values), max: Math.max(...values) } as any; }; track('rpm','rpm'); track('coolantTemp','coolantTempC'); track('speed','vehicleSpeedKmh'); const successfulStep = steps.find(s => s.errors.length === 0 && s.protocolUsed); if (successfulStep?.protocolUsed) metrics.protocolUsed = successfulStep.protocolUsed; return metrics; }
export function selfCheckPassed(report: ObdSelfCheckReport): boolean { return report.passes > 0 && report.fails === 0 && report.consistent; }
