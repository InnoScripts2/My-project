import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { WebhookValidator, createWebhookValidator } from './webhook-validator.js';
describe('Webhook Validator', () => {
    describe('WebhookValidator', () => {
        it('валидирует корректную DEV подпись', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'DEV';
            const validator = new WebhookValidator();
            const payload = JSON.stringify({ intentId: 'dev_123', status: 'succeeded' });
            const signature = WebhookValidator.createDevSignature(payload);
            const result = validator.validate(payload, signature);
            assert.strictEqual(result.valid, true);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
        it('отклоняет некорректную подпись', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'DEV';
            const validator = new WebhookValidator();
            const payload = JSON.stringify({ intentId: 'dev_123', status: 'succeeded' });
            const wrongSignature = 'wrong-signature';
            const result = validator.validate(payload, wrongSignature);
            assert.strictEqual(result.valid, false);
            assert.ok(result.error);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
        it('отклоняет модифицированный payload', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'DEV';
            const validator = new WebhookValidator();
            const payload = JSON.stringify({ intentId: 'dev_123', status: 'succeeded' });
            const signature = WebhookValidator.createDevSignature(payload);
            const modifiedPayload = JSON.stringify({ intentId: 'dev_123', status: 'failed' });
            const result = validator.validate(modifiedPayload, signature);
            assert.strictEqual(result.valid, false);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
        it('использует секрет из переменных окружения', () => {
            const oldEnv = process.env.AGENT_ENV;
            const oldSecret = process.env.WEBHOOK_SECRET;
            process.env.AGENT_ENV = 'DEV';
            process.env.WEBHOOK_SECRET = 'custom-secret';
            const validator = new WebhookValidator();
            const payload = JSON.stringify({ test: 'data' });
            const signature = WebhookValidator.createDevSignature(payload, 'custom-secret');
            const result = validator.validate(payload, signature);
            assert.strictEqual(result.valid, true);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
            if (oldSecret)
                process.env.WEBHOOK_SECRET = oldSecret;
            else
                delete process.env.WEBHOOK_SECRET;
        });
        it('возвращает ошибку в PROD режиме', () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'PROD';
            const validator = new WebhookValidator();
            const payload = JSON.stringify({ test: 'data' });
            const signature = 'any-signature';
            const result = validator.validate(payload, signature);
            assert.strictEqual(result.valid, false);
            assert.ok(result.error?.includes('not implemented for PROD'));
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
    });
    describe('createWebhookValidator', () => {
        it('создаёт экземпляр валидатора', () => {
            const validator = createWebhookValidator();
            assert.ok(validator);
            assert.ok(typeof validator.validate === 'function');
        });
    });
    describe('WebhookValidator.createDevSignature', () => {
        it('создаёт детерминированную подпись', () => {
            const payload = JSON.stringify({ test: 'data' });
            const secret = 'test-secret';
            const signature1 = WebhookValidator.createDevSignature(payload, secret);
            const signature2 = WebhookValidator.createDevSignature(payload, secret);
            assert.strictEqual(signature1, signature2);
        });
        it('создаёт разные подписи для разных payload', () => {
            const payload1 = JSON.stringify({ test: 'data1' });
            const payload2 = JSON.stringify({ test: 'data2' });
            const secret = 'test-secret';
            const signature1 = WebhookValidator.createDevSignature(payload1, secret);
            const signature2 = WebhookValidator.createDevSignature(payload2, secret);
            assert.notStrictEqual(signature1, signature2);
        });
        it('создаёт разные подписи для разных секретов', () => {
            const payload = JSON.stringify({ test: 'data' });
            const signature1 = WebhookValidator.createDevSignature(payload, 'secret1');
            const signature2 = WebhookValidator.createDevSignature(payload, 'secret2');
            assert.notStrictEqual(signature1, signature2);
        });
    });
});
