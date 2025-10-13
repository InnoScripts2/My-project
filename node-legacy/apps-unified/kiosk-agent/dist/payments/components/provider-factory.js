import { DevPaymentProvider } from '@selfservice/payments';
/**
 * Фабрика провайдеров платежей
 *
 * Создаёт экземпляр провайдера на основе окружения:
 * - DEV: DevPaymentProvider (эмулятор)
 * - PROD: NotImplementedError (до интеграции с реальным PSP)
 *
 * @param environment - Окружение (DEV/QA/PROD)
 * @returns Провайдер платежей
 */
export function createPaymentProvider(environment) {
    if (environment === 'DEV') {
        return new DevPaymentProvider();
    }
    if (environment === 'QA') {
        // В QA можно использовать тестовый режим реального PSP
        // Пока используем DEV провайдер
        return new DevPaymentProvider();
    }
    throw new Error('Payment provider not implemented for PROD environment. ' +
        'Please integrate with a real PSP (e.g., Stripe, YooKassa, Tinkoff).');
}
/**
 * Получить окружение из переменных среды
 */
export function getEnvironmentFromEnv() {
    const env = process.env.AGENT_ENV || 'DEV';
    if (env === 'PROD' || env === 'QA' || env === 'DEV') {
        return env;
    }
    return 'DEV';
}
/**
 * Создать провайдер на основе переменных среды
 */
export function createPaymentProviderFromEnv() {
    const environment = getEnvironmentFromEnv();
    return createPaymentProvider(environment);
}
