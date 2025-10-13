/**
 * Tests for config loader and schema validation
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigLoader } from './loader.js';
import { ConfigSchema } from './schema.js';
describe('Config Schema Validation', () => {
    it('должен валидировать корректную конфигурацию', () => {
        const config = ConfigSchema.parse({
            AGENT_ENV: 'DEV',
            PORT: 4003,
            SQLITE_PATH: './data/kiosk.db',
            LOG_LEVEL: 'info'
        });
        assert.strictEqual(config.AGENT_ENV, 'DEV');
        assert.strictEqual(config.PORT, 4003);
        assert.strictEqual(config.LOG_LEVEL, 'info');
    });
    it('должен использовать значения по умолчанию', () => {
        const config = ConfigSchema.parse({});
        assert.strictEqual(config.AGENT_ENV, 'DEV');
        assert.strictEqual(config.PORT, 4003);
        assert.strictEqual(config.SQLITE_PATH, './data/kiosk.db');
        assert.strictEqual(config.LOG_LEVEL, 'info');
    });
    it('должен преобразовывать строки в числа', () => {
        const config = ConfigSchema.parse({
            PORT: '5000',
            HEALTH_CHECK_INTERVAL: '120'
        });
        assert.strictEqual(config.PORT, 5000);
        assert.strictEqual(config.HEALTH_CHECK_INTERVAL, 120);
    });
    it('должен парсить JSON в LOCK_CONFIGS', () => {
        const config = ConfigSchema.parse({
            LOCK_CONFIGS: JSON.stringify([
                { deviceType: 'thickness', driverType: 'mock' },
                { deviceType: 'obd', driverType: 'gpio' }
            ])
        });
        assert.ok(config.LOCK_CONFIGS);
        assert.strictEqual(config.LOCK_CONFIGS.length, 2);
        assert.strictEqual(config.LOCK_CONFIGS[0]?.deviceType, 'thickness');
    });
    it('должен отклонить некорректные значения', () => {
        assert.throws(() => {
            ConfigSchema.parse({
                AGENT_ENV: 'INVALID'
            });
        });
        assert.throws(() => {
            ConfigSchema.parse({
                PORT: 100 // Too low
            });
        });
        assert.throws(() => {
            ConfigSchema.parse({
                LOG_LEVEL: 'invalid'
            });
        });
    });
});
describe('ConfigLoader', () => {
    let loader;
    const originalEnv = { ...process.env };
    before(() => {
        process.env.AGENT_ENV = 'DEV';
        process.env.PORT = '4003';
        process.env.LOG_LEVEL = 'info';
    });
    after(() => {
        process.env = originalEnv;
    });
    it('должен загрузить конфигурацию из переменных окружения', () => {
        loader = new ConfigLoader();
        assert.strictEqual(loader.get('AGENT_ENV'), 'DEV');
        assert.strictEqual(loader.get('PORT'), 4003);
        assert.strictEqual(loader.get('LOG_LEVEL'), 'info');
    });
    it('должен вернуть всю конфигурацию', () => {
        loader = new ConfigLoader();
        const config = loader.getAll();
        assert.ok(config.AGENT_ENV);
        assert.ok(config.PORT);
        assert.ok(config.LOG_LEVEL);
    });
    it('должен санитизировать чувствительные данные', () => {
        process.env.SUPABASE_KEY = 'secret-key';
        process.env.ADMIN_API_KEYS = JSON.stringify({ admin1: 'secret' });
        loader = new ConfigLoader();
        const sanitized = loader.getAll(true);
        assert.strictEqual(sanitized.SUPABASE_KEY, '***');
        assert.strictEqual(sanitized.ADMIN_API_KEYS.admin1, '***');
    });
    it('должен поддерживать watchers', async () => {
        loader = new ConfigLoader();
        let watcherCalled = false;
        loader.watch('LOG_LEVEL', () => {
            watcherCalled = true;
        });
        process.env.LOG_LEVEL = 'debug';
        await loader.reload();
        assert.strictEqual(watcherCalled, true);
        assert.strictEqual(loader.get('LOG_LEVEL'), 'debug');
    });
    it('должен определять неизменяемые ключи', () => {
        loader = new ConfigLoader();
        assert.strictEqual(loader.isImmutable('SQLITE_PATH'), true);
        assert.strictEqual(loader.isImmutable('AGENT_ENV'), true);
        assert.strictEqual(loader.isImmutable('PORT'), false);
    });
});
