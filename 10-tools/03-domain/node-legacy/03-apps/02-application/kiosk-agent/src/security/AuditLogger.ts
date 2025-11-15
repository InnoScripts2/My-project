/**
 * AuditLogger Module
 * 
 * Manages append-only audit logs:
 * - Event logging in JSONL format
 * - Query and filter logs
 * - Export logs (JSON/CSV)
 * - Retention management (90 days)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createInterface } from 'readline';
import { v4 as uuidv4 } from 'uuid';
import type {
  AuditLogEntry,
  AuditFilter,
  AuditCategory,
  AuditResult,
} from './types.js';

export class AuditLogger {
  private logsDir: string;
  private retentionDays: number;
  private testMode: boolean;

  constructor(logsDir?: string, retentionDays?: number) {
    this.logsDir = logsDir || process.env.AUDIT_LOG_DIR || '/var/log/kiosk/audit';
    this.retentionDays = retentionDays || parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
    this.testMode = this.logsDir.includes('/tmp') || process.env.NODE_ENV === 'test';
  }

  async logEvent(
    category: AuditCategory,
    action: string,
    userId: string,
    details: Record<string, unknown>,
    sourceIp?: string,
    result: AuditResult = 'success',
    errorMessage?: string
  ): Promise<void> {
    const entry: AuditLogEntry = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      category,
      action,
      userId,
      details,
      sourceIp,
      result,
      errorMessage,
    };

    const currentMonth = new Date().toISOString().slice(0, 7);
    const logFile = path.join(this.logsDir, `audit-${currentMonth}.log`);

    try {
      await fs.mkdir(this.logsDir, { recursive: true });

      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(logFile, logLine, 'utf-8');

      if (process.platform !== 'win32' && !this.testMode) {
        try {
          await fs.chmod(logFile, 0o400);
        } catch {
          // Ignore chmod errors in test mode
        }
      }
    } catch (error: unknown) {
      console.error(
        `Failed to write audit log: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async queryLogs(filter: AuditFilter): Promise<AuditLogEntry[]> {
    const results: AuditLogEntry[] = [];

    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files
        .filter((f) => f.startsWith('audit-') && f.endsWith('.log'))
        .map((f) => path.join(this.logsDir, f));

      for (const file of logFiles) {
        const entries = await this.readLogFile(file, filter);
        results.push(...entries);
      }

      results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return results;
    } catch (error: unknown) {
      console.error(
        `Failed to query logs: ${error instanceof Error ? error.message : String(error)}`
      );
      return results;
    }
  }

  async exportLogs(
    startDate: string,
    endDate: string,
    format: 'json' | 'csv'
  ): Promise<string> {
    const filter: AuditFilter = {
      startDate,
      endDate,
    };

    const logs = await this.queryLogs(filter);

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    const csvLines: string[] = [
      'EventID,Timestamp,Category,Action,UserID,SourceIP,Result,ErrorMessage',
    ];

    for (const log of logs) {
      const line = [
        log.eventId,
        log.timestamp,
        log.category,
        log.action,
        log.userId,
        log.sourceIp || '',
        log.result,
        log.errorMessage || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');

      csvLines.push(line);
    }

    return csvLines.join('\n');
  }

  async cleanupOldLogs(retentionDays?: number): Promise<number> {
    const retention = retentionDays || this.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retention);

    let deletedCount = 0;

    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter((f) => f.startsWith('audit-') && f.endsWith('.log'));

      for (const file of logFiles) {
        const match = file.match(/audit-(\d{4}-\d{2})\.log/);
        if (!match) continue;

        const fileMonth = match[1];
        const fileDate = new Date(`${fileMonth}-01`);

        if (fileDate < cutoffDate) {
          const filePath = path.join(this.logsDir, file);

          const archivePath = path.join(this.logsDir, 'archive', `${file}.gz`);
          await fs.mkdir(path.dirname(archivePath), { recursive: true });

          try {
            const { createGzip } = await import('zlib');
            const gzip = createGzip();
            const source = createReadStream(filePath);
            const destination = createWriteStream(archivePath);

            await new Promise<void>((resolve, reject) => {
              source.pipe(gzip).pipe(destination).on('finish', () => resolve()).on('error', reject);
            });

            await fs.unlink(filePath);
            deletedCount++;
          } catch (error: unknown) {
            console.error(
              `Failed to archive ${file}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      return deletedCount;
    } catch (error: unknown) {
      console.error(
        `Failed to cleanup logs: ${error instanceof Error ? error.message : String(error)}`
      );
      return deletedCount;
    }
  }

  private async readLogFile(
    filePath: string,
    filter: AuditFilter
  ): Promise<AuditLogEntry[]> {
    const entries: AuditLogEntry[] = [];

    try {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line) as AuditLogEntry;

          if (filter.startDate && entry.timestamp < filter.startDate) continue;
          if (filter.endDate && entry.timestamp > filter.endDate) continue;
          if (filter.category && entry.category !== filter.category) continue;
          if (filter.userId && entry.userId !== filter.userId) continue;
          if (filter.action && entry.action !== filter.action) continue;
          if (filter.result && entry.result !== filter.result) continue;

          entries.push(entry);
        } catch (error: unknown) {
          console.error(`Failed to parse log line: ${line}`);
        }
      }
    } catch (error: unknown) {
      console.error(
        `Failed to read log file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return entries;
  }
}
