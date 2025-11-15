import { setTimeout as sleep } from 'node:timers/promises';
import type { KingbolenEdiagDriver, ObdDtc, ObdLiveData, ObdResult, ObdStatus } from '@selfservice/obd-diagnostics';

export type EdiagLike = Pick<KingbolenEdiagDriver, 'readStatus' | 'readLiveData' | 'readDTC' | 'getMetrics'>;

export interface ObdSelfCheckOptions {
  /** Number of iterations to run. Defaults to 3. */
  attempts?: number;
  /** Delay between iterations in milliseconds. Defaults to 500ms. */
  delayMs?: number;
  /** Callback invoked before every attempt. */
  onAttemptStart?: (attempt: number) => void | Promise<void>;
  /** Callback invoked after every attempt with the step payload. */
  onAttemptFinish?: (step: ObdSelfCheckStep) => void | Promise<void>;
}

export interface ObdSelfCheckStep {
  attempt: number;
  startedAt: string;
  durationMs: number;
  dtc?: ObdDtc[];
  status?: ObdStatus;
  liveData?: ObdLiveData;
  errors: string[];
  protocolUsed?: string;
}

export interface ObdSelfCheckReport {
  attemptsPlanned: number;
  attemptsPerformed: number;
  passes: number;
  fails: number;
  consistent: boolean;
  summary: string;
  steps: ObdSelfCheckStep[];
  /** Optional aggregated metrics like max/min RPM for quick glance. */
  metrics: {
    rpm?: { min: number; max: number };
    coolantTempC?: { min: number; max: number };
    vehicleSpeedKmh?: { min: number; max: number };
    protocolUsed?: string;
  };
}

export async function runObdSelfCheck(
  driver: EdiagLike,
  options: ObdSelfCheckOptions = {},
): Promise<ObdSelfCheckReport> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 500);
  const steps: ObdSelfCheckStep[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await options.onAttemptStart?.(attempt);
    const started = Date.now();
    const step: ObdSelfCheckStep = {
      attempt,
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      errors: [],
    };

    // Захватываем информацию о протоколе из метрик драйвера
    try {
      const metrics = driver.getMetrics();
      if (metrics.protocolUsed) {
        step.protocolUsed = metrics.protocolUsed;
      }
    } catch {
      // Игнорируем ошибки получения метрик
    }

    try {
      const statusResult = await driver.readStatus();
      assignResult(statusResult, step, 'status');
    } catch (error) {
      step.errors.push(prettyError('status', error));
    }

    try {
      const liveResult = await driver.readLiveData();
      assignResult(liveResult, step, 'liveData');
    } catch (error) {
      step.errors.push(prettyError('liveData', error));
    }

    try {
      const dtcResult = await driver.readDTC();
      assignResult(dtcResult, step, 'dtc');
    } catch (error) {
      step.errors.push(prettyError('readDtc', error));
    }

    step.durationMs = Date.now() - started;
    steps.push(step);
    await options.onAttemptFinish?.(step);

    if (attempt < attempts && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const passes = steps.filter((s) => s.errors.length === 0).length;
  const fails = steps.length - passes;
  const consistent = determineConsistency(steps);

  const summary = `${attempts} attempts: ${passes} passed, ${fails} failed. Consistency: ${consistent ? 'OK' : 'MISMATCH'}`;

  return {
    attemptsPlanned: attempts,
    attemptsPerformed: steps.length,
    passes,
    fails,
    consistent,
    summary,
    steps,
    metrics: collectMetrics(steps),
  };
}

function assignResult(
  result: ObdResult<ObdDtc[] | ObdStatus | ObdLiveData>,
  step: ObdSelfCheckStep,
  field: 'dtc' | 'status' | 'liveData',
) {
  if (result.ok) {
    if (field === 'dtc') {
      step.dtc = normalizeDtcList(result.data as ObdDtc[]);
    } else if (field === 'status') {
      step.status = result.data as ObdStatus;
    } else {
      step.liveData = result.data as ObdLiveData;
    }
  } else {
    step.errors.push(`${field}: ${(result as { ok: false; error: string }).error}`);
  }
}

function prettyError(context: string, error: unknown): string {
  if (typeof error === 'string') return `${context}: ${error}`;
  if (error instanceof Error) return `${context}: ${error.message}`;
  return `${context}: ${JSON.stringify(error)}`;
}

function determineConsistency(steps: ObdSelfCheckStep[]): boolean {
  const successful = steps.filter((s) => s.errors.length === 0);
  if (successful.length <= 1) return true;
  const serializedBaseline = serializeStep(successful[0]);
  return successful.every((step) => serializeStep(step) === serializedBaseline);
}

function serializeStep(step: ObdSelfCheckStep): string {
  const payload = {
    status: step.status,
    liveData: step.liveData,
    dtc: step.dtc,
  };
  return JSON.stringify(payload);
}

function normalizeDtcList(dtcs: ObdDtc[]): ObdDtc[] {
  return [...dtcs]
    .map((d) => ({
      ...d,
      status: d.status,
      code: d.code,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function collectMetrics(steps: ObdSelfCheckStep[]): ObdSelfCheckReport['metrics'] {
  const metrics: ObdSelfCheckReport['metrics'] = {};

  const liveSamples = steps
    .filter((s) => s.errors.length === 0 && s.liveData)
    .map((s) => s.liveData!) as ObdLiveData[];

  const track = (
    key: keyof ObdLiveData,
    target: keyof ObdSelfCheckReport['metrics'],
  ) => {
    const values = liveSamples
      .map((sample) => sample[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length) {
      metrics[target] = {
        min: Math.min(...values),
        max: Math.max(...values),
      } as any;
    }
  };

  track('rpm', 'rpm');
  track('coolantTemp', 'coolantTempC');
  track('speed', 'vehicleSpeedKmh');

  // Добавляем информацию о протоколе из первого успешного шага
  const successfulStep = steps.find((s) => s.errors.length === 0 && s.protocolUsed);
  if (successfulStep?.protocolUsed) {
    metrics.protocolUsed = successfulStep.protocolUsed;
  }

  return metrics;
}

export function selfCheckPassed(report: ObdSelfCheckReport): boolean {
  return report.passes > 0 && report.fails === 0 && report.consistent;
}
