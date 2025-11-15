/**
 * Heartbeat logger for service health monitoring.
 * Periodically writes heartbeat entries to track service liveness.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
export class HeartbeatLogger {
    constructor(logPath, intervalMs = 30000) {
        this.enabled = false;
        this.logPath = logPath;
        this.intervalMs = intervalMs;
    }
    /**
     * Start heartbeat logging
     */
    async start() {
        if (this.enabled) {
            return;
        }
        this.enabled = true;
        // Ensure log directory exists
        await fs.mkdir(path.dirname(this.logPath), { recursive: true });
        // Write initial heartbeat
        await this.writeHeartbeat('ok', 'Heartbeat started');
        // Schedule periodic heartbeats
        this.intervalHandle = setInterval(() => {
            this.writeHeartbeat('ok').catch(err => {
                console.error('[heartbeat] Failed to write:', err);
            });
        }, this.intervalMs);
        // Prevent tests from hanging due to active interval
        if (typeof this.intervalHandle.unref === 'function') {
            this.intervalHandle.unref();
        }
    }
    /**
     * Stop heartbeat logging
     */
    async stop() {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
        }
        await this.writeHeartbeat('ok', 'Heartbeat stopped');
    }
    /**
     * Write a heartbeat entry
     */
    async writeHeartbeat(status, message) {
        const entry = {
            timestamp: new Date().toISOString(),
            pid: process.pid,
            uptime: Math.round(process.uptime()),
            memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            status,
            message,
        };
        const line = JSON.stringify(entry) + '\n';
        try {
            await fs.appendFile(this.logPath, line, 'utf-8');
        }
        catch (error) {
            console.error('[heartbeat] Failed to write entry:', error.message);
            throw error;
        }
    }
    /**
     * Get the most recent heartbeat
     */
    async getLastHeartbeat() {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            if (lines.length === 0) {
                return null;
            }
            const lastLine = lines[lines.length - 1];
            return JSON.parse(lastLine);
        }
        catch {
            return null;
        }
    }
    /**
     * Get heartbeat history
     */
    async getHeartbeatHistory(limit = 100) {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            const entries = [];
            const start = Math.max(0, lines.length - limit);
            for (let i = start; i < lines.length; i++) {
                try {
                    entries.push(JSON.parse(lines[i]));
                }
                catch {
                    // Skip invalid entries
                }
            }
            return entries;
        }
        catch {
            return [];
        }
    }
    /**
     * Rotate log file if it exceeds size limit
     */
    async rotateIfNeeded(maxSizeMb = 10) {
        try {
            const stats = await fs.stat(this.logPath);
            const sizeMb = stats.size / 1024 / 1024;
            if (sizeMb > maxSizeMb) {
                const backupPath = `${this.logPath}.${Date.now()}.bak`;
                await fs.rename(this.logPath, backupPath);
                // Keep only last 5 backups
                const dir = path.dirname(this.logPath);
                const basename = path.basename(this.logPath);
                const files = await fs.readdir(dir);
                const backups = files
                    .filter(f => f.startsWith(basename) && f.endsWith('.bak'))
                    .sort()
                    .reverse();
                for (let i = 5; i < backups.length; i++) {
                    await fs.unlink(path.join(dir, backups[i]));
                }
            }
        }
        catch {
            // Ignore rotation errors
        }
    }
}
