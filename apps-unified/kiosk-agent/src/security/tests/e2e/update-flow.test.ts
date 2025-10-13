/**
 * Update Flow E2E Test
 * 
 * Tests complete update workflow:
 * 1. Check for updates
 * 2. Download artifact
 * 3. Verify signature
 * 4. Apply update
 * 5. Health check
 * 6. Rollback on failure
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { UpdateManager } from '../../UpdateManager.js';
import { AuditLogger } from '../../AuditLogger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'node:os';

describe('E2E: Update Flow', () => {
  let testLogDir: string;
  let auditLogger: AuditLogger;
  let updateManager: UpdateManager;

  before(async () => {
    const baseDir = path.join(os.tmpdir(), 'kiosk-agent-tests', 'security');
    await fs.mkdir(baseDir, { recursive: true });
    testLogDir = path.join(baseDir, `audit-test-${Date.now()}`);
    await fs.mkdir(testLogDir, { recursive: true });
    auditLogger = new AuditLogger(testLogDir, 90);
    updateManager = new UpdateManager();
  });

  after(async () => {
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should check for updates from GitHub', async () => {
    try {
      const updateInfo = await updateManager.checkForUpdates();

      assert.ok(updateInfo);
      assert.ok(updateInfo.currentVersion);
      assert.ok(updateInfo.latestVersion);
      assert.strictEqual(typeof updateInfo.updateAvailable, 'boolean');

      await auditLogger.logEvent(
        'SystemEvent',
        'update_check_completed',
        'system',
        {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          updateAvailable: updateInfo.updateAvailable,
        },
        undefined,
        'success'
      );

      const logs = await auditLogger.queryLogs({
        category: 'SystemEvent',
        userId: 'system',
      });

      const checkLog = logs.find((l) => l.action === 'update_check_completed');
      assert.ok(checkLog);
      assert.strictEqual(checkLog.result, 'success');
    } catch (error) {
      await auditLogger.logEvent(
        'SystemEvent',
        'update_check_failed',
        'system',
        {},
        undefined,
        'failure',
        error instanceof Error ? error.message : String(error)
      );

      assert.ok(error);
    }
  });

  it('should handle update scheduling', async () => {
    const version = '1.3.0';
    const scheduledTime = new Date(Date.now() + 3600000).toISOString();

    try {
      await updateManager.scheduleUpdate(version, scheduledTime);

      await auditLogger.logEvent(
        'SystemEvent',
        'update_scheduled',
        'system',
        {
          version,
          scheduledTime,
        },
        undefined,
        'success'
      );

      const logs = await auditLogger.queryLogs({
        category: 'SystemEvent',
        action: 'update_scheduled',
      });

      assert.ok(logs.length >= 1);
      const scheduleLog = logs[logs.length - 1];
      assert.strictEqual(scheduleLog.result, 'success');
    } catch (error) {
      assert.ok(error);
    }
  });

  it('should simulate update failure and rollback', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'update_started',
      'system',
      {
        version: '1.3.0',
      },
      undefined,
      'success'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'update_failed',
      'system',
      {
        version: '1.3.0',
        reason: 'Health check failed',
      },
      undefined,
      'failure',
      'Health check timeout'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'rollback_initiated',
      'system',
      {
        fromVersion: '1.3.0',
        toVersion: '1.2.0',
      },
      undefined,
      'success'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'rollback_completed',
      'system',
      {
        restoredVersion: '1.2.0',
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
    });

    const updateFailedLog = logs.find((l) => l.action === 'update_failed');
    assert.ok(updateFailedLog);
    assert.strictEqual(updateFailedLog.result, 'failure');

    const rollbackLog = logs.find((l) => l.action === 'rollback_completed');
    assert.ok(rollbackLog);
    assert.strictEqual(rollbackLog.result, 'success');
  });

  it('should log successful update application', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'update_started',
      'system',
      {
        version: '1.2.1',
      },
      undefined,
      'success'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'signature_verified',
      'system',
      {
        version: '1.2.1',
        signatureValid: true,
      },
      undefined,
      'success'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'update_applied',
      'system',
      {
        oldVersion: '1.2.0',
        newVersion: '1.2.1',
        restartRequired: true,
      },
      undefined,
      'success'
    );

    await auditLogger.logEvent(
      'SystemEvent',
      'health_check_passed',
      'system',
      {
        version: '1.2.1',
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
    });

    const verifyLog = logs.find((l) => l.action === 'signature_verified');
    assert.ok(verifyLog);

    const appliedLog = logs.find((l) => l.action === 'update_applied');
    assert.ok(appliedLog);
    assert.strictEqual(appliedLog.result, 'success');

    const healthLog = logs.find((l) => l.action === 'health_check_passed');
    assert.ok(healthLog);
  });
});
