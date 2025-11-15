import path from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
import { SelfCheckLogEntry } from './types.js';

export interface SelfCheckLoggerOptions {
  /** Directory where JSONL log will be stored. Defaults to artifacts/logs/selfcheck relative to project root. */
  logDir?: string;
  /** File name (with extension). Defaults to self-check.log.jsonl. */
  fileName?: string;
}

const DEFAULT_FILE_NAME = 'self-check.log.jsonl';

export class SelfCheckLogger {
  private readonly logDir: string;
  private readonly logFilePath: string;
  private isReady = false;

  constructor(options: SelfCheckLoggerOptions = {}) {
    const baseDir = options.logDir ?? process.env.SELF_CHECK_LOG_DIR ?? path.resolve(process.cwd(), 'artifacts/logs/selfcheck');
    this.logDir = baseDir;
    this.logFilePath = path.join(baseDir, options.fileName ?? DEFAULT_FILE_NAME);
  }

  async append(entry: SelfCheckLogEntry): Promise<string> {
    await this.ensureDirectory();
    const payload = `${JSON.stringify(entry)}\n`;
    await appendFile(this.logFilePath, payload, 'utf8');
    return this.logFilePath;
  }

  private async ensureDirectory(): Promise<void> {
    if (this.isReady) return;
    await mkdir(this.logDir, { recursive: true });
    this.isReady = true;
  }

  get filePath(): string {
    return this.logFilePath;
  }
}
