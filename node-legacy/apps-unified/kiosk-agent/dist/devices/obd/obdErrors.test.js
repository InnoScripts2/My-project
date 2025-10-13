/**
 * Тесты для нормализации ошибок OBD
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeObdError, formatObdError, serializeObdError, } from './obdErrors.js';
await describe('normalizeObdError', async () => {
    await it('распознаёт ENOENT как adapter_not_found', () => {
        const error = new Error('ENOENT: no such file or directory');
        const normalized = normalizeObdError(error);
        assert.strictEqual(normalized.code, 'adapter_not_found');
        assert.strictEqual(normalized.subtype, 'serial_port_error');
        assert.ok(normalized.userMessage.includes('не найден'));
    });
    await it('распознаёт TIMEOUT как command_timeout', () => {
        const error = new Error('TIMEOUT waiting for response');
        const normalized = normalizeObdError(error);
        assert.strictEqual(normalized.code, 'command_timeout');
        assert.strictEqual(normalized.subtype, 'timeout_error');
    });
    await it('распознаёт NO DATA', () => {
        const error = 'NO DATA';
        const normalized = normalizeObdError(error);
        assert.strictEqual(normalized.code, 'no_data');
        assert.strictEqual(normalized.subtype, 'data_error');
        assert.ok(normalized.userMessage.includes('Нет данных'));
    });
    await it('добавляет контекст к ошибке', () => {
        const error = new Error('Some error');
        const context = { port: 'COM3', baudRate: 38400 };
        const normalized = normalizeObdError(error, context);
        assert.deepStrictEqual(normalized.context, context);
    });
    await it('возвращает unknown_error для неизвестных ошибок', () => {
        const error = new Error('Something completely unexpected');
        const normalized = normalizeObdError(error);
        assert.strictEqual(normalized.code, 'unknown_error');
        assert.strictEqual(normalized.subtype, 'generic');
    });
    await it('сохраняет уже нормализованную ошибку', () => {
        const error = {
            code: 'adapter_not_found',
            subtype: 'serial_port_error',
            message: 'Test message',
            userMessage: 'Test user message',
            timestamp: '2024-01-01T00:00:00.000Z',
        };
        const normalized = normalizeObdError(error);
        assert.strictEqual(normalized.code, error.code);
        assert.strictEqual(normalized.subtype, error.subtype);
    });
});
await describe('formatObdError', async () => {
    await it('форматирует нормализованную ошибку', () => {
        const error = {
            code: 'adapter_not_found',
            subtype: 'serial_port_error',
            message: 'Technical message',
            userMessage: 'Адаптер не найден',
            timestamp: new Date().toISOString(),
        };
        const formatted = formatObdError(error);
        assert.strictEqual(formatted, 'Адаптер не найден');
    });
    await it('форматирует сырую ошибку', () => {
        const error = new Error('ENOENT: port not found');
        const formatted = formatObdError(error);
        assert.ok(formatted.includes('не найден'));
    });
});
await describe('serializeObdError', async () => {
    await it('сериализует ошибку для фронтенда', () => {
        const error = new Error('TIMEOUT');
        const serialized = serializeObdError(error);
        assert.strictEqual(serialized.error, true);
        assert.strictEqual(serialized.code, 'command_timeout');
        assert.ok(serialized.message);
        assert.ok(serialized.timestamp);
    });
    await it('включает детали ошибки', () => {
        const error = new Error('NO DATA from vehicle');
        const serialized = serializeObdError(error);
        assert.strictEqual(serialized.details, 'NO DATA from vehicle');
    });
});
