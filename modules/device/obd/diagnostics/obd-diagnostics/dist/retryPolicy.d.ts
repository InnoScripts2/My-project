/**
 * Retry policy для OBD-II операций с backoff и jitter
 * S3, S33: Backoff с jitter для попыток connect/init, конфиг через ENV
 */
export interface RetryPolicyOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterFactor: number;
}
export interface RetryPolicyConfig {
    connect: RetryPolicyOptions;
    init: RetryPolicyOptions;
    operation: RetryPolicyOptions;
}
/**
 * Загружает конфигурацию retry policy из ENV переменных
 * S33: Retry policy конфиг через ENV
 */
export declare function loadRetryPolicyConfig(): RetryPolicyConfig;
/**
 * Вычисляет задержку с exponential backoff и jitter
 * S3: Backoff с jitter для попыток connect/init
 */
export declare function calculateBackoffDelay(attempt: number, options: RetryPolicyOptions): number;
/**
 * Утилита для выполнения операции с retry policy
 */
export declare function retryWithPolicy<T>(operation: (attempt: number) => Promise<T>, options: RetryPolicyOptions, onAttemptStart?: (attempt: number, delayMs: number) => void, onAttemptFailed?: (attempt: number, error: unknown) => void): Promise<T>;
