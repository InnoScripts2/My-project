/**
 * Retry policy для OBD-II операций с backoff и jitter
 * S3, S33: Backoff с jitter для попыток connect/init, конфиг через ENV
 */
const DEFAULT_CONFIG = {
    connect: {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.3,
    },
    init: {
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0.2,
    },
    operation: {
        maxAttempts: 3,
        baseDelayMs: 200,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
        jitterFactor: 0.1,
    },
};
/**
 * Загружает конфигурацию retry policy из ENV переменных
 * S33: Retry policy конфиг через ENV
 */
export function loadRetryPolicyConfig() {
    const config = { ...DEFAULT_CONFIG };
    // Connect policy
    if (process.env.OBD_CONNECT_MAX_ATTEMPTS) {
        config.connect.maxAttempts = parseInt(process.env.OBD_CONNECT_MAX_ATTEMPTS, 10);
    }
    if (process.env.OBD_CONNECT_BASE_DELAY_MS) {
        config.connect.baseDelayMs = parseInt(process.env.OBD_CONNECT_BASE_DELAY_MS, 10);
    }
    if (process.env.OBD_CONNECT_MAX_DELAY_MS) {
        config.connect.maxDelayMs = parseInt(process.env.OBD_CONNECT_MAX_DELAY_MS, 10);
    }
    // Init policy
    if (process.env.OBD_INIT_MAX_ATTEMPTS) {
        config.init.maxAttempts = parseInt(process.env.OBD_INIT_MAX_ATTEMPTS, 10);
    }
    if (process.env.OBD_INIT_BASE_DELAY_MS) {
        config.init.baseDelayMs = parseInt(process.env.OBD_INIT_BASE_DELAY_MS, 10);
    }
    // Operation policy
    if (process.env.OBD_OPERATION_MAX_ATTEMPTS) {
        config.operation.maxAttempts = parseInt(process.env.OBD_OPERATION_MAX_ATTEMPTS, 10);
    }
    return config;
}
/**
 * Вычисляет задержку с exponential backoff и jitter
 * S3: Backoff с jitter для попыток connect/init
 */
export function calculateBackoffDelay(attempt, options) {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } = options;
    // Exponential backoff
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    // Add jitter (random variation)
    const jitterRange = cappedDelay * jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(cappedDelay + jitter));
}
/**
 * Утилита для выполнения операции с retry policy
 */
export async function retryWithPolicy(operation, options, onAttemptStart, onAttemptFailed) {
    let lastError;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                const delayMs = calculateBackoffDelay(attempt - 1, options);
                onAttemptStart?.(attempt, delayMs);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            else {
                onAttemptStart?.(attempt, 0);
            }
            return await operation(attempt);
        }
        catch (error) {
            lastError = error;
            onAttemptFailed?.(attempt, error);
            if (attempt === options.maxAttempts) {
                throw error;
            }
        }
    }
    throw lastError;
}
