import { SeafileClient } from './SeafileClient.js';
import { ReportService } from '../reports/service.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import cron from 'node-cron';
export class ArchiveService {
    constructor(seafileClient, reportService, dbPath) {
        this.cronJob = null;
        this.syncJobs = new Map();
        this.seafileClient = seafileClient || new SeafileClient();
        this.reportService = reportService || new ReportService();
        this.dbPath = dbPath || path.join(process.cwd(), 'data', 'archive.db');
        this.db = this.initDatabase();
    }
    initDatabase() {
        const dir = path.dirname(this.dbPath);
        try {
            require('fs').mkdirSync(dir, { recursive: true });
        }
        catch (e) {
            // Directory might already exist
        }
        const db = new Database(this.dbPath);
        db.exec(`
      CREATE TABLE IF NOT EXISTS reports_archive (
        reportId TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        generatedAt TEXT NOT NULL,
        archivedAt TEXT NOT NULL,
        remotePath TEXT NOT NULL,
        shareLink TEXT,
        size INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_reports_archive_sessionId ON reports_archive(sessionId);
      CREATE INDEX IF NOT EXISTS idx_reports_archive_type ON reports_archive(type);
      CREATE INDEX IF NOT EXISTS idx_reports_archive_archivedAt ON reports_archive(archivedAt);
    `);
        return db;
    }
    async archiveReport(reportId, generateShareLink = false) {
        const report = await this.reportService.getReport(reportId);
        if (!report) {
            throw new Error('Report not found');
        }
        if (!report.pdfPath) {
            throw new Error('Report PDF not available');
        }
        try {
            await fs.access(report.pdfPath);
        }
        catch (error) {
            throw new Error('Report PDF file not found on disk');
        }
        const date = new Date(report.generatedAt);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const remotePath = `reports/${year}/${month}/${day}/${reportId}.pdf`;
        const uploadResult = await this.seafileClient.uploadFile(report.pdfPath, remotePath);
        let shareLink;
        if (generateShareLink) {
            try {
                const expirationDays = parseInt(process.env.SEAFILE_SHARE_LINK_EXPIRATION_DAYS || '7');
                const shareLinkResult = await this.seafileClient.getShareLink(remotePath, expirationDays);
                shareLink = shareLinkResult.url;
            }
            catch (error) {
                console.warn('[ArchiveService] Failed to generate share link:', error);
            }
        }
        const fileStats = await fs.stat(report.pdfPath);
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reports_archive 
      (reportId, type, sessionId, generatedAt, archivedAt, remotePath, shareLink, size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(reportId, report.type, report.sessionId, report.generatedAt, uploadResult.uploadedAt, remotePath, shareLink || null, fileStats.size);
        return {
            reportId,
            archived: true,
            remotePath,
            shareLink,
            archivedAt: uploadResult.uploadedAt,
        };
    }
    async getArchivedReport(reportId) {
        const stmt = this.db.prepare(`
      SELECT reportId, type, sessionId, generatedAt, archivedAt, remotePath, size
      FROM reports_archive
      WHERE reportId = ?
    `);
        const row = stmt.get(reportId);
        if (!row) {
            return null;
        }
        return {
            reportId: row.reportId,
            type: row.type,
            sessionId: row.sessionId,
            generatedAt: row.generatedAt,
            archivedAt: row.archivedAt,
            remotePath: row.remotePath,
            size: row.size,
        };
    }
    async listArchivedReports(filter = {}) {
        const limit = filter.limit || 100;
        const offset = filter.offset || 0;
        let whereClause = '';
        const params = [];
        const conditions = [];
        if (filter.startDate) {
            conditions.push('archivedAt >= ?');
            params.push(filter.startDate);
        }
        if (filter.endDate) {
            conditions.push('archivedAt <= ?');
            params.push(filter.endDate);
        }
        if (filter.type) {
            conditions.push('type = ?');
            params.push(filter.type);
        }
        if (filter.sessionId) {
            conditions.push('sessionId = ?');
            params.push(filter.sessionId);
        }
        if (conditions.length > 0) {
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }
        const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM reports_archive
      ${whereClause}
    `);
        const countResult = countStmt.get(...params);
        const total = countResult.total;
        const stmt = this.db.prepare(`
      SELECT reportId, type, sessionId, generatedAt, archivedAt, remotePath, size
      FROM reports_archive
      ${whereClause}
      ORDER BY archivedAt DESC
      LIMIT ? OFFSET ?
    `);
        const rows = stmt.all(...params, limit, offset);
        const reports = rows.map(row => ({
            reportId: row.reportId,
            type: row.type,
            sessionId: row.sessionId,
            generatedAt: row.generatedAt,
            archivedAt: row.archivedAt,
            remotePath: row.remotePath,
            size: row.size,
        }));
        return { reports, total };
    }
    async deleteArchivedReport(reportId) {
        const metadata = await this.getArchivedReport(reportId);
        if (!metadata) {
            throw new Error('Archived report not found');
        }
        await this.seafileClient.deleteFile(metadata.remotePath);
        const stmt = this.db.prepare('DELETE FROM reports_archive WHERE reportId = ?');
        stmt.run(reportId);
        return { success: true };
    }
    scheduleSync(cronExpression) {
        if (this.cronJob) {
            this.cronJob.stop();
        }
        this.cronJob = cron.schedule(cronExpression, async () => {
            console.log('[ArchiveService] Scheduled sync started');
            try {
                const result = await this.manualSync();
                console.log('[ArchiveService] Scheduled sync completed:', result);
            }
            catch (error) {
                console.error('[ArchiveService] Scheduled sync failed:', error);
            }
        });
        console.log(`[ArchiveService] Sync scheduled with cron expression: ${cronExpression}`);
    }
    async manualSync() {
        const localReportsDir = process.env.REPORTS_DIR || './reports';
        const remoteReportsDir = '/reports';
        const result = await this.seafileClient.syncDirectory(localReportsDir, remoteReportsDir);
        return result;
    }
    async getSyncStatus(syncId) {
        return this.syncJobs.get(syncId) || null;
    }
    async startManualSync() {
        const syncId = `sync-${Date.now()}`;
        this.syncJobs.set(syncId, { status: 'running' });
        this.manualSync()
            .then(result => {
            this.syncJobs.set(syncId, { status: 'completed', result });
        })
            .catch(error => {
            this.syncJobs.set(syncId, {
                status: 'failed',
                result: {
                    uploaded: 0,
                    downloaded: 0,
                    deleted: 0,
                    errors: [error instanceof Error ? error.message : String(error)],
                    duration: 0
                }
            });
        });
        return { syncId, status: 'running' };
    }
    close() {
        if (this.cronJob) {
            this.cronJob.stop();
        }
        this.db.close();
    }
}
