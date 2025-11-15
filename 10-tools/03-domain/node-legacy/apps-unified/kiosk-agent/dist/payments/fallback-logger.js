import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const DEFAULT_FILE_NAME = 'payments-fallback.log';
export class PaymentsFallbackLogger {
    constructor(options = {}) {
        this.isReady = false;
        const baseDir = options.logDir ?? process.env.PAYMENTS_FALLBACK_LOG_DIR ?? path.resolve(process.cwd(), 'artifacts/logs');
        this.logDir = baseDir;
        this.logFilePath = path.join(baseDir, options.fileName ?? DEFAULT_FILE_NAME);
    }
    async appendManualConfirmation(context) {
        await this.ensureDirectory();
        const entry = {
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
    get filePath() {
        return this.logFilePath;
    }
    async ensureDirectory() {
        if (this.isReady)
            return;
        await mkdir(this.logDir, { recursive: true });
        this.isReady = true;
    }
}
