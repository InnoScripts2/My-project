import path from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
const DEFAULT_FILE_NAME = 'self-check.log.jsonl';
export class SelfCheckLogger {
    constructor(options = {}) {
        this.isReady = false;
        const baseDir = options.logDir ?? process.env.SELF_CHECK_LOG_DIR ?? path.resolve(process.cwd(), 'artifacts/logs/selfcheck');
        this.logDir = baseDir;
        this.logFilePath = path.join(baseDir, options.fileName ?? DEFAULT_FILE_NAME);
    }
    async append(entry) {
        await this.ensureDirectory();
        const payload = `${JSON.stringify(entry)}\n`;
        await appendFile(this.logFilePath, payload, 'utf8');
        return this.logFilePath;
    }
    async ensureDirectory() {
        if (this.isReady)
            return;
        await mkdir(this.logDir, { recursive: true });
        this.isReady = true;
    }
    get filePath() {
        return this.logFilePath;
    }
}
