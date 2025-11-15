import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { DevMailerAdapter, getMailerConfigFromEnv } from './mailer-adapter.js';
describe('Mailer Adapter', () => {
    describe('getMailerConfigFromEnv', () => {
        it('возвращает null если нет обязательных переменных', () => {
            const oldHost = process.env.SMTP_HOST;
            const oldFrom = process.env.SMTP_FROM;
            delete process.env.SMTP_HOST;
            delete process.env.SMTP_FROM;
            const config = getMailerConfigFromEnv();
            assert.strictEqual(config, null);
            if (oldHost)
                process.env.SMTP_HOST = oldHost;
            if (oldFrom)
                process.env.SMTP_FROM = oldFrom;
        });
        it('возвращает конфигурацию с обязательными полями', () => {
            const oldHost = process.env.SMTP_HOST;
            const oldFrom = process.env.SMTP_FROM;
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_FROM = 'noreply@example.com';
            const config = getMailerConfigFromEnv();
            assert.ok(config);
            assert.strictEqual(config.host, 'smtp.example.com');
            assert.strictEqual(config.from, 'noreply@example.com');
            if (oldHost)
                process.env.SMTP_HOST = oldHost;
            else
                delete process.env.SMTP_HOST;
            if (oldFrom)
                process.env.SMTP_FROM = oldFrom;
            else
                delete process.env.SMTP_FROM;
        });
        it('парсит порт и флаг secure', () => {
            const oldHost = process.env.SMTP_HOST;
            const oldFrom = process.env.SMTP_FROM;
            const oldPort = process.env.SMTP_PORT;
            const oldSecure = process.env.SMTP_SECURE;
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_FROM = 'noreply@example.com';
            process.env.SMTP_PORT = '587';
            process.env.SMTP_SECURE = 'true';
            const config = getMailerConfigFromEnv();
            assert.ok(config);
            assert.strictEqual(config.port, 587);
            assert.strictEqual(config.secure, true);
            if (oldHost)
                process.env.SMTP_HOST = oldHost;
            else
                delete process.env.SMTP_HOST;
            if (oldFrom)
                process.env.SMTP_FROM = oldFrom;
            else
                delete process.env.SMTP_FROM;
            if (oldPort)
                process.env.SMTP_PORT = oldPort;
            else
                delete process.env.SMTP_PORT;
            if (oldSecure)
                process.env.SMTP_SECURE = oldSecure;
            else
                delete process.env.SMTP_SECURE;
        });
    });
    describe('DevMailerAdapter', () => {
        it('логирует payload в DEV режиме', async () => {
            const oldEnv = process.env.AGENT_ENV;
            process.env.AGENT_ENV = 'DEV';
            const mailer = new DevMailerAdapter();
            await assert.doesNotReject(async () => {
                await mailer.send({
                    to: 'test@example.com',
                    subject: 'Test Report',
                    htmlBody: '<p>Test content</p>',
                    attachmentPath: '/path/to/report.html'
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
            const mailer = new DevMailerAdapter();
            await assert.rejects(async () => {
                await mailer.send({
                    to: 'test@example.com',
                    subject: 'Test Report',
                    htmlBody: '<p>Test content</p>'
                });
            }, /not implemented for PROD/);
            if (oldEnv)
                process.env.AGENT_ENV = oldEnv;
            else
                delete process.env.AGENT_ENV;
        });
    });
});
