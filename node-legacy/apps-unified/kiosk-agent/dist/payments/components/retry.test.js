import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { PaymentStatusPoller, createPaymentStatusPoller } from './retry.js';
describe('Payment Status Poller', () => {
    // Mock provider для тестов
    class MockProvider {
        constructor() {
            this.statuses = new Map();
            this.currentIndex = new Map();
        }
        setStatusSequence(intentId, statuses) {
            this.statuses.set(intentId, statuses);
            this.currentIndex.set(intentId, 0);
        }
        async getStatus(intentId) {
            const sequence = this.statuses.get(intentId) || ['pending'];
            const index = this.currentIndex.get(intentId) || 0;
            const status = sequence[Math.min(index, sequence.length - 1)];
            this.currentIndex.set(intentId, index + 1);
            return status;
        }
        async createPaymentIntent() {
            return {
                id: 'mock-intent',
                amount: 100,
                currency: 'RUB',
                status: 'pending'
            };
        }
        async getIntent(intentId) {
            return {
                id: intentId,
                amount: 100,
                currency: 'RUB',
                status: await this.getStatus(intentId)
            };
        }
        async confirmDevOnly() {
            throw new Error('Not implemented in mock');
        }
        async markManualConfirmation() {
            throw new Error('Not implemented in mock');
        }
    }
    describe('pollStatus', () => {
        it('возвращает статус когда он меняется с pending на succeeded', async () => {
            const provider = new MockProvider();
            provider.setStatusSequence('test-1', ['pending', 'pending', 'succeeded']);
            const poller = new PaymentStatusPoller({
                maxAttempts: 10,
                initialDelayMs: 10,
                maxDelayMs: 50,
                timeoutMs: 5000
            });
            const result = await poller.pollStatus(provider, 'test-1');
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.value, 'succeeded');
            assert.ok(result.attempts >= 3);
        });
        it('возвращает failed статус', async () => {
            const provider = new MockProvider();
            provider.setStatusSequence('test-2', ['pending', 'failed']);
            const poller = new PaymentStatusPoller({
                maxAttempts: 10,
                initialDelayMs: 10,
                maxDelayMs: 50,
                timeoutMs: 5000
            });
            const result = await poller.pollStatus(provider, 'test-2');
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.value, 'failed');
        });
        it('останавливается при достижении maxAttempts', async () => {
            const provider = new MockProvider();
            provider.setStatusSequence('test-3', ['pending', 'pending', 'pending']);
            const poller = new PaymentStatusPoller({
                maxAttempts: 3,
                initialDelayMs: 10,
                maxDelayMs: 50,
                timeoutMs: 10000
            });
            const result = await poller.pollStatus(provider, 'test-3');
            assert.strictEqual(result.success, false);
            assert.ok(result.error);
            assert.strictEqual(result.attempts, 3);
        });
        it('останавливается при таймауте', async () => {
            const provider = new MockProvider();
            provider.setStatusSequence('test-4', ['pending']);
            const poller = new PaymentStatusPoller({
                maxAttempts: 100,
                initialDelayMs: 100,
                maxDelayMs: 200,
                timeoutMs: 500 // Короткий таймаут
            });
            const result = await poller.pollStatus(provider, 'test-4');
            assert.strictEqual(result.success, false);
            assert.ok(result.error?.message.includes('timeout'));
        });
        it('использует экспоненциальный бэкофф', async () => {
            const provider = new MockProvider();
            provider.setStatusSequence('test-5', [
                'pending', 'pending', 'pending', 'succeeded'
            ]);
            const poller = new PaymentStatusPoller({
                maxAttempts: 10,
                initialDelayMs: 10,
                maxDelayMs: 100,
                timeoutMs: 5000
            });
            const startTime = Date.now();
            const result = await poller.pollStatus(provider, 'test-5');
            const duration = Date.now() - startTime;
            assert.strictEqual(result.success, true);
            assert.ok(duration > 30); // Минимум 10 + 20 + ...
        });
    });
    describe('createPaymentStatusPoller', () => {
        it('создаёт поллер с настройками по умолчанию', () => {
            const poller = createPaymentStatusPoller();
            assert.ok(poller);
        });
        it('создаёт поллер с кастомными настройками', () => {
            const poller = createPaymentStatusPoller({
                maxAttempts: 5,
                initialDelayMs: 500
            });
            assert.ok(poller);
        });
    });
});
