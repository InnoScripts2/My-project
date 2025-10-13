/**
 * HardeningChecklist Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HardeningChecklist } from '../HardeningChecklist.js';

describe('HardeningChecklist', () => {
  it('should run all checks and return report', async () => {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();

    assert.ok(report);
    assert.ok(report.timestamp);
    assert.ok(report.platform);
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 12);
    assert.ok(['passed', 'failed', 'warning'].includes(report.overallStatus));
    assert.ok(Array.isArray(report.recommendations));
  });

  it('should export report as JSON', async () => {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();
    const json = checklist.exportReport(report, 'json');

    assert.ok(json);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.timestamp, report.timestamp);
  });

  it('should export report as HTML', async () => {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();
    const html = checklist.exportReport(report, 'html');

    assert.ok(html);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes(report.platform));
  });

  it('should check unprivileged user status', async () => {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();

    const userCheck = report.checks.find((c: { id: string }) => c.id === 'unprivileged_user');
    assert.ok(userCheck);
    assert.strictEqual(userCheck.category, 'User');
  });

  it('should include remediation for failed checks', async () => {
    const checklist = new HardeningChecklist();
    const report = await checklist.runChecks();

    const failedChecks = report.checks.filter((c: { status: string }) => c.status === 'failed');
    for (const check of failedChecks) {
      assert.ok(check.remediation);
    }
  });
});
