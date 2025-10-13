/**
 * Тесты для централизованного логгера
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CentralizedLogger, type LogEntry } from './CentralizedLogger.js';

describe('CentralizedLogger', async () => {
  let logger: CentralizedLogger;

  beforeEach(() => {
    logger = new CentralizedLogger({ enableConsole: false });
  });

  await describe('log', async () => {
    await it('записывает лог с базовыми параметрами', () => {
      logger.info('general', 'Test message');
      const entries = logger.tail(1);
      
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].level, 'info');
      assert.strictEqual(entries[0].channel, 'general');
      assert.strictEqual(entries[0].message, 'Test message');
      assert.ok(entries[0].id);
      assert.ok(entries[0].timestamp);
    });

    await it('записывает лог с контекстом', () => {
      logger.error('obd', 'Connection failed', {
        context: { port: 'COM3', baudRate: 38400 },
      });
      
      const entries = logger.tail(1);
      assert.deepStrictEqual(entries[0].context, { port: 'COM3', baudRate: 38400 });
    });

    await it('записывает лог с requestId и sessionId', () => {
      logger.info('payments', 'Payment created', {
        requestId: 'req_123',
        sessionId: 'sess_456',
      });
      
      const entries = logger.tail(1);
      assert.strictEqual(entries[0].requestId, 'req_123');
      assert.strictEqual(entries[0].sessionId, 'sess_456');
    });
  });

  await describe('маскирование данных', async () => {
    await it('маскирует email адреса', () => {
      logger.info('general', 'User email: test@example.com');
      const entries = logger.tail(1);
      
      assert.strictEqual(entries[0].message, 'User email: ***');
      assert.strictEqual(entries[0].masked, true);
    });

    await it('маскирует телефонные номера', () => {
      logger.info('general', 'Phone: 89991234567');
      const entries = logger.tail(1);
      
      assert.strictEqual(entries[0].message, 'Phone: ***');
      assert.strictEqual(entries[0].masked, true);
    });

    await it('маскирует потенциальные токены', () => {
      logger.info('general', 'Token: abc123def456789012345678901234567890');
      const entries = logger.tail(1);
      
      assert.ok(entries[0].message.includes('***'));
      assert.strictEqual(entries[0].masked, true);
    });

    await it('маскирует данные в контексте', () => {
      logger.info('general', 'User action', {
        context: { email: 'test@example.com' },
      });
      const entries = logger.tail(1);
      
      assert.strictEqual(entries[0].context?.email, '***');
    });
  });

  await describe('query', async () => {
    beforeEach(() => {
      logger.debug('obd', 'Debug message');
      logger.info('payments', 'Info message');
      logger.warn('obd', 'Warning message');
      logger.error('thk', 'Error message');
      logger.fatal('general', 'Fatal message');
    });

    await it('фильтрует по уровню', () => {
      const errors = logger.query({ level: 'error' });
      assert.strictEqual(errors.length, 2); // error + fatal
      assert.ok(errors.every((e) => e.level === 'error' || e.level === 'fatal'));
    });

    await it('фильтрует по каналу', () => {
      const obdLogs = logger.query({ channel: 'obd' });
      assert.strictEqual(obdLogs.length, 2); // debug + warn
      assert.ok(obdLogs.every((e) => e.channel === 'obd'));
    });

    await it('фильтрует по поисковой строке', () => {
      const warnings = logger.query({ search: 'warning' });
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.toLowerCase().includes('warning'));
    });

    await it('ограничивает количество результатов', () => {
      const limited = logger.query({ limit: 2 });
      assert.strictEqual(limited.length, 2);
    });
  });

  await describe('tail', async () => {
    await it('возвращает последние N записей', () => {
      for (let i = 0; i < 10; i++) {
        logger.info('general', `Message ${i}`);
      }
      
      const last3 = logger.tail(3);
      assert.strictEqual(last3.length, 3);
      assert.strictEqual(last3[2].message, 'Message 9');
    });
  });

  await describe('getStats', async () => {
    beforeEach(() => {
      logger.info('obd', 'Message 1');
      logger.warn('obd', 'Message 2');
      logger.error('payments', 'Message 3');
      logger.info('thk', 'Message 4');
    });

    await it('подсчитывает статистику по уровням', () => {
      const stats = logger.getStats();
      assert.strictEqual(stats.totalEntries, 4);
      assert.strictEqual(stats.byLevel.info, 2);
      assert.strictEqual(stats.byLevel.warn, 1);
      assert.strictEqual(stats.byLevel.error, 1);
    });

    await it('подсчитывает статистику по каналам', () => {
      const stats = logger.getStats();
      assert.strictEqual(stats.byChannel.obd, 2);
      assert.strictEqual(stats.byChannel.payments, 1);
      assert.strictEqual(stats.byChannel.thk, 1);
    });

    await it('возвращает временные границы', () => {
      const stats = logger.getStats();
      assert.ok(stats.oldestEntry);
      assert.ok(stats.newestEntry);
    });
  });

  await describe('clear', async () => {
    await it('очищает все логи', () => {
      logger.info('general', 'Message');
      logger.clear();
      
      const entries = logger.tail(10);
      assert.strictEqual(entries.length, 0);
    });
  });

  await describe('минимальный уровень', async () => {
    await it('не записывает логи ниже минимального уровня', () => {
      const strictLogger = new CentralizedLogger({
        enableConsole: false,
        minLevel: 'warn',
      });
      
      strictLogger.debug('general', 'Debug');
      strictLogger.info('general', 'Info');
      strictLogger.warn('general', 'Warning');
      
      const entries = strictLogger.tail(10);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].level, 'warn');
    });
  });
});
