import { Counter, Histogram, Registry, register } from 'prom-client'

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
  private readonly registry: Registry

  readonly intentCreated: Counter
  readonly intentSucceeded: Counter
  readonly intentFailed: Counter
  readonly statusChecked: Counter
  readonly operationDuration: Histogram

  constructor(registry: Registry = register) {
    this.registry = registry

    this.intentCreated = new Counter({
      name: 'payments_component_intent_created_total',
      help: 'Total number of payment intents created',
      labelNames: ['provider'],
      registers: [this.registry],
    })

    this.intentSucceeded = new Counter({
      name: 'payments_component_intent_succeeded_total',
      help: 'Total number of successful payment intents',
      labelNames: ['provider'],
      registers: [this.registry],
    })

    this.intentFailed = new Counter({
      name: 'payments_component_intent_failed_total',
      help: 'Total number of failed payment intents',
      labelNames: ['provider'],
      registers: [this.registry],
    })

    this.statusChecked = new Counter({
      name: 'payments_component_status_checked_total',
      help: 'Total number of payment status checks',
      labelNames: ['provider', 'status'],
      registers: [this.registry],
    })

    this.operationDuration = new Histogram({
      name: 'payments_component_operation_duration_seconds',
      help: 'Duration of payment operations in seconds',
      labelNames: ['operation', 'provider'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    })
  }

  /**
   * Записать создание платёжного намерения
   */
  recordIntentCreated(provider: string): void {
    this.intentCreated.inc({ provider })
  }

  /**
   * Записать успешный платёж
   */
  recordIntentSucceeded(provider: string): void {
    this.intentSucceeded.inc({ provider })
  }

  /**
   * Записать неудачный платёж
   */
  recordIntentFailed(provider: string): void {
    this.intentFailed.inc({ provider })
  }

  /**
   * Записать проверку статуса
   */
  recordStatusChecked(provider: string, status: string): void {
    this.statusChecked.inc({ provider, status })
  }

  /**
   * Начать измерение длительности операции
   */
  startTimer(operation: string, provider: string): () => void {
    return this.operationDuration.startTimer({ operation, provider })
  }
}

let metricsInstance: PaymentsMetricsCollector | null = null

/**
 * Получить singleton метрик платежей
 */
export function getPaymentsMetrics(registry: Registry = register): PaymentsMetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new PaymentsMetricsCollector(registry)
  }
  return metricsInstance
}

/**
 * Создать новый экземпляр метрик (для тестов)
 */
export function createPaymentsMetrics(registry: Registry = register): PaymentsMetricsCollector {
  return new PaymentsMetricsCollector(registry)
}
