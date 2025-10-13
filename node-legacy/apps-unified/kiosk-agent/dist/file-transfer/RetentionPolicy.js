import { SeafileClient } from './SeafileClient.js';
import { ArchiveService } from './ArchiveService.js';
import * as fs from 'fs/promises';
import * as path from 'path';
export class RetentionPolicy {
    constructor(seafileClient, archiveService, config) {
        this.seafileClient = seafileClient || new SeafileClient();
        this.archiveService = archiveService || new ArchiveService();
        this.config = config || {
            localRetentionDays: parseInt(process.env.SEAFILE_LOCAL_RETENTION_DAYS || '1'),
            remoteRetentionDays: parseInt(process.env.SEAFILE_REMOTE_RETENTION_DAYS || '90'),
            autoDeleteAfterSync: process.env.SEAFILE_AUTO_DELETE_AFTER_SYNC === 'true',
            exemptPatterns: [],
        };
    }
    configurePolicy(policy) {
        this.config = {
            ...this.config,
            ...policy,
        };
    }
    async applyPolicy() {
        const result = {
            localDeleted: 0,
            remoteDeleted: 0,
            errors: [],
        };
        try {
            const localResult = await this.applyLocalRetention();
            result.localDeleted = localResult.deleted;
            result.errors.push(...localResult.errors);
        }
        catch (error) {
            result.errors.push(`Local retention failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            const remoteResult = await this.applyRemoteRetention();
            result.remoteDeleted = remoteResult.deleted;
            result.errors.push(...remoteResult.errors);
        }
        catch (error) {
            result.errors.push(`Remote retention failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return result;
    }
    async applyLocalRetention() {
        const result = { deleted: 0, errors: [] };
        const localReportsDir = process.env.REPORTS_DIR || './reports';
        try {
            const now = Date.now();
            const retentionMs = this.config.localRetentionDays * 24 * 60 * 60 * 1000;
            const files = await this.scanDirectory(localReportsDir);
            for (const file of files) {
                try {
                    const stats = await fs.stat(file);
                    const age = now - stats.mtimeMs;
                    if (age > retentionMs) {
                        const reportId = path.basename(file, path.extname(file));
                        const archived = await this.archiveService.getArchivedReport(reportId);
                        if (archived || this.config.autoDeleteAfterSync) {
                            await fs.unlink(file);
                            result.deleted++;
                            console.log(`[RetentionPolicy] Deleted local file: ${file}`);
                        }
                    }
                }
                catch (error) {
                    result.errors.push(`Failed to delete ${file}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        catch (error) {
            result.errors.push(`Local scan failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return result;
    }
    async applyRemoteRetention() {
        const result = { deleted: 0, errors: [] };
        try {
            const now = Date.now();
            const retentionMs = this.config.remoteRetentionDays * 24 * 60 * 60 * 1000;
            const files = await this.seafileClient.listFiles('/reports');
            for (const file of files) {
                if (file.type !== 'file') {
                    continue;
                }
                try {
                    const fileAge = now - new Date(file.modifiedAt).getTime();
                    if (fileAge > retentionMs) {
                        if (this.isExempt(file.path)) {
                            console.log(`[RetentionPolicy] Skipping exempt file: ${file.path}`);
                            continue;
                        }
                        await this.seafileClient.deleteFile(file.path);
                        result.deleted++;
                        console.log(`[RetentionPolicy] Deleted remote file: ${file.path}`);
                    }
                }
                catch (error) {
                    result.errors.push(`Failed to delete ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        catch (error) {
            result.errors.push(`Remote scan failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return result;
    }
    isExempt(filePath) {
        for (const pattern of this.config.exemptPatterns) {
            try {
                const regex = new RegExp(pattern);
                if (regex.test(filePath)) {
                    return true;
                }
            }
            catch (error) {
                console.warn(`[RetentionPolicy] Invalid regex pattern: ${pattern}`);
            }
        }
        return false;
    }
    async scanDirectory(dirPath) {
        const files = [];
        async function scan(currentPath) {
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentPath, entry.name);
                    if (entry.isDirectory()) {
                        await scan(fullPath);
                    }
                    else if (entry.isFile() && fullPath.endsWith('.pdf')) {
                        files.push(fullPath);
                    }
                }
            }
            catch (error) {
                // Directory might not exist
            }
        }
        await scan(dirPath);
        return files;
    }
}
