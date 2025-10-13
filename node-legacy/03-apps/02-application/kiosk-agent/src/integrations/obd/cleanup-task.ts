import * as fs from 'fs';
import * as path from 'path';
import { obdSessionManager } from './session-manager.js';

export class CleanupTask {
  private intervalId: NodeJS.Timeout | null = null;

  start(): void {
    // Run cleanup every hour
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000);

    // Run initial cleanup
    setTimeout(() => this.runCleanup(), 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async runCleanup(): Promise<void> {
    try {
      // Cleanup old sessions
      const deletedSessions = obdSessionManager.cleanupOldSessions();
      
      // Cleanup old PDF files
      const deletedFiles = this.cleanupOldReportFiles();
      
      if (deletedSessions > 0 || deletedFiles > 0) {
        console.log(
          `[CleanupTask] Cleanup completed: ${deletedSessions} sessions, ${deletedFiles} report files deleted`
        );
      }
    } catch (error) {
      console.error('[CleanupTask] Cleanup failed:', error);
    }
  }

  private cleanupOldReportFiles(): number {
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const reportsDir = path.join(outboxRoot, 'obd');
    
    if (!fs.existsSync(reportsDir)) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(reportsDir);
      
      for (const file of files) {
        const filePath = path.join(reportsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error('[CleanupTask] Failed to cleanup report files:', error);
    }

    return deletedCount;
  }
}

export const cleanupTask = new CleanupTask();
