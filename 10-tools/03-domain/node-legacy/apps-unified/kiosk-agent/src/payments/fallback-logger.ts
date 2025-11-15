import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PaymentIntent, PaymentStatus } from '@selfservice/payments';

export type AgentEnv = 'DEV' | 'QA' | 'PROD';

export interface ManualConfirmationLogContext {
  intent: PaymentIntent;
  operatorId: string;
  note?: string;
  meta?: Record<string, unknown>;
  environment: AgentEnv;
}

export interface ManualConfirmationLogEntry {
  id: string;
  intentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  operatorId: string;
  note?: string;
  meta?: Record<string, unknown>;
  environment: AgentEnv;
  occurredAt: string;
}

const DEFAULT_FILE_NAME = 'payments-fallback.log';

export class PaymentsFallbackLogger {
  private readonly logDir: string;
  private readonly logFilePath: string;
  private isReady = false;

  constructor(options: { logDir?: string; fileName?: string } = {}) {
    const baseDir = options.logDir ?? process.env.PAYMENTS_FALLBACK_LOG_DIR ?? path.resolve(process.cwd(), 'artifacts/logs');
    this.logDir = baseDir;
    this.logFilePath = path.join(baseDir, options.fileName ?? DEFAULT_FILE_NAME);
  }

  async appendManualConfirmation(context: ManualConfirmationLogContext): Promise<void> {
    await this.ensureDirectory();
    const entry: ManualConfirmationLogEntry = {
      id: randomUUID(),
      intentId: context.intent.id,
      status: context.intent.status,
      amount: context.intent.amount,
      currency: context.intent.currency,
      operatorId: context.operatorId,
      note: context.note,
      meta: context.meta,
      environment: context.environment,
      occurredAt: new Date().toISOString(),
    };
    await appendFile(this.logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  get filePath(): string {
    return this.logFilePath;
  }

  private async ensureDirectory(): Promise<void> {
    if (this.isReady) return;
    await mkdir(this.logDir, { recursive: true });
    this.isReady = true;
  }
}
