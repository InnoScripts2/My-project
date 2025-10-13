/**
 * Security Integration Tests
 * 
 * Integration tests for security modules working together
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { HardeningChecklist } from '../../HardeningChecklist.js';
import { AuditLogger } from '../../AuditLogger.js';
import { FirezoneClient } from '../../FirezoneClient.js';
import type { AuditFilter } from '../../types.js';

const TEST_DIR = '/tmp/security-integration-test';
const AUDIT_DIR = `${TEST_DIR}/audit`;
const FIREZONE_CONFIG = `${TEST_DIR}/firezone.json`;

describe('Security Integration', () => {
  before(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    process.env.AUDIT_LOG_DIR = AUDIT_DIR;
    process.env.FIREZONE_CONFIG_PATH = FIREZONE_CONFIG;
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should run hardening checks and log results to audit', async () => {
    const checklist = new HardeningChecklist();
    const auditLogger = new AuditLogger(AUDIT_DIR);

    const report = await checklist.runChecks();

    assert.ok(report);
    assert.ok(report.checks.length > 0);

    await auditLogger.logEvent(
      'SystemEvent',
      'hardening_check_completed',
      'system',
      {
        overallStatus: report.overallStatus,
        checksCount: report.checks.length,
        failedCount: report.checks.filter((c) => c.status === 'failed').length,
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
    });

    assert.ok(logs.length > 0);
    const hardeningLog = logs.find((l) => l.action === 'hardening_check_completed');
    assert.ok(hardeningLog);
    assert.strictEqual(hardeningLog.action, 'hardening_check_completed');
  });

  it('should register Firezone resource and log access policy update', async () => {
    const firezone = new FirezoneClient();
    const auditLogger = new AuditLogger(AUDIT_DIR);

    const result = await firezone.registerResource(
      'test-kiosk-integration',
      'Integration Test Kiosk',
      ['test', 'integration']
    );

    assert.ok(result.resourceId);
    assert.ok(result.deviceToken);

    await auditLogger.logEvent(
      'ConfigChange',
      'firezone_resource_registered',
      'system',
      {
        resourceId: result.resourceId,
        gatewayAddress: result.gatewayAddress,
      },
      undefined,
      'success'
    );

    const policy = {
      allowedRoles: ['operator'],
      mfaRequired: true,
      sessionTimeout: 30,
    };

    await firezone.updateAccessPolicy(result.resourceId, policy);

    await auditLogger.logEvent(
      'ConfigChange',
      'firezone_policy_updated',
      'admin',
      {
        resourceId: result.resourceId,
        mfaRequired: policy.mfaRequired,
        sessionTimeout: policy.sessionTimeout,
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'ConfigChange',
    });

    assert.ok(logs.length >= 2);
  });

  it('should handle failed security operations in audit log', async () => {
    const auditLogger = new AuditLogger(AUDIT_DIR);

    await auditLogger.logEvent(
      'RemoteAccess',
      'ssh_login',
      'operator1',
      {
        sourceIp: '192.168.1.100',
        protocol: 'ssh',
      },
      '192.168.1.100',
      'failure',
      'Authentication failed: invalid credentials'
    );

    const failedLogs = await auditLogger.queryLogs({
      result: 'failure',
    });

    assert.ok(failedLogs.length > 0);
    const sshFailure = failedLogs.find((l) => l.action === 'ssh_login');
    assert.ok(sshFailure);
    assert.strictEqual(sshFailure.result, 'failure');
    assert.ok(sshFailure.errorMessage);
  });

  it('should export audit logs for compliance reporting', async () => {
    const auditLogger = new AuditLogger(AUDIT_DIR);

    await auditLogger.logEvent(
      'SystemEvent',
      'agent_updated',
      'system',
      { oldVersion: '1.0.0', newVersion: '1.1.0' },
      undefined,
      'success'
    );

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const csvReport = await auditLogger.exportLogs(
      startDate.toISOString(),
      endDate.toISOString(),
      'csv'
    );

    assert.ok(csvReport);
    assert.ok(csvReport.includes('EventID,Timestamp,Category'));
    assert.ok(csvReport.includes('agent_updated'));

    const jsonReport = await auditLogger.exportLogs(
      startDate.toISOString(),
      endDate.toISOString(),
      'json'
    );

    assert.ok(jsonReport);
    const parsed = JSON.parse(jsonReport);
    assert.ok(Array.isArray(parsed));
  });
});
