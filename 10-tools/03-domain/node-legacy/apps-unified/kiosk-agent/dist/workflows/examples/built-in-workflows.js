/**
 * Built-in workflow definitions
 */
/**
 * Auto-restart on critical alert workflow
 */
export const autoRestartWorkflow = {
    name: 'auto_restart_on_critical_alert',
    description: 'Automatically restart kiosk on critical device or agent alert',
    trigger: {
        type: 'event',
        config: {
            eventName: 'alert_triggered',
            condition: "payload.severity === 'critical'",
        },
    },
    steps: [
        {
            name: 'check_alert_type',
            type: 'condition',
            config: {
                condition: "payload.alertName === 'device_disconnected' || payload.alertName === 'agent_down'",
            },
            onTrue: 'restart_kiosk',
            onFalse: 'end',
        },
        {
            name: 'restart_kiosk',
            type: 'http',
            config: {
                method: 'POST',
                url: 'http://localhost:8080/api/kiosks/{{payload.kioskId}}/restart',
                headers: {
                    Authorization: 'Bearer {{env.ADMIN_TOKEN}}',
                },
            },
            nextStep: 'wait_restart',
        },
        {
            name: 'wait_restart',
            type: 'delay',
            config: {
                seconds: 30,
            },
            nextStep: 'check_health',
        },
        {
            name: 'check_health',
            type: 'http',
            config: {
                method: 'GET',
                url: 'http://localhost:8080/api/health',
            },
            nextStep: 'notify_operator',
        },
        {
            name: 'notify_operator',
            type: 'email',
            config: {
                to: 'operator@example.com',
                subject: 'Kiosk {{payload.kioskId}} restart completed',
                body: 'Health check result {{steps.check_health.output.status}}',
            },
        },
    ],
    enabled: true,
};
/**
 * Daily cleanup workflow
 */
export const dailyCleanupWorkflow = {
    name: 'daily_cleanup',
    description: 'Cleanup old files older than 7 days',
    trigger: {
        type: 'schedule',
        config: {
            cronExpression: '0 3 * * *',
        },
    },
    steps: [
        {
            name: 'find_old_files',
            type: 'script',
            config: {
                language: 'nodejs',
                code: `
const fs = require('fs');
const path = require('path');
const now = Date.now();
const maxAge = 7 * 24 * 60 * 60 * 1000;
const dirs = ['exports/', 'logs/'];
let deletedCount = 0;
dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });
  }
});
return { deletedCount };
        `,
            },
            nextStep: 'cleanup_reports',
        },
        {
            name: 'cleanup_reports',
            type: 'http',
            config: {
                method: 'DELETE',
                url: 'http://localhost:8080/api/reports/cleanup?olderThan=7',
            },
            nextStep: 'notify_summary',
        },
        {
            name: 'notify_summary',
            type: 'email',
            config: {
                to: 'admin@example.com',
                subject: 'Daily cleanup completed',
                body: 'Deleted {{steps.find_old_files.output.deletedCount}} files',
            },
        },
    ],
    enabled: true,
};
/**
 * Sync orchestration workflow
 */
export const syncOrchestrationWorkflow = {
    name: 'sync_orchestration',
    description: 'Orchestrate daily Seafile sync',
    trigger: {
        type: 'schedule',
        config: {
            cronExpression: '0 4 * * *',
        },
    },
    steps: [
        {
            name: 'start_sync',
            type: 'http',
            config: {
                method: 'POST',
                url: 'http://localhost:8080/api/reports/sync',
            },
            nextStep: 'poll_sync_status',
        },
        {
            name: 'poll_sync_status',
            type: 'loop',
            config: {
                maxIterations: 30,
                delaySeconds: 10,
                condition: "steps.check_sync.output.status !== 'completed'",
                steps: [
                    {
                        name: 'check_sync',
                        type: 'http',
                        config: {
                            method: 'GET',
                            url: 'http://localhost:8080/api/reports/sync/{{steps.start_sync.output.syncId}}',
                        },
                    },
                ],
            },
            nextStep: 'check_result',
        },
        {
            name: 'check_result',
            type: 'condition',
            config: {
                condition: "steps.check_sync.output.status === 'completed'",
            },
            onTrue: 'notify_success',
            onFalse: 'notify_failure',
        },
        {
            name: 'notify_success',
            type: 'email',
            config: {
                to: 'admin@example.com',
                subject: 'Seafile sync completed',
                body: 'Synced {{steps.check_sync.output.filesSynced}} files',
            },
        },
        {
            name: 'notify_failure',
            type: 'slack',
            config: {
                webhookUrl: 'https://hooks.slack.com/services/YOUR_WEBHOOK',
                message: 'Seafile sync failed. Please check logs.',
            },
        },
    ],
    enabled: true,
};
export const builtInWorkflows = [
    autoRestartWorkflow,
    dailyCleanupWorkflow,
    syncOrchestrationWorkflow,
];
