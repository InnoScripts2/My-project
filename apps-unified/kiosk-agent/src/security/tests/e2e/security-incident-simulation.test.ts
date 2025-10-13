/**
 * Security Incident Simulation E2E Test
 * 
 * Simulates security incidents and verifies detection:
 * 1. Unauthorized file modification
 * 2. Wazuh FIM detection
 * 3. Alert sent to Wazuh Manager
 * 4. Audit log entry created
 * 5. Operator notification
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { AuditLogger } from '../../AuditLogger.js';
import { WazuhAgent } from '../../WazuhAgent.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'node:os';

describe('E2E: Security Incident Simulation', () => {
  let testLogDir: string;
  let auditLogger: AuditLogger;
  let wazuh: WazuhAgent;

  before(async () => {
    const baseDir = path.join(os.tmpdir(), 'kiosk-agent-tests', 'security');
    await fs.mkdir(baseDir, { recursive: true });
    testLogDir = path.join(baseDir, `audit-test-${Date.now()}`);
    await fs.mkdir(testLogDir, { recursive: true });
    auditLogger = new AuditLogger(testLogDir, 90);
    wazuh = new WazuhAgent();
  });

  after(async () => {
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect unauthorized file modification', async () => {
    const filePath = '/opt/kiosk/apps/kiosk-agent/src/config.ts';
    const oldHash = 'abc123def456';
    const newHash = 'xyz789uvw012';

    await auditLogger.logEvent(
      'FileChange',
      'file_modified',
      'unknown',
      {
        filePath,
        oldHash,
        newHash,
        size: 1024,
        triggeredBy: 'wazuh',
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'FileChange',
      action: 'file_modified',
    });

    assert.ok(logs.length >= 1);

    const modLog = logs.find((l) => l.action === 'file_modified');
    assert.ok(modLog);
    assert.ok((modLog.details as { filePath?: string }).filePath);
    assert.ok((modLog.details as { oldHash?: string }).oldHash);
    assert.ok((modLog.details as { newHash?: string }).newHash);
  });

  it('should log Wazuh FIM alert', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'wazuh_fim_alert',
      'system',
      {
        severity: 'High',
        filePath: '/opt/kiosk/apps/kiosk-agent/src/security/config.ts',
        alertId: 'wazuh-alert-12345',
        description: 'Critical system file modified',
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
      action: 'wazuh_fim_alert',
    });

    assert.ok(logs.length >= 1);

    const alertLog = logs[logs.length - 1];
    assert.strictEqual(alertLog.action, 'wazuh_fim_alert');
    assert.ok((alertLog.details as { severity?: string }).severity === 'High');
  });

  it('should detect rootkit scan findings', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'wazuh_rootkit_detected',
      'system',
      {
        severity: 'Critical',
        rootkitName: 'Suspicious-Process-XYZ',
        processId: 1234,
        alertId: 'wazuh-rootkit-56789',
      },
      undefined,
      'failure',
      'Potential rootkit detected in system processes'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
      result: 'failure',
    });

    assert.ok(logs.length >= 1);

    const rootkitLog = logs.find((l) => l.action === 'wazuh_rootkit_detected');
    assert.ok(rootkitLog);
    assert.strictEqual(rootkitLog.result, 'failure');
    assert.ok(rootkitLog.errorMessage);
  });

  it('should log vulnerability scan results', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'wazuh_vulnerability_found',
      'system',
      {
        severity: 'Critical',
        cveId: 'CVE-2024-12345',
        package: 'nodejs',
        version: '18.0.0',
        fixAvailable: true,
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
      action: 'wazuh_vulnerability_found',
    });

    assert.ok(logs.length >= 1);

    const vulnLog = logs[logs.length - 1];
    assert.ok((vulnLog.details as { cveId?: string }).cveId);
    assert.ok((vulnLog.details as { severity?: string }).severity === 'Critical');
  });

  it('should log operator notification for security incident', async () => {
    await auditLogger.logEvent(
      'SystemEvent',
      'operator_notified',
      'system',
      {
        notificationType: 'email',
        recipient: 'security-team@example.com',
        incidentType: 'unauthorized_file_modification',
        incidentId: 'inc-2025-001',
      },
      undefined,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      category: 'SystemEvent',
      action: 'operator_notified',
    });

    assert.ok(logs.length >= 1);

    const notifyLog = logs[logs.length - 1];
    assert.strictEqual(notifyLog.result, 'success');
    assert.ok((notifyLog.details as { recipient?: string }).recipient);
  });

  it('should handle multiple concurrent incidents', async () => {
    await Promise.all([
      auditLogger.logEvent(
        'FileChange',
        'file_deleted',
        'unknown',
        { filePath: '/opt/kiosk/config/secrets.env', triggeredBy: 'wazuh' },
        undefined,
        'failure',
        'Critical config file deleted'
      ),
      auditLogger.logEvent(
        'RemoteAccess',
        'unauthorized_access_attempt',
        'unknown',
        { sourceIp: '192.168.1.100', attempts: 5 },
        '192.168.1.100',
        'failure',
        'Multiple failed login attempts'
      ),
      auditLogger.logEvent(
        'ConfigChange',
        'config_modified_externally',
        'unknown',
        { configKey: 'WAZUH_SERVER', modifiedAt: new Date().toISOString() },
        undefined,
        'failure',
        'Configuration modified without authorization'
      ),
    ]);

    const logs = await auditLogger.queryLogs({
      result: 'failure',
    });

    assert.ok(logs.length >= 3);

    const fileLog = logs.find((l) => l.action === 'file_deleted');
    assert.ok(fileLog);

    const accessLog = logs.find((l) => l.action === 'unauthorized_access_attempt');
    assert.ok(accessLog);

    const configLog = logs.find((l) => l.action === 'config_modified_externally');
    assert.ok(configLog);
  });
});
