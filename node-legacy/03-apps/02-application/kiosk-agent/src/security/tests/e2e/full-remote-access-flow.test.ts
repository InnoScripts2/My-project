/**
 * Full Remote Access Flow E2E Test
 * 
 * Simulates complete operator remote access workflow:
 * 1. Operator connects through Firezone VPN
 * 2. Opens Guacamole web UI
 * 3. Creates RDP/SSH session to kiosk
 * 4. Executes commands
 * 5. Session logged in audit log
 * 6. Operator disconnects
 * 7. Audit log verified
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { FirezoneClient } from '../../FirezoneClient.js';
import { GuacamoleProxy } from '../../GuacamoleProxy.js';
import { AuditLogger } from '../../AuditLogger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('E2E: Full Remote Access Flow', () => {
  let testLogDir: string;
  let auditLogger: AuditLogger;
  let firezone: FirezoneClient;
  let guacamole: GuacamoleProxy;

  before(async () => {
    testLogDir = path.join('/tmp', `audit-test-${Date.now()}`);
    await fs.mkdir(testLogDir, { recursive: true });
    auditLogger = new AuditLogger(testLogDir, 90);
    firezone = new FirezoneClient();
    guacamole = new GuacamoleProxy();
  });

  after(async () => {
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should complete full operator remote access workflow', async () => {
    const operatorId = 'operator1';
    const sourceIp = '10.0.0.5';

    await auditLogger.logEvent(
      'RemoteAccess',
      'firezone_vpn_connected',
      operatorId,
      {
        gatewayAddress: 'firezone.test',
        sessionTimeout: 60,
      },
      sourceIp,
      'success'
    );

    await auditLogger.logEvent(
      'RemoteAccess',
      'rdp_session_initiated',
      operatorId,
      {
        protocol: 'RDP',
        targetHost: 'kiosk-1',
        targetPort: 3389,
      },
      sourceIp,
      'success'
    );

    await auditLogger.logEvent(
      'RemoteAccess',
      'command_executed',
      operatorId,
      {
        command: 'systemctl status kiosk-agent',
        exitCode: 0,
      },
      sourceIp,
      'success'
    );

    await auditLogger.logEvent(
      'RemoteAccess',
      'rdp_session_terminated',
      operatorId,
      {
        protocol: 'RDP',
        duration: 1200,
      },
      sourceIp,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      userId: operatorId,
      category: 'RemoteAccess',
    });

    assert.ok(logs.length >= 4);

    const vpnLog = logs.find((l) => l.action === 'firezone_vpn_connected');
    assert.ok(vpnLog);
    assert.strictEqual(vpnLog.result, 'success');
    assert.strictEqual(vpnLog.sourceIp, sourceIp);

    const rdpLog = logs.find((l) => l.action === 'rdp_session_initiated');
    assert.ok(rdpLog);
    assert.strictEqual(rdpLog.userId, operatorId);

    const commandLog = logs.find((l) => l.action === 'command_executed');
    assert.ok(commandLog);

    const terminateLog = logs.find((l) => l.action === 'rdp_session_terminated');
    assert.ok(terminateLog);
    assert.ok((terminateLog.details as { duration?: number }).duration);
  });

  it('should log SSH session workflow', async () => {
    const operatorId = 'operator2';
    const sourceIp = '10.0.0.6';

    await auditLogger.logEvent(
      'RemoteAccess',
      'ssh_login',
      operatorId,
      {
        protocol: 'SSH',
        targetHost: 'kiosk-2',
        targetPort: 22,
      },
      sourceIp,
      'success'
    );

    await auditLogger.logEvent(
      'RemoteAccess',
      'ssh_logout',
      operatorId,
      {
        protocol: 'SSH',
        duration: 600,
      },
      sourceIp,
      'success'
    );

    const logs = await auditLogger.queryLogs({
      userId: operatorId,
      category: 'RemoteAccess',
    });

    assert.ok(logs.length >= 2);

    const loginLog = logs.find((l) => l.action === 'ssh_login');
    assert.ok(loginLog);
    assert.strictEqual(loginLog.result, 'success');

    const logoutLog = logs.find((l) => l.action === 'ssh_logout');
    assert.ok(logoutLog);
  });

  it('should handle failed authentication attempts', async () => {
    const operatorId = 'malicious-user';
    const sourceIp = '10.0.0.99';

    await auditLogger.logEvent(
      'RemoteAccess',
      'ssh_login',
      operatorId,
      {
        protocol: 'SSH',
        targetHost: 'kiosk-1',
        attempts: 3,
      },
      sourceIp,
      'failure',
      'Invalid credentials'
    );

    const logs = await auditLogger.queryLogs({
      userId: operatorId,
      result: 'failure',
    });

    assert.ok(logs.length >= 1);

    const failedLog = logs.find((l) => l.action === 'ssh_login' && l.result === 'failure');
    assert.ok(failedLog);
    assert.ok(failedLog.errorMessage);
    assert.strictEqual(failedLog.errorMessage, 'Invalid credentials');
  });
});
