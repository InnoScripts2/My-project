import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { checkLiveness, checkReadiness, getSystemInfo } from './healthCheck.js';
import { InMemoryStore } from '../storage/InMemoryStore.js';
describe('Health Checks', () => {
    describe('getSystemInfo', () => {
        it('возвращает корректную системную информацию', () => {
            const info = getSystemInfo();
            assert.ok(info.cpu);
            assert.ok(typeof info.cpu.cores === 'number');
            assert.ok(info.cpu.cores > 0);
            assert.ok(typeof info.cpu.usage === 'number');
            assert.ok(info.cpu.usage >= 0);
            assert.ok(info.memory);
            assert.ok(info.memory.totalMb > 0);
            assert.ok(info.memory.usedMb >= 0);
            assert.ok(info.memory.freeMb >= 0);
            assert.ok(info.memory.usagePercent >= 0 && info.memory.usagePercent <= 100);
            assert.ok(typeof info.uptime === 'number');
            assert.ok(info.uptime >= 0);
            assert.ok(Array.isArray(info.loadAverage));
            assert.strictEqual(info.loadAverage.length, 3);
        });
    });
    describe('checkLiveness', () => {
        it('возвращает pass для работающего процесса', () => {
            const result = checkLiveness();
            assert.strictEqual(result.status, 'pass');
            assert.strictEqual(result.serviceId, 'kiosk-agent');
            assert.ok(result.checks);
            assert.ok(result.checks.uptime);
            assert.strictEqual(result.checks.uptime.status, 'pass');
            assert.ok(result.checks.memory);
        });
        it('содержит корректные метаданные', () => {
            const result = checkLiveness();
            assert.ok(result.version);
            assert.ok(result.serviceId);
            assert.ok(result.description);
        });
    });
    describe('checkReadiness', () => {
        it('проверяет persistence и возвращает pass', async () => {
            const store = new InMemoryStore();
            const safeSys = () => ({
                cpu: { usage: 5, cores: 4 },
                memory: { totalMb: 1024, usedMb: 128, freeMb: 896, usagePercent: 12 },
                uptime: 100,
                loadAverage: [0, 0, 0],
            });
            const result = await checkReadiness(store, { getSystemInfoFn: safeSys });
            assert.strictEqual(result.status, 'pass');
            assert.ok(result.checks);
            assert.ok(result.checks.persistence);
            assert.strictEqual(result.checks.persistence.status, 'pass');
            assert.ok(result.checks.memory);
        });
        it('возвращает fail при недоступности persistence', async () => {
            const failingStore = {
                async ping() {
                    throw new Error('Connection refused');
                },
                async createSession() { return ''; },
                async finishSession() { },
                async recordThicknessPoint() { },
            };
            const result = await checkReadiness(failingStore);
            assert.strictEqual(result.checks?.persistence?.status, 'fail');
            assert.ok(result.checks?.persistence?.output?.includes('Connection refused'));
        });
        it('возвращает warn при высокой latency persistence', async () => {
            const slowStore = {
                async ping() {
                    await new Promise(resolve => setTimeout(resolve, 2500));
                },
                async createSession() { return ''; },
                async finishSession() { },
                async recordThicknessPoint() { },
            };
            const result = await checkReadiness(slowStore);
            assert.strictEqual(result.checks?.persistence?.status, 'warn');
            assert.ok(result.notes?.some(n => n.includes('latency')));
        });
    });
});
