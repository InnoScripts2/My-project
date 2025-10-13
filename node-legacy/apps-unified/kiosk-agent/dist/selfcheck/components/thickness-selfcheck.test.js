/**
 * Unit tests for thickness-selfcheck.ts - Thickness gauge self-check
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { runThicknessSelfCheck } from './thickness-selfcheck.js';
describe('runThicknessSelfCheck', () => {
    const originalEnv = process.env.AGENT_ENV;
    after(() => {
        process.env.AGENT_ENV = originalEnv;
    });
    it('returns skipped status in DEV mode when device not available', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        assert.strictEqual(result.overallStatus, 'skipped');
        assert.strictEqual(result.environment, 'DEV');
        assert.ok(result.steps.length > 0);
        assert.strictEqual(result.steps[0].name, 'ble_availability');
        assert.strictEqual(result.steps[0].status, 'skipped');
    });
    it('returns fail status in PROD mode when device not available', async () => {
        process.env.AGENT_ENV = 'PROD';
        const result = await runThicknessSelfCheck();
        assert.strictEqual(result.overallStatus, 'fail');
        assert.strictEqual(result.environment, 'PROD');
        assert.ok(result.steps.length > 0);
    });
    it('includes timestamp in result', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        assert.ok(result.timestamp instanceof Date);
    });
    it('measures total duration', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        assert.ok(result.totalDuration >= 0);
    });
    it('includes device info when available', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        if (result.overallStatus !== 'skipped') {
            assert.ok(result.deviceInfo);
        }
    });
    it('includes step duration measurements', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        for (const step of result.steps) {
            assert.ok(step.duration >= 0);
            assert.ok(typeof step.name === 'string');
            assert.ok(['success', 'failure', 'skipped'].includes(step.status));
        }
    });
    it('includes error message when step fails', async () => {
        process.env.AGENT_ENV = 'PROD';
        const result = await runThicknessSelfCheck();
        const failedSteps = result.steps.filter(s => s.status === 'failure');
        for (const step of failedSteps) {
            assert.ok(step.error);
        }
    });
    it('handles QA environment', async () => {
        process.env.AGENT_ENV = 'QA';
        const result = await runThicknessSelfCheck();
        assert.strictEqual(result.environment, 'QA');
    });
    it('defaults to DEV environment when AGENT_ENV not set', async () => {
        delete process.env.AGENT_ENV;
        const result = await runThicknessSelfCheck();
        assert.strictEqual(result.environment, 'DEV');
    });
    it('returns structured step results', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        assert.ok(Array.isArray(result.steps));
        for (const step of result.steps) {
            assert.ok(step.name);
            assert.ok(['success', 'failure', 'skipped'].includes(step.status));
            assert.ok(typeof step.duration === 'number');
        }
    });
    it('returns consistent result structure', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        assert.ok(['pass', 'fail', 'skipped'].includes(result.overallStatus));
        assert.ok(Array.isArray(result.steps));
        assert.ok(typeof result.totalDuration === 'number');
        assert.ok(result.timestamp instanceof Date);
        assert.ok(['DEV', 'QA', 'PROD'].includes(result.environment));
    });
    it('includes battery level in device info', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        if (result.deviceInfo?.batteryLevel !== undefined) {
            assert.ok(result.deviceInfo.batteryLevel >= 0);
            assert.ok(result.deviceInfo.batteryLevel <= 100);
        }
    });
    it('includes firmware version in device info', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        if (result.deviceInfo?.firmwareVersion !== undefined) {
            assert.ok(typeof result.deviceInfo.firmwareVersion === 'string');
        }
    });
    it('includes model in device info', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        if (result.deviceInfo?.model !== undefined) {
            assert.ok(typeof result.deviceInfo.model === 'string');
        }
    });
    it('includes serial number in device info', async () => {
        process.env.AGENT_ENV = 'DEV';
        const result = await runThicknessSelfCheck();
        if (result.deviceInfo?.serialNumber !== undefined) {
            assert.ok(typeof result.deviceInfo.serialNumber === 'string');
        }
    });
});
