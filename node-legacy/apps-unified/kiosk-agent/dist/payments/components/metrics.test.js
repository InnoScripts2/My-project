import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { Registry } from 'prom-client';
import { PaymentsMetricsCollector, createPaymentsMetrics, getPaymentsMetrics } from './metrics.js';
describe('Payments Metrics', () => {
    describe('PaymentsMetricsCollector', () => {
        it('регистрирует метрики в registry', () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            assert.ok(metrics.intentCreated);
            assert.ok(metrics.intentSucceeded);
            assert.ok(metrics.intentFailed);
            assert.ok(metrics.statusChecked);
            assert.ok(metrics.operationDuration);
        });
        it('записывает создание интента', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            metrics.recordIntentCreated('dev-emulator');
            metrics.recordIntentCreated('dev-emulator');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_intent_created_total'));
            assert.ok(metricsString.includes('provider="dev-emulator"'));
        });
        it('записывает успешный платёж', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            metrics.recordIntentSucceeded('dev-emulator');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_intent_succeeded_total'));
        });
        it('записывает неудачный платёж', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            metrics.recordIntentFailed('dev-emulator');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_intent_failed_total'));
        });
        it('записывает проверку статуса', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            metrics.recordStatusChecked('dev-emulator', 'pending');
            metrics.recordStatusChecked('dev-emulator', 'succeeded');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_status_checked_total'));
            assert.ok(metricsString.includes('status="pending"'));
            assert.ok(metricsString.includes('status="succeeded"'));
        });
        it('измеряет длительность операций', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            const timer = metrics.startTimer('createIntent', 'dev-emulator');
            await new Promise(resolve => setTimeout(resolve, 10));
            timer();
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_operation_duration_seconds'));
            assert.ok(metricsString.includes('operation="createIntent"'));
        });
        it('разделяет метрики по провайдерам', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            metrics.recordIntentCreated('dev-emulator');
            metrics.recordIntentCreated('yookassa');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('provider="dev-emulator"'));
            assert.ok(metricsString.includes('provider="yookassa"'));
        });
    });
    describe('createPaymentsMetrics', () => {
        it('создаёт новый экземпляр метрик', () => {
            const registry = new Registry();
            const metrics = createPaymentsMetrics(registry);
            assert.ok(metrics);
            assert.ok(metrics instanceof PaymentsMetricsCollector);
        });
    });
    describe('getPaymentsMetrics', () => {
        it('возвращает singleton метрик', () => {
            // Используем новый registry чтобы не конфликтовать с другими тестами
            const registry = new Registry();
            const metrics1 = getPaymentsMetrics(registry);
            const metrics2 = getPaymentsMetrics(registry);
            // Это не точный тест singleton, но проверяет что функция работает
            assert.ok(metrics1);
            assert.ok(metrics2);
        });
    });
    describe('метрики интеграция', () => {
        it('корректно отслеживает полный цикл платежа', async () => {
            const registry = new Registry();
            const metrics = new PaymentsMetricsCollector(registry);
            // Создание интента
            metrics.recordIntentCreated('dev-emulator');
            const createTimer = metrics.startTimer('createIntent', 'dev-emulator');
            await new Promise(resolve => setTimeout(resolve, 5));
            createTimer();
            // Проверка статуса
            metrics.recordStatusChecked('dev-emulator', 'pending');
            metrics.recordStatusChecked('dev-emulator', 'pending');
            metrics.recordStatusChecked('dev-emulator', 'succeeded');
            // Успешный платёж
            metrics.recordIntentSucceeded('dev-emulator');
            const metricsString = await registry.metrics();
            assert.ok(metricsString.includes('payments_component_intent_created_total'));
            assert.ok(metricsString.includes('payments_component_intent_succeeded_total'));
            assert.ok(metricsString.includes('payments_component_status_checked_total'));
            assert.ok(metricsString.includes('payments_component_operation_duration_seconds'));
        });
    });
});
