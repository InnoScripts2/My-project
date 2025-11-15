/**
 * Экспоненциальный бэкофф для опроса статуса платежа
 *
 * Используется для периодической проверки статуса платёжного намерения
 * с учётом таймаута сессии киоска.
 */
export class PaymentStatusPoller {
    constructor(config) {
        this.config = {
            maxAttempts: config?.maxAttempts ?? 20,
            initialDelayMs: config?.initialDelayMs ?? 1000,
            maxDelayMs: config?.maxDelayMs ?? 10000,
            timeoutMs: config?.timeoutMs ?? 300000, // 5 минут по умолчанию
        };
    }
    /**
     * Опросить статус платежа с экспоненциальным бэкоффом
     *
     * Продолжает опрос пока статус 'pending' или пока не истечёт таймаут.
     *
     * @param provider - Провайдер платежей
     * @param intentId - ID платёжного намерения
     * @returns Финальный статус или ошибка
     */
    async pollStatus(provider, intentId) {
        const startTime = Date.now();
        let attempts = 0;
        let lastError;
        while (attempts < this.config.maxAttempts) {
            attempts++;
            try {
                const status = await provider.getStatus(intentId);
                // Если статус не pending, возвращаем результат
                if (status !== 'pending') {
                    return {
                        success: true,
                        value: status,
                        attempts
                    };
                }
                // Проверяем таймаут
                if (Date.now() - startTime >= this.config.timeoutMs) {
                    return {
                        success: false,
                        error: new Error('Payment status polling timeout'),
                        attempts
                    };
                }
                // Вычисляем задержку с экспоненциальным бэкоффом
                const delay = this.calculateDelay(attempts);
                await this.sleep(delay);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // При ошибке тоже делаем задержку
                const delay = this.calculateDelay(attempts);
                await this.sleep(delay);
            }
        }
        return {
            success: false,
            error: lastError || new Error('Max polling attempts reached'),
            attempts
        };
    }
    /**
     * Вычислить задержку с экспоненциальным бэкоффом
     */
    calculateDelay(attempt) {
        const exponentialDelay = this.config.initialDelayMs * Math.pow(2, attempt - 1);
        return Math.min(exponentialDelay, this.config.maxDelayMs);
    }
    /**
     * Асинхронная задержка
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
/**
 * Создать поллер статуса платежа с настройками по умолчанию
 */
export function createPaymentStatusPoller(config) {
    return new PaymentStatusPoller(config);
}
