/**
 * Retry политика для операций с устройствами
 */

export interface RetryPolicyOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

/**
 * Вычисление задержки с экспоненциальным backoff и jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  options: RetryPolicyOptions
): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Выполнить операцию с retry политикой
 */
export async function retryWithPolicy<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryPolicyOptions = DEFAULT_RETRY_POLICY,
  onAttemptStart?: (attempt: number, delayMs: number) => void,
  onAttemptFailed?: (attempt: number, error: unknown) => void
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delayMs = calculateBackoffDelay(attempt - 1, options);
        onAttemptStart?.(attempt, delayMs);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        onAttemptStart?.(attempt, 0);
      }

      return await operation(attempt);
    } catch (error) {
      lastError = error;
      onAttemptFailed?.(attempt, error);

      if (attempt === options.maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Загрузить конфигурацию retry политики из переменных окружения
 */
export function loadRetryPolicyConfig(): RetryPolicyOptions {
  return {
    maxAttempts: parseInt(process.env.DEVICE_RETRY_MAX_ATTEMPTS || '3', 10),
    baseDelayMs: parseInt(process.env.DEVICE_RETRY_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.DEVICE_RETRY_MAX_DELAY_MS || '10000', 10),
    backoffMultiplier: parseFloat(process.env.DEVICE_RETRY_BACKOFF_MULTIPLIER || '2'),
    jitterFactor: parseFloat(process.env.DEVICE_RETRY_JITTER_FACTOR || '0.2'),
  };
}
