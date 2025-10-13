/**
 * Самопроверка толщиномера
 *
 * Последовательность проверок:
 * 1. Проверка BLE/SDK доступности
 * 2. Подключение к устройству (по MAC/UUID)
 * 3. Проверка батареи (если доступна)
 * 4. Чтение версии прошивки
 * 5. Тестовое измерение (калибровочный блок, если доступен)
 *
 * В DEV:
 * - Если устройство недоступно - возвращать "skipped"
 *
 * В PROD:
 * - Если устройство недоступно - возвращать "failed"
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export interface SelfCheckStep {
  name: string;
  status: 'success' | 'failure' | 'skipped';
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ThicknessSelfCheckResult {
  overallStatus: 'pass' | 'fail' | 'skipped';
  steps: SelfCheckStep[];
  deviceInfo?: {
    model?: string;
    firmwareVersion?: string;
    batteryLevel?: number;
    serialNumber?: string;
  };
  totalDuration: number;
  timestamp: Date;
  environment: 'DEV' | 'QA' | 'PROD';
}

let selfcheckMetrics: {
  total: Counter<'status'>;
  duration: Histogram;
  batteryLevel: Gauge;
} | null = null;

export function registerMetrics(registry: Registry) {
  if (selfcheckMetrics) return selfcheckMetrics;

  selfcheckMetrics = {
    total: new Counter({
      name: 'thickness_selfcheck_total',
      help: 'Total number of thickness gauge self-checks',
      labelNames: ['status'],
      registers: [registry],
    }),
    duration: new Histogram({
      name: 'thickness_selfcheck_duration_seconds',
      help: 'Duration of thickness gauge self-checks',
      buckets: [0.5, 1, 2, 5, 10],
      registers: [registry],
    }),
    batteryLevel: new Gauge({
      name: 'thickness_selfcheck_battery_level',
      help: 'Battery level of thickness gauge (0-100)',
      registers: [registry],
    }),
  };

  return selfcheckMetrics;
}

export async function runThicknessSelfCheck(): Promise<ThicknessSelfCheckResult> {
  const environment = (process.env.AGENT_ENV || 'DEV') as 'DEV' | 'QA' | 'PROD';
  const startTime = Date.now();
  const steps: SelfCheckStep[] = [];

  try {
    const bleStep = await checkBLEAvailability();
    steps.push(bleStep);

    if (bleStep.status === 'skipped') {
      const totalDuration = Date.now() - startTime;
      if (selfcheckMetrics) {
        selfcheckMetrics.total.labels('skipped').inc();
        selfcheckMetrics.duration.observe(totalDuration / 1000);
      }

      return {
        overallStatus: environment === 'PROD' ? 'fail' : 'skipped',
        steps,
        totalDuration,
        timestamp: new Date(),
        environment,
      };
    }

    if (bleStep.status === 'failure') {
      const totalDuration = Date.now() - startTime;
      if (selfcheckMetrics) {
        selfcheckMetrics.total.labels('fail').inc();
        selfcheckMetrics.duration.observe(totalDuration / 1000);
      }

      return {
        overallStatus: 'fail',
        steps,
        totalDuration,
        timestamp: new Date(),
        environment,
      };
    }

    const connectionStep = await checkDeviceConnection();
    steps.push(connectionStep);

    const batteryStep = await checkBattery();
    steps.push(batteryStep);

    if (batteryStep.details?.batteryLevel !== undefined && selfcheckMetrics) {
      selfcheckMetrics.batteryLevel.set(batteryStep.details.batteryLevel as number);
    }

    const firmwareStep = await checkFirmware();
    steps.push(firmwareStep);

    const calibrationStep = await checkCalibration();
    steps.push(calibrationStep);

    const failedSteps = steps.filter((s) => s.status === 'failure');
    const overallStatus = failedSteps.length > 0 ? 'fail' : 'pass';

    const deviceInfo: ThicknessSelfCheckResult['deviceInfo'] = {
      model: firmwareStep.details?.model as string | undefined,
      firmwareVersion: firmwareStep.details?.version as string | undefined,
      batteryLevel: batteryStep.details?.batteryLevel as number | undefined,
      serialNumber: connectionStep.details?.serialNumber as string | undefined,
    };

    const totalDuration = Date.now() - startTime;

    if (selfcheckMetrics) {
      selfcheckMetrics.total.labels(overallStatus).inc();
      selfcheckMetrics.duration.observe(totalDuration / 1000);
    }

    return {
      overallStatus,
      steps,
      deviceInfo,
      totalDuration,
      timestamp: new Date(),
      environment,
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    if (selfcheckMetrics) {
      selfcheckMetrics.total.labels('fail').inc();
      selfcheckMetrics.duration.observe(totalDuration / 1000);
    }

    steps.push({
      name: 'unexpected_error',
      status: 'failure',
      duration: 0,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      overallStatus: 'fail',
      steps,
      totalDuration,
      timestamp: new Date(),
      environment,
    };
  }
}

async function checkBLEAvailability(): Promise<SelfCheckStep> {
  const stepName = 'ble_availability';
  const startTime = Date.now();

  try {
    const isDevMode = process.env.AGENT_ENV !== 'PROD';

    if (isDevMode) {
      const duration = Date.now() - startTime;

      return {
        name: stepName,
        status: 'skipped',
        duration,
        details: { reason: 'DEV mode - BLE check skipped' },
      };
    }

    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: 'No real BLE implementation - requires hardware integration',
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDeviceConnection(): Promise<SelfCheckStep> {
  const stepName = 'device_connection';
  const startTime = Date.now();

  try {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'success',
      duration,
      details: { serialNumber: 'SIM-12345678' },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkBattery(): Promise<SelfCheckStep> {
  const stepName = 'battery';
  const startTime = Date.now();

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'success',
      duration,
      details: { batteryLevel: 85 },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkFirmware(): Promise<SelfCheckStep> {
  const stepName = 'firmware';
  const startTime = Date.now();

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'success',
      duration,
      details: { version: '1.2.3', model: 'TG-2000' },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkCalibration(): Promise<SelfCheckStep> {
  const stepName = 'calibration';
  const startTime = Date.now();

  try {
    await new Promise((resolve) => setTimeout(resolve, 150));

    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'success',
      duration,
      details: { measurement: 125, unit: 'µm', calibrationBlock: true },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      name: stepName,
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
