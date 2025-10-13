/**
 * Security API Routes
 *
 * REST API endpoints for security features
 */
import { Router } from 'express';
import { HardeningChecklist } from './HardeningChecklist.js';
import { WazuhAgent } from './WazuhAgent.js';
import { FirezoneClient } from './FirezoneClient.js';
import { AuditLogger } from './AuditLogger.js';
import { UpdateManager } from './UpdateManager.js';
export function createSecurityRoutes(metrics) {
    const router = Router();
    const auditLogger = new AuditLogger();
    router.get('/security/hardening', async (req, res) => {
        try {
            const checklist = new HardeningChecklist();
            const report = await checklist.runChecks();
            if (metrics) {
                metrics.hardeningChecksTotal.labels(report.overallStatus).inc();
                for (const check of report.checks) {
                    const statusValue = check.status === 'passed' ? 1 : 0;
                    metrics.hardeningCheckStatus.labels(check.id).set(statusValue);
                }
            }
            res.json(report);
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    router.get('/security/wazuh/status', async (req, res) => {
        try {
            const wazuh = new WazuhAgent();
            const status = await wazuh.getStatus();
            if (metrics) {
                metrics.wazuhAgentConnected.set(status.connected ? 1 : 0);
            }
            res.json(status);
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    router.get('/security/firezone/status', async (req, res) => {
        try {
            const firezone = new FirezoneClient();
            const status = await firezone.getConnectionStatus();
            if (metrics) {
                metrics.firezoneConnected.set(status.connected ? 1 : 0);
            }
            res.json(status);
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    router.get('/security/audit', async (req, res) => {
        try {
            const { startDate, endDate, category, userId } = req.query;
            const filter = {
                startDate: startDate,
                endDate: endDate,
                category: category,
                userId: userId,
            };
            const logs = await auditLogger.queryLogs(filter);
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 50;
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const paginatedLogs = logs.slice(start, end);
            res.json({
                logs: paginatedLogs,
                total: logs.length,
                page,
                pageSize,
            });
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    router.post('/admin/update/check', async (req, res) => {
        try {
            const updateManager = new UpdateManager();
            const updateInfo = await updateManager.checkForUpdates();
            res.json(updateInfo);
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    router.post('/admin/update/apply', async (req, res) => {
        try {
            const { version, scheduledTime } = req.body;
            if (!version) {
                return res.status(400).json({ error: 'Version is required' });
            }
            const updateManager = new UpdateManager();
            if (scheduledTime) {
                await updateManager.scheduleUpdate(version, scheduledTime);
                res.status(202).json({
                    updateId: `update-${Date.now()}`,
                    status: 'scheduled',
                    scheduledTime,
                });
            }
            else {
                const downloadResult = await updateManager.downloadUpdate(version);
                if (!downloadResult.success || !downloadResult.artifactPath) {
                    return res.status(500).json({
                        error: downloadResult.error || 'Download failed',
                    });
                }
                if (downloadResult.signaturePath) {
                    const publicKey = process.env.GPG_PUBLIC_KEY || '';
                    const signatureValid = await updateManager.verifySignature(downloadResult.artifactPath, downloadResult.signaturePath, publicKey);
                    if (!signatureValid) {
                        return res.status(400).json({
                            error: 'Signature verification failed',
                        });
                    }
                }
                const applyResult = await updateManager.applyUpdate(downloadResult.artifactPath);
                if (metrics) {
                    metrics.updatesAppliedTotal.labels(applyResult.success.toString()).inc();
                }
                if (applyResult.success) {
                    await auditLogger.logEvent('SystemEvent', 'agent_updated', 'system', {
                        oldVersion: applyResult.oldVersion,
                        newVersion: applyResult.newVersion,
                    }, undefined, 'success');
                    res.json({
                        success: true,
                        newVersion: applyResult.newVersion,
                        oldVersion: applyResult.oldVersion,
                    });
                }
                else {
                    await auditLogger.logEvent('SystemEvent', 'agent_update_failed', 'system', { version }, undefined, 'failure', applyResult.errorMessage);
                    res.status(500).json({
                        error: applyResult.errorMessage || 'Update failed',
                    });
                }
            }
        }
        catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
