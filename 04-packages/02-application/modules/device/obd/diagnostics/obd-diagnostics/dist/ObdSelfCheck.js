import { setTimeout as sleep } from 'node:timers/promises';
export async function runObdSelfCheck(driver, options = {}) {
    const attempts = Math.max(1, options.attempts ?? 3);
    const delayMs = Math.max(0, options.delayMs ?? 500);
    const steps = [];
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await options.onAttemptStart?.(attempt);
        const started = Date.now();
        const step = {
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
        }
        catch {
            // Игнорируем ошибки получения метрик
        }
        try {
            const statusResult = await driver.readStatus();
            assignResult(statusResult, step, 'status');
        }
        catch (error) {
            step.errors.push(prettyError('status', error));
        }
        try {
            const liveResult = await driver.readLiveData();
            assignResult(liveResult, step, 'liveData');
        }
        catch (error) {
            step.errors.push(prettyError('liveData', error));
        }
        try {
            const dtcResult = await driver.readDTC();
            assignResult(dtcResult, step, 'dtc');
        }
        catch (error) {
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
function assignResult(result, step, field) {
    if (result.ok) {
        if (field === 'dtc') {
            step.dtc = normalizeDtcList(result.data);
        }
        else if (field === 'status') {
            step.status = result.data;
        }
        else {
            step.liveData = result.data;
        }
    }
    else {
        step.errors.push(`${field}: ${result.error}`);
    }
}
function prettyError(context, error) {
    if (typeof error === 'string')
        return `${context}: ${error}`;
    if (error instanceof Error)
        return `${context}: ${error.message}`;
    return `${context}: ${JSON.stringify(error)}`;
}
function determineConsistency(steps) {
    const successful = steps.filter((s) => s.errors.length === 0);
    if (successful.length <= 1)
        return true;
    const serializedBaseline = serializeStep(successful[0]);
    return successful.every((step) => serializeStep(step) === serializedBaseline);
}
function serializeStep(step) {
    const payload = {
        status: step.status,
        liveData: step.liveData,
        dtc: step.dtc,
    };
    return JSON.stringify(payload);
}
function normalizeDtcList(dtcs) {
    return [...dtcs]
        .map((d) => ({
        ...d,
        status: d.status,
        code: d.code,
    }))
        .sort((a, b) => a.code.localeCompare(b.code));
}
function collectMetrics(steps) {
    const metrics = {};
    const liveSamples = steps
        .filter((s) => s.errors.length === 0 && s.liveData)
        .map((s) => s.liveData);
    const track = (key, target) => {
        const values = liveSamples
            .map((sample) => sample[key])
            .filter((v) => typeof v === 'number' && Number.isFinite(v));
        if (values.length) {
            metrics[target] = {
                min: Math.min(...values),
                max: Math.max(...values),
            };
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
export function selfCheckPassed(report) {
    return report.passes > 0 && report.fails === 0 && report.consistent;
}
