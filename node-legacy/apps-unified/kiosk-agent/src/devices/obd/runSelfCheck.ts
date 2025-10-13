#!/usr/bin/env node
import { argv, exit } from 'node:process';
import { KingbolenEdiagDriver } from '@selfservice/obd-diagnostics';
import { runObdSelfCheck, selfCheckPassed, type ObdSelfCheckReport } from './ObdSelfCheck.js';
import { SelfCheckLogger, buildObdSelfCheckEntry, type SelfCheckOrigin } from '../../selfcheck/index.js';

async function main() {
  const [, , ...rest] = argv;
  const args = parseArgs(rest);

  // Для BLE keep-alive на уровне драйвера не требуется
  const keepAliveMs = 0;
  let driver: KingbolenEdiagDriver | undefined;
  let adapterIdentity: string | undefined;

  try {
    // BLE-подключение (сканирование по имени)
    driver = new KingbolenEdiagDriver({ deviceName: process.env.EDIAG_DEVICE_NAME || 'KINGBOLEN' });
    console.log('[self-check] Connecting to KINGBOLEN Ediag via BLE…');
    const ok = await driver.connect();
    if (!ok) throw new Error('BLE connect returned false');
    try {
      adapterIdentity = await driver.identify();
      console.log(`[self-check] Adapter identity: ${adapterIdentity}`);
    } catch (identifyError) {
      const message = identifyError instanceof Error ? identifyError.message : String(identifyError);
      console.warn(`[self-check] Unable to identify adapter: ${message}`);
    }

    if (!driver) {
      throw new Error('Driver initialisation failed (no adapter available).');
    }

    const startedAt = new Date();
    const report = await runObdSelfCheck(driver, {
      attempts: args.attempts,
      delayMs: args.delayMs,
      onAttemptStart: (attempt) => console.log(`[self-check] Attempt ${attempt}…`),
      onAttemptFinish: (step) => {
        if (step.errors.length) {
          console.warn(`[self-check] Attempt ${step.attempt} failed: ${step.errors.join('; ')}`);
        } else {
          console.log(`[self-check] Attempt ${step.attempt} passed in ${step.durationMs}ms`);
        }
      },
    });

    console.log('[self-check] Summary:', report.summary);
    if (report.metrics.rpm) {
      console.log('[self-check] RPM range:', report.metrics.rpm);
    }
    if (report.metrics.coolantTempC) {
      console.log('[self-check] Coolant range:', report.metrics.coolantTempC);
    }

    const completedAt = new Date();
    await appendSelfCheckLog(report, {
  port: 'BLE',
      baudRate: args.baudRate,
      attempts: args.attempts,
      delayMs: args.delayMs,
      origin: args.origin,
      logDir: args.logDir,
      startedAt,
      completedAt,
      keepAliveMs,
      adapterIdentity,
    });

    if (!selfCheckPassed(report)) {
      console.warn('[self-check] Diagnostic self-check did not pass. Inspect logs above.');
      exit(2);
    }
  } catch (error) {
    console.error('[self-check] Fatal error:', error instanceof Error ? error.message : error);
    exit(3);
  } finally {
    if (driver) {
      try {
        await driver.disconnect();
      } catch (error) {
        console.error('[self-check] Failed to disconnect cleanly:', error);
      }
    }
  }
}

function parseArgs(tokens: string[]) {
  const args: {
    port?: string;
    attempts?: number;
    delayMs?: number;
    baudRate?: number;
    origin?: string;
    logDir?: string;
    keepAliveMs?: number;
  } = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token) {
      case '--port':
      case '-p':
        args.port = tokens[++i];
        break;
      case '--attempts':
      case '-n':
        args.attempts = Number(tokens[++i]);
        break;
      case '--delay':
      case '-d':
        args.delayMs = Number(tokens[++i]);
        break;
      case '--baud':
        args.baudRate = Number(tokens[++i]);
        break;
      case '--origin':
        args.origin = tokens[++i];
        break;
      case '--log-dir':
        args.logDir = tokens[++i];
        break;
      case '--keep-alive':
      case '--keep-alive-ms':
        args.keepAliveMs = Number(tokens[++i]);
        break;
      default:
        break;
    }
  }

  if (args.attempts !== undefined && !Number.isFinite(args.attempts)) {
    delete args.attempts;
  }
  if (args.delayMs !== undefined && !Number.isFinite(args.delayMs)) {
    delete args.delayMs;
  }
  if (args.baudRate !== undefined && !Number.isFinite(args.baudRate)) {
    delete args.baudRate;
  }
  if (args.keepAliveMs !== undefined && !Number.isFinite(args.keepAliveMs)) {
    delete args.keepAliveMs;
  }

  return args;
}

async function appendSelfCheckLog(
  report: ObdSelfCheckReport,
  options: {
  port: string;
    baudRate?: number;
    attempts?: number;
    delayMs?: number;
    origin?: string;
    logDir?: string;
    startedAt: Date;
    completedAt: Date;
    keepAliveMs: number;
    adapterIdentity?: string;
  },
): Promise<void> {
  const logger = new SelfCheckLogger(options.logDir ? { logDir: options.logDir } : undefined);
  const entry = buildObdSelfCheckEntry(report, {
    environment: normalizeEnvironment(process.env.AGENT_ENV),
    origin: normalizeOrigin(options.origin),
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    portPath: options.port,
    baudRate: options.baudRate,
    attempts: options.attempts,
    delayMs: options.delayMs,
    metadata: {
      requestSource: 'cli/devices/obd/runSelfCheck',
      keepAliveMs: options.keepAliveMs,
      adapterIdentity: options.adapterIdentity,
    },
  });

  try {
    const filePath = await logger.append(entry);
    console.log(`[self-check] Log entry recorded (${entry.id}) -> ${filePath}`);
  } catch (error) {
    console.error('[self-check] Failed to persist log entry:', error);
  }
}

function normalizeEnvironment(value: unknown): 'DEV' | 'QA' | 'PROD' {
  if (value === 'QA' || value === 'PROD' || value === 'DEV') return value;
  return 'DEV';
}

function normalizeOrigin(value: unknown): SelfCheckOrigin {
  if (value === 'scheduled' || value === 'automatic') {
    return value;
  }
  return 'manual';
}

main();
