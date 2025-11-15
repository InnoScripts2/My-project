/**
 * Security Integration Example
 * 
 * Example of integrating security modules into kiosk-agent server.
 * Add this to src/server.ts or create a dedicated security initialization module.
 */

import express from 'express';
import { Registry } from 'prom-client';
import {
  createSecurityRoutes,
  createSecurityMetrics,
  AuditLogger,
  HardeningChecklist,
  type CheckResult,
} from './index.js';

export async function initializeSecurity(app: express.Application, registry: Registry) {
  console.log('Initializing security modules...');

  const auditLogger = new AuditLogger();
  const securityMetrics = createSecurityMetrics(registry);

  await auditLogger.logEvent(
    'SystemEvent',
    'agent_started',
    'system',
    {
      version: process.env.APP_VERSION || '0.1.0',
      platform: process.platform,
    },
    undefined,
    'success'
  );

  const securityRouter = createSecurityRoutes(securityMetrics);
  app.use('/api', securityRouter);

  if (process.env.AGENT_ENV === 'PROD') {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();

    if (report.overallStatus === 'failed') {
      console.error('CRITICAL: Hardening checks failed!');
      console.error('Failed checks:', report.checks.filter((c: CheckResult) => c.status === 'failed'));
      console.error('Recommendations:', report.recommendations);

      await auditLogger.logEvent(
        'SystemEvent',
        'hardening_check_failed',
        'system',
        {
          failedChecks: report.checks
            .filter((c: CheckResult) => c.status === 'failed')
            .map((c: CheckResult) => c.id),
          recommendations: report.recommendations,
        },
        undefined,
        'failure'
      );

      if (process.env.ENFORCE_HARDENING === 'true') {
        console.error('Exiting due to failed hardening checks (ENFORCE_HARDENING=true)');
        process.exit(1);
      }
    } else {
      console.log('Hardening checks passed:', report.overallStatus);
    }

    securityMetrics.hardeningChecksTotal.labels(report.overallStatus).inc();
    for (const check of report.checks) {
      const statusValue = check.status === 'passed' ? 1 : 0;
      securityMetrics.hardeningCheckStatus.labels(check.id).set(statusValue);
    }
  }

  const cleanupInterval = setInterval(async () => {
    try {
      const deleted = await auditLogger.cleanupOldLogs();
      if (deleted > 0) {
        console.log(`Cleaned up ${deleted} old audit log files`);
      }
    } catch (error: unknown) {
      console.error(
        'Failed to cleanup audit logs:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, 24 * 60 * 60 * 1000);

  process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
  });

  console.log('Security modules initialized');

  return { auditLogger, securityMetrics };
}

/**
 * Example usage in server.ts:
 * 
 * import { initializeSecurity } from './security-init.js';
 * import { register } from 'prom-client';
 * 
 * const app = express();
 * 
 * await initializeSecurity(app, register);
 * 
 * app.listen(7070, () => {
 *   console.log('Server listening on port 7070');
 * });
 */
