import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { DevSmsAdapter, getSmsConfigFromEnv } from './sms-adapter.js';
describe('SMS Adapter', () => {
    describe('getSmsConfigFromEnv', () => {
        it('возвращает null если нет обязательных переменных', () => {
            const oldKey = process.env.SMS_API_KEY;
            const oldSender = process.env.SMS_SENDER_ID;
            delete process.env.SMS_API_KEY;
            delete process.env.SMS_SENDER_ID;
            const config = getSmsConfigFromEnv();
            assert.strictEqual(config, null);
            if (oldKey)
                process.env.SMS_API_KEY = oldKey;
            if (oldSender)
                process.env.SMS_SENDER_ID = oldSender;
        });
        it('возвращает конфигурацию с обязательными полями', () => {
            const oldKey = process.env.SMS_API_KEY;
            const oldSender = process.env.SMS_SENDER_ID;
            process.env.SMS_API_KEY = 'test-api-key';
            process.env.SMS_SENDER_ID = 'AutoService';
            const config = getSmsConfigFromEnv();
            assert.ok(config);
            assert.strictEqual(config.apiKey, 'test-api-key');
            assert.strictEqual(config.senderId, 'AutoService');
            if (oldKey)
                process.env.SMS_API_KEY = oldKey;
            else
                delete process.env.SMS_API_KEY;
            if (oldSender)
                process.env.SMS_SENDER_ID = oldSender;
            else
                delete process.env.SMS_SENDER_ID;
        });
        it('парсит опциональный API URL', () => {
            const oldKey = process.env.SMS_API_KEY;
            const oldSender = process.env.SMS_SENDER_ID;
            const oldUrl = process.env.SMS_API_URL;
            process.env.SMS_API_KEY = 'test-api-key';
            process.env.SMS_SENDER_ID = 'AutoService';
            process.env.SMS_API_URL = 'https://sms.example.com/api';
            const config = getSmsConfigFromEnv();
            assert.ok(config);
            assert.strictEqual(config.apiUrl, 'https://sms.example.com/api');
            if (oldKey)
                process.env.SMS_API_KEY = oldKey;
            else
                delete process.env.SMS_API_KEY;
            if (oldSender)
                process.env.SMS_SENDER_ID = oldSender;
            else
                delete process.env.SMS_SENDER_ID;
            if (oldUrl)
                process.env.SMS_API_URL = oldUrl;
            else
                delete process.env.SMS_API_URL;
        });
    });
    describe('DevSmsAdapter', () => {
        it('логирует payload в DEV режиме', async () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'DEV';
            const sms = new DevSmsAdapter();
            await assert.doesNotReject(async () => {
                await sms.send({
                    to: '+79991234567',
                    message: 'Ваш отчёт готов: https://example.com/report'
                });
            });
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
        it('бросает ошибку в PROD режиме', async () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'PROD';
            const sms = new DevSmsAdapter();
            await assert.rejects(async () => {
                await sms.send({
                    to: '+79991234567',
                    message: 'Test message'
                });
            }, /not implemented for PROD/);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
    });
});
