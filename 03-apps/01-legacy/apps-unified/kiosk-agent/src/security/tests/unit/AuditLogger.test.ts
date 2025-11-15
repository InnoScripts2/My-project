/**
 * AuditLogger Unit Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'node:os';
import { AuditLogger } from '../../AuditLogger.js';

const TEST_LOG_DIR = path.join(os.tmpdir(), 'kiosk-agent-tests', 'audit-logs');

describe('AuditLogger', () => {
  before(async () => {
    await fs.mkdir(TEST_LOG_DIR, { recursive: true });
  });

  after(async () => {
    await fs.rm(TEST_LOG_DIR, { recursive: true, force: true });
  });

  it('should log event to file', async () => {
    const logger = new AuditLogger(TEST_LOG_DIR);

    await logger.logEvent(
      'RemoteAccess',
      'ssh_login',
      'operator1',
      { sourceIp: '10.0.0.5', duration: 1200 },
      '10.0.0.5',
      'success'
    );

    const currentMonth = new Date().toISOString().slice(0, 7);
    const logFile = path.join(TEST_LOG_DIR, `audit-${currentMonth}.log`);

    const content = await fs.readFile(logFile, 'utf-8');
    assert.ok(content.length > 0);

    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.category, 'RemoteAccess');
    assert.strictEqual(entry.action, 'ssh_login');
    assert.strictEqual(entry.userId, 'operator1');
  });

  it('should query logs with filter', async () => {
    const logger = new AuditLogger(TEST_LOG_DIR);

    await logger.logEvent(
      'FileChange',
      'file_modified',
      'system',
      { filePath: '/etc/config' },
      undefined,
      'success'
    );

    await logger.logEvent(
      'ConfigChange',
      'config_updated',
      'admin',
      { configKey: 'setting1' },
      undefined,
      'success'
    );

    const logs = await logger.queryLogs({
      category: 'FileChange',
    });

    assert.ok(logs.length > 0);
    assert.ok(logs.every((l: { category: string }) => l.category === 'FileChange'));
  });

  it('should export logs as JSON', async () => {
    const logger = new AuditLogger(TEST_LOG_DIR);

    const startDate = new Date().toISOString();
    await logger.logEvent(
      'SystemEvent',
      'agent_started',
      'system',
      { version: '1.0.0' },
      undefined,
      'success'
    );

    const json = await logger.exportLogs(startDate, new Date().toISOString(), 'json');

    assert.ok(json);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
  });

  it('should export logs as CSV', async () => {
    const logger = new AuditLogger(TEST_LOG_DIR);

    const startDate = new Date().toISOString();
    await logger.logEvent(
      'SystemEvent',
      'agent_stopped',
      'system',
      { version: '1.0.0' },
      undefined,
      'success'
    );

    const csv = await logger.exportLogs(startDate, new Date().toISOString(), 'csv');

    assert.ok(csv);
    assert.ok(csv.includes('EventID,Timestamp,Category'));
  });

  it('should filter logs by date range', async () => {
    const logger = new AuditLogger(TEST_LOG_DIR);

    const oldDate = '2020-01-01T00:00:00Z';
    const recentDate = new Date().toISOString();

    const logs = await logger.queryLogs({
      startDate: oldDate,
      endDate: recentDate,
    });

    assert.ok(Array.isArray(logs));
    for (const log of logs) {
      assert.ok(log.timestamp >= oldDate);
      assert.ok(log.timestamp <= recentDate);
    }
  });
});
