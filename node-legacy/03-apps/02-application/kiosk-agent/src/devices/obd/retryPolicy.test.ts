/**
 * Тесты для retry policy
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateBackoffDelay, retryWithPolicy, loadRetryPolicyConfig } from './retryPolicy.js';

await describe('calculateBackoffDelay', async () => {
  await it('возвращает базовую задержку для первой попытки', () => {
    const delay = calculateBackoffDelay(1, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });
    assert.strictEqual(delay, 1000);
  });

  await it('увеличивает задержку экспоненциально', () => {
    const delay2 = calculateBackoffDelay(2, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });
    assert.strictEqual(delay2, 2000);

    const delay3 = calculateBackoffDelay(3, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });
    assert.strictEqual(delay3, 4000);
  });

  await it('ограничивает задержку максимальным значением', () => {
    const delay = calculateBackoffDelay(10, {
      maxAttempts: 10,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });
    assert.strictEqual(delay, 5000);
  });

  await it('добавляет jitter', () => {
    const delay1 = calculateBackoffDelay(1, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
    });
    // Jitter должен быть в диапазоне ±30% от 1000ms
    assert.ok(delay1 >= 700 && delay1 <= 1300);
  });
});

await describe('retryWithPolicy', async () => {
  await it('возвращает результат при успешной операции', async () => {
    const result = await retryWithPolicy(
      async () => 'success',
      {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      }
    );
    assert.strictEqual(result, 'success');
  });

  await it('повторяет операцию при неудаче', async () => {
    let attempts = 0;
    const result = await retryWithPolicy(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      {
        maxAttempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 1.5,
        jitterFactor: 0,
      }
    );
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  await it('бросает ошибку после исчерпания попыток', async () => {
    await assert.rejects(
      async () => {
        await retryWithPolicy(
          async () => {
            throw new Error('persistent failure');
          },
          {
            maxAttempts: 3,
            baseDelayMs: 10,
            maxDelayMs: 100,
            backoffMultiplier: 1.5,
            jitterFactor: 0,
          }
        );
      },
      { message: 'persistent failure' }
    );
  });

  await it('вызывает колбэки при попытках', async () => {
    const starts: number[] = [];
    const failures: number[] = [];

    await retryWithPolicy(
      async (attempt) => {
        if (attempt < 2) throw new Error('fail');
        return 'success';
      },
      {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 1.5,
        jitterFactor: 0,
      },
      (attempt) => starts.push(attempt),
      (attempt) => failures.push(attempt)
    );

    assert.deepStrictEqual(starts, [1, 2]);
    assert.deepStrictEqual(failures, [1]);
  });
});

await describe('loadRetryPolicyConfig', async () => {
  await it('загружает дефолтную конфигурацию без ENV', () => {
    const config = loadRetryPolicyConfig();
    assert.strictEqual(config.connect.maxAttempts, 5);
    assert.strictEqual(config.init.maxAttempts, 3);
    assert.strictEqual(config.operation.maxAttempts, 3);
  });
});
