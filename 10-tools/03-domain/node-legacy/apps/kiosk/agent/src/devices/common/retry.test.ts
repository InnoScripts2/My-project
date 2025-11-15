import { describe, it } from 'node:test';
import assert from 'node:assert';
import { retryWithPolicy, calculateBackoffDelay, loadRetryPolicyConfig, DEFAULT_RETRY_POLICY } from './retry.js';

await describe('calculateBackoffDelay', async () => {
  await it('should calculate delay with exponential backoff', () => {
    const options = {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    const delay0 = calculateBackoffDelay(0, options);
    const delay1 = calculateBackoffDelay(1, options);
    const delay2 = calculateBackoffDelay(2, options);

    assert.strictEqual(delay0, 100);
    assert.strictEqual(delay1, 200);
    assert.strictEqual(delay2, 400);
  });

  await it('should cap delay at maxDelayMs', () => {
    const options = {
      maxAttempts: 10,
      baseDelayMs: 100,
      maxDelayMs: 500,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    const delay5 = calculateBackoffDelay(5, options);
    assert.ok(delay5 <= 500);
  });

  await it('should apply jitter', () => {
    const options = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
    };

    // Jitter для attempt 1: base = 1000 * 2^1 = 2000
    // Jitter range: 2000 ± (2000 * 0.3) = [1400, 2600]
    const delay1 = calculateBackoffDelay(1, options);
    assert.ok(delay1 >= 1400 && delay1 <= 2600);
  });
});

await describe('retryWithPolicy', async () => {
  await it('should return result on success', async () => {
    const result = await retryWithPolicy(
      async () => 'success',
      DEFAULT_RETRY_POLICY
    );
    assert.strictEqual(result, 'success');
  });

  await it('should retry on failure', async () => {
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

  await it('should throw after max attempts', async () => {
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

  await it('should call callbacks', async () => {
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
  await it('should load default config', () => {
    const config = loadRetryPolicyConfig();
    assert.strictEqual(config.maxAttempts, 3);
    assert.strictEqual(config.baseDelayMs, 1000);
  });
});
