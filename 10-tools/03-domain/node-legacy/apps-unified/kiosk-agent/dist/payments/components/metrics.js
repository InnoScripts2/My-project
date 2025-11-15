import { Counter, Histogram, register } from 'prom-client';
/**
 * Prometheus метрики для платежей
 *
 * Отслеживает:
 * - Созданные платёжные намерения
 * - Оплаченные/ошибочные платежи
 * - Latency операций
 * - Статусы по провайдерам
 */
export class PaymentsMetricsCollector {
    constructor(registry = register) {
        this.registry = registry;
        this.intentCreated = new Counter({
            name: 'payments_component_intent_created_total',
            help: 'Total number of payment intents created',
            labelNames: ['provider'],
            registers: [this.registry],
        });
        this.intentSucceeded = new Counter({
            name: 'payments_component_intent_succeeded_total',
            help: 'Total number of successful payment intents',
            labelNames: ['provider'],
            registers: [this.registry],
        });
        this.intentFailed = new Counter({
            name: 'payments_component_intent_failed_total',
            help: 'Total number of failed payment intents',
            labelNames: ['provider'],
            registers: [this.registry],
        });
        this.statusChecked = new Counter({
            name: 'payments_component_status_checked_total',
            help: 'Total number of payment status checks',
            labelNames: ['provider', 'status'],
            registers: [this.registry],
        });
        this.operationDuration = new Histogram({
            name: 'payments_component_operation_duration_seconds',
            help: 'Duration of payment operations in seconds',
            labelNames: ['operation', 'provider'],
            buckets: [0.1, 0.5, 1, 2, 5, 10],
            registers: [this.registry],
        });
    }
    /**
     * Записать создание платёжного намерения
     */
    recordIntentCreated(provider) {
        this.intentCreated.inc({ provider });
    }
    /**
     * Записать успешный платёж
     */
    recordIntentSucceeded(provider) {
        this.intentSucceeded.inc({ provider });
    }
    /**
     * Записать неудачный платёж
     */
    recordIntentFailed(provider) {
        this.intentFailed.inc({ provider });
    }
    /**
     * Записать проверку статуса
     */
    recordStatusChecked(provider, status) {
        this.statusChecked.inc({ provider, status });
    }
    /**
     * Начать измерение длительности операции
     */
    startTimer(operation, provider) {
        return this.operationDuration.startTimer({ operation, provider });
    }
}
let metricsInstance = null;
/**
 * Получить singleton метрик платежей
 */
export function getPaymentsMetrics(registry = register) {
    if (!metricsInstance) {
        metricsInstance = new PaymentsMetricsCollector(registry);
    }
    return metricsInstance;
}
/**
 * Создать новый экземпляр метрик (для тестов)
 */
export function createPaymentsMetrics(registry = register) {
    return new PaymentsMetricsCollector(registry);
}
