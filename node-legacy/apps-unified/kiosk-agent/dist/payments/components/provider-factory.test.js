import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { createPaymentProvider, getEnvironmentFromEnv } from './provider-factory.js';
describe('Payment Provider Factory', () => {
    describe('createPaymentProvider', () => {
        it('создаёт DevPaymentProvider для DEV окружения', () => {
            const provider = createPaymentProvider('DEV');
            assert.ok(provider);
            assert.ok(typeof provider.createPaymentIntent === 'function');
        });
        it('создаёт DevPaymentProvider для QA окружения', () => {
            const provider = createPaymentProvider('QA');
            assert.ok(provider);
            assert.ok(typeof provider.createPaymentIntent === 'function');
        });
        it('бросает ошибку для PROD окружения', () => {
            assert.throws(() => createPaymentProvider('PROD'), /not implemented for PROD/);
        });
    });
    describe('getEnvironmentFromEnv', () => {
        it('возвращает значение из AGENT_ENV', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'PROD';
            assert.strictEqual(getEnvironmentFromEnv(), 'PROD');
            process.env.AGENT_ENV = 'QA';
            assert.strictEqual(getEnvironmentFromEnv(), 'QA');
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
        it('возвращает DEV по умолчанию', () => {
            const oldEnv = process.env.AGENT_ENV;
            delete process.env.AGENT_ENV;
            assert.strictEqual(getEnvironmentFromEnv(), 'DEV');
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
        });
        it('возвращает DEV для невалидных значений', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'INVALID';
            assert.strictEqual(getEnvironmentFromEnv(), 'DEV');
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
    });
    describe('DevPaymentProvider integration', () => {
        it('создаёт и получает статус интента', async () => {
            const provider = createPaymentProvider('DEV');
            const intent = await provider.createPaymentIntent(350, 'RUB', { test: true });
            assert.ok(intent.id);
            assert.strictEqual(intent.amount, 350);
            assert.strictEqual(intent.currency, 'RUB');
            assert.strictEqual(intent.status, 'pending');
            const status = await provider.getStatus(intent.id);
            assert.strictEqual(status, 'pending');
        });
        it('подтверждает интент в DEV режиме', async () => {
            const provider = createPaymentProvider('DEV');
            const intent = await provider.createPaymentIntent(480, 'RUB');
            const confirmed = await provider.confirmDevOnly(intent.id);
            assert.strictEqual(confirmed.status, 'succeeded');
        });
    });
});
