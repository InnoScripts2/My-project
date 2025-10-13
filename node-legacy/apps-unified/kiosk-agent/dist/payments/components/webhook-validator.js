import * as crypto from 'crypto';
/**
 * Схема валидации подписи вебхука (каркас под будущие PSP)
 *
 * В DEV режиме валидирует тестовую подпись по секрету из process.env.
 * В PROD должна быть реализована проверка подписи конкретного PSP.
 */
export class WebhookValidator {
    constructor() {
        this.secret = process.env.WEBHOOK_SECRET || 'dev-secret';
        this.environment = process.env.AGENT_ENV || 'DEV';
    }
    /**
     * Валидировать подпись вебхука
     *
     * @param payload - Тело запроса (JSON строка)
     * @param signature - Подпись из заголовка
     * @returns Результат валидации
     */
    validate(payload, signature) {
        if (this.environment === 'DEV') {
            return this.validateDevSignature(payload, signature);
        }
        // В PROD нужна реализация для конкретного PSP
        return {
            valid: false,
            error: 'Webhook validation not implemented for PROD environment'
        };
    }
    /**
     * Валидация для DEV режима (HMAC-SHA256)
     */
    validateDevSignature(payload, signature) {
        try {
            const expectedSignature = this.computeDevSignature(payload);
            const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
            if (!valid) {
                return { valid: false, error: 'Invalid signature' };
            }
            return { valid: true };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Signature validation error'
            };
        }
    }
    /**
     * Вычислить DEV подпись (HMAC-SHA256)
     */
    computeDevSignature(payload) {
        return crypto
            .createHmac('sha256', this.secret)
            .update(payload)
            .digest('hex');
    }
    /**
     * Создать DEV подпись для тестирования
     * Используется в тестах и DEV окружении
     */
    static createDevSignature(payload, secret = process.env.WEBHOOK_SECRET || 'dev-secret') {
        return crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
    }
}
/**
 * Создать валидатор вебхуков
 */
export function createWebhookValidator() {
    return new WebhookValidator();
}
