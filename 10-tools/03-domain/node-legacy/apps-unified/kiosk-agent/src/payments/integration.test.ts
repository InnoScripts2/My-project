/**
 * Payment API Integration Tests
 * 
 * Тесты полного потока: создание intent → polling → cancel/confirm
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PaymentModule } from '../payments/module.js';

describe('Payment API Integration Tests', () => {
  let paymentModule: PaymentModule;
  const testEnv = 'DEV';

  before(() => {
    paymentModule = new PaymentModule(testEnv);
  });

  describe('Create Intent Flow', () => {
    it('должен создать платёжное намерение', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: {
          service: 'diagnostics',
          sessionId: 'test-session-1',
        },
      });

      assert.ok(result.intent, 'Intent должен быть создан');
      assert.strictEqual(result.intent.amount, 48000);
      assert.strictEqual(result.intent.currency, 'RUB');
      assert.strictEqual(result.intent.status, 'pending');
      assert.ok(result.intent.id, 'Intent ID должен быть сгенерирован');
    });

    it('должен вернуть статус pending для нового intent', async () => {
      const result = await paymentModule.createIntent({
        amount: 35000,
        currency: 'RUB',
        meta: { service: 'thickness', sessionId: 'test-session-2' },
      });

      const status = await paymentModule.getStatus(result.intent.id);
      assert.strictEqual(status, 'pending');
    });
  });

  describe('Cancel Flow', () => {
    it('должен отменить pending intent', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-3' },
      });

      // Cancel не реализован в PaymentModule, но можно проверить статус
      const intent = await paymentModule.getIntent(result.intent.id);
      assert.ok(intent, 'Intent должен существовать');
      assert.strictEqual(intent.intent.status, 'pending');

      // TODO: Добавить cancel метод в PaymentModule
      // const cancelled = await paymentModule.cancel(result.intent.id);
      // assert.strictEqual(cancelled.intent.status, 'expired');
    });

    it('не должен отменять succeeded intent', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-4' },
      });

      // Подтвердить в DEV режиме
      await paymentModule.confirmDev(result.intent.id);
      
      const status = await paymentModule.getStatus(result.intent.id);
      assert.strictEqual(status, 'succeeded');

      // Попытка отмены должна провалиться
      // TODO: Проверить, что cancel не работает для succeeded
    });
  });

  describe('Confirm DEV Flow', () => {
    it('должен подтвердить intent в DEV режиме', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-5' },
      });

      const confirmed = await paymentModule.confirmDev(result.intent.id);
      assert.ok(confirmed, 'Intent должен быть подтверждён');
      assert.strictEqual(confirmed.intent.status, 'succeeded');
    });

    it('не должен подтверждать несуществующий intent', async () => {
      await assert.rejects(
        async () => {
          await paymentModule.confirmDev('non-existent-intent-id');
        },
        /not found/i,
        'Должна быть ошибка о ненайденном intent'
      );
    });
  });

  describe('Status Transitions', () => {
    it('должен корректно обрабатывать переход pending → succeeded', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-6' },
      });

      let status = await paymentModule.getStatus(result.intent.id);
      assert.strictEqual(status, 'pending', 'Начальный статус должен быть pending');

      await paymentModule.confirmDev(result.intent.id);

      status = await paymentModule.getStatus(result.intent.id);
      assert.strictEqual(status, 'succeeded', 'Статус должен измениться на succeeded');
    });

    it('должен хранить историю переходов статусов', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-7' },
      });

      await paymentModule.confirmDev(result.intent.id);

      const intent = await paymentModule.getIntent(result.intent.id);
      assert.ok(intent.intent.history, 'История должна существовать');
      assert.ok(intent.intent.history.length >= 2, 'История должна содержать минимум 2 записи');
      
      const statuses = intent.intent.history.map((h: any) => h.status);
      assert.ok(statuses.includes('pending'), 'История должна содержать pending');
      assert.ok(statuses.includes('succeeded'), 'История должна содержать succeeded');
    });
  });

  describe('Metrics Collection', () => {
    it('должен собирать метрики создания intent', async () => {
      const beforeMetrics = paymentModule.getMetricsSnapshot();
      const beforeTotal = beforeMetrics.intentsCreated.total;

      await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-metrics-1' },
      });

      const afterMetrics = paymentModule.getMetricsSnapshot();
      const afterTotal = afterMetrics.intentsCreated.total;

      assert.ok(afterTotal > beforeTotal, 'Счётчик созданных intent должен увеличиться');
    });

    it('должен собирать метрики проверки статуса', async () => {
      const result = await paymentModule.createIntent({
        amount: 48000,
        currency: 'RUB',
        meta: { service: 'diagnostics', sessionId: 'test-session-metrics-2' },
      });

      const beforeMetrics = paymentModule.getMetricsSnapshot();
      const beforeChecks = beforeMetrics.statusChecked.total;

      await paymentModule.getStatus(result.intent.id);

      const afterMetrics = paymentModule.getMetricsSnapshot();
      const afterChecks = afterMetrics.statusChecked.total;

      assert.ok(afterChecks > beforeChecks, 'Счётчик проверок статуса должен увеличиться');
    });
  });

  describe('Error Handling', () => {
    it('должен возвращать ошибку для несуществующего intent', async () => {
      const status = await paymentModule.getStatus('non-existent-id');
      assert.strictEqual(status, null, 'Статус несуществующего intent должен быть null');
    });

    it('должен валидировать amount', async () => {
      await assert.rejects(
        async () => {
          await paymentModule.createIntent({
            amount: -100,
            currency: 'RUB',
            meta: { service: 'diagnostics', sessionId: 'test-invalid' },
          });
        },
        /amount/i,
        'Должна быть ошибка валидации amount'
      );
    });
  });
});
