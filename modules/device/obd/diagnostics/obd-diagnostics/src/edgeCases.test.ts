/**
 * Edge case тесты для OBD-II драйверов
 * Проверяем обработку нет адаптера, таймаут, ошибки протокола
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { Elm327Driver } from './Elm327Driver.js';
import type { Elm327Transport } from './transports.js';

class MockTransportNoAdapter extends EventEmitter implements Elm327Transport {
  async open(): Promise<void> {
    throw new Error('ENOENT: no such file or directory');
  }

  async close(): Promise<void> {}

  async write(_data: string): Promise<void> {
    throw new Error('Transport not open');
  }

  onData(_listener: (chunk: string) => void): void {}
  offData(_listener: (chunk: string) => void): void {}
  onClose(_listener: () => void): void {}
  offClose(_listener: () => void): void {}
  onError(_listener: (error: Error) => void): void {}
  offError(_listener: (error: Error) => void): void {}
}

class MockTransportTimeout extends EventEmitter implements Elm327Transport {
  private isOpen = false;

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async write(_data: string): Promise<void> {
    if (!this.isOpen) throw new Error('Transport not open');
    // Симулируем таймаут - не отправляем ответ
  }

  onData(_listener: (chunk: string) => void): void {}
  offData(_listener: (chunk: string) => void): void {}
  onClose(_listener: () => void): void {}
  offClose(_listener: () => void): void {}
  onError(_listener: (error: Error) => void): void {}
  offError(_listener: (error: Error) => void): void {}
}

class MockTransportUnableToConnect extends EventEmitter implements Elm327Transport {
  private dataListener?: (chunk: string) => void;
  private isOpen = false;

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async write(data: string): Promise<void> {
    if (!this.isOpen) throw new Error('Transport not open');

    // Симулируем ответы адаптера
    setTimeout(() => {
      if (this.dataListener) {
        if (data.includes('ATZ')) {
          this.dataListener('ELM327 v1.5\r\n>');
        } else if (data.includes('ATI')) {
          this.dataListener('ELM327 v1.5\r\n>');
        } else if (data.includes('0100') || data.includes('ATSP')) {
          // Симулируем невозможность подключения к автомобилю
          this.dataListener('UNABLE TO CONNECT\r\n>');
        } else {
          this.dataListener('OK\r\n>');
        }
      }
    }, 10);
  }

  onData(listener: (chunk: string) => void): void {
    this.dataListener = listener;
  }

  offData(_listener: (chunk: string) => void): void {
    this.dataListener = undefined;
  }

  onClose(_listener: () => void): void {}
  offClose(_listener: () => void): void {}
  onError(_listener: (error: Error) => void): void {}
  offError(_listener: (error: Error) => void): void {}
}

await describe.skip('OBD Edge Cases (ELM327 legacy) – skipped after BLE migration', async () => {
  await describe('Нет адаптера', async () => {
    await it('выбрасывает ошибку при попытке открыть несуществующий порт', async () => {
      const transport = new MockTransportNoAdapter();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 1000,
      });

      await assert.rejects(
        async () => await driver.open(),
        (error: Error) => {
          assert.ok(error.message.includes('ENOENT') || error.message.includes('no such file'));
          return true;
        }
      );
    });

    await it('драйвер остается закрытым после неудачной попытки открытия', async () => {
      const transport = new MockTransportNoAdapter();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 1000,
      });

      try {
        await driver.open();
      } catch {
        // Ожидаемая ошибка
      }

      // Попытка команды должна провалиться
      const result = await driver.readDtc();
      assert.strictEqual(result.ok, false);
      assert.ok(result.error);
    });
  });

  await describe('Таймаут', async () => {
    await it('возвращает ошибку таймаута при отсутствии ответа', async () => {
      const transport = new MockTransportTimeout();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 100, // Короткий таймаут для быстрого теста
      });

      try {
        await driver.open();
        assert.fail('Должен был произойти таймаут');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.toLowerCase().includes('timeout'));
      }
    });

    await it('увеличивает счетчик таймаутов в метриках', async () => {
      const transport = new MockTransportTimeout();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 100,
      });

      try {
        await driver.open();
      } catch {
        // Ожидаемая ошибка
      }

      const metrics = driver.getMetrics();
      assert.ok(metrics.timeouts > 0, 'Счетчик таймаутов должен быть увеличен');
    });
  });

  await describe('Невозможность подключения к автомобилю', async () => {
    await it('корректно обрабатывает UNABLE TO CONNECT', async () => {
      const transport = new MockTransportUnableToConnect();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 1000,
        protocol: 'auto', // Используем auto protocol
      });

      // open() должен завершиться, но протокол не будет установлен
      // из-за UNABLE TO CONNECT на проверке 0100
      try {
        await driver.open();
        // Драйвер откроется, но с auto протоколом (fallback)
      } catch (error) {
        // Альтернативно может выбросить ошибку
        assert.ok(error instanceof Error);
      }

      const metrics = driver.getMetrics();
      // Проверяем, что был установлен fallback протокол
      assert.ok(
        metrics.protocolUsed === 'auto' || metrics.protocolUsed === undefined,
        'Должен использоваться auto протокол как fallback'
      );

      await driver.close();
    });

    await it('возвращает ошибку при чтении DTC без подключения к авто', async () => {
      const transport = new MockTransportUnableToConnect();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 500,
      });

      try {
        await driver.open();
      } catch {
        // Можем открыть транспорт
      }

      // Попытка чтения DTC должна вернуть ошибку или пустой результат
      const result = await driver.readDtc();
      // Может быть либо ошибка, либо пустой массив
      assert.ok(result.ok === false || (result.ok === true && result.data.length === 0));
    });
  });

  await describe('Метрики', async () => {
    await it('отслеживает неудачные команды', async () => {
      const transport = new MockTransportTimeout();
      const driver = new Elm327Driver({
        transport,
        timeoutMs: 50,
      });

      const metricsBefore = driver.getMetrics();
      assert.strictEqual(metricsBefore.failedCommands, 0);

      try {
        await driver.open();
      } catch {
        // Ожидаемая ошибка
      }

      const metricsAfter = driver.getMetrics();
      assert.ok(metricsAfter.failedCommands > 0, 'Должны быть записаны неудачные команды');
      assert.ok(metricsAfter.lastError, 'Должна быть записана последняя ошибка');
    });
  });
});
