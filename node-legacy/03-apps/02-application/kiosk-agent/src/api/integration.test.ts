/**
 * Integration tests for Cycle-2 Final Connector
 * Tests the complete flow: payment → webhook → lock opening
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { LockController, DefaultDeviceDispensePolicy } from '../locks/index.js';

describe('Cycle-2 Integration Tests', () => {
  let lockController: LockController;

  before(() => {
    // Setup lock controller with policy
    lockController = new LockController(
      [
        { deviceType: 'thickness', driverType: 'mock', autoCloseMs: 30000 },
        { deviceType: 'obd', driverType: 'mock', autoCloseMs: 30000 },
      ],
      new DefaultDeviceDispensePolicy()
    );
  });

  after(async () => {
    await lockController.cleanup();
  });

  describe('Lock Policy Enforcement', () => {
    it('должен блокировать выдачу толщиномера без оплаты', async () => {
      const result = await lockController.openSlot('thickness', {
        context: { paymentStatus: 'pending' },
      });

      assert.strictEqual(result.ok, false, 'Выдача должна быть заблокирована');
      assert.ok(result.error?.includes('payment'), 'Ошибка должна упоминать payment');
    });

    it('должен разрешить выдачу толщиномера после оплаты', async () => {
      const result = await lockController.openSlot('thickness', {
        context: { paymentStatus: 'succeeded' },
      });

      assert.strictEqual(result.ok, true, 'Выдача должна быть разрешена');
      assert.strictEqual(result.status, 'unlocked', 'Замок должен открыться');
      assert.ok(result.actionId, 'ActionId должен быть сгенерирован');

      await lockController.closeSlot('thickness');
    });
  });

  describe('OBD Policy Enforcement', () => {
    it('должен разрешить выдачу OBD после выбора авто', async () => {
      const result = await lockController.openSlot('obd', {
        context: { vehicleSelected: true },
      });

      assert.strictEqual(result.ok, true, 'Выдача OBD должна быть разрешена');
      assert.strictEqual(result.status, 'unlocked', 'Замок OBD должен открыться');
      assert.ok(result.actionId, 'ActionId должен быть сгенерирован');

      await lockController.closeSlot('obd');
    });

    it('должен блокировать выдачу OBD без выбора авто', async () => {
      const result = await lockController.openSlot('obd', {
        context: { vehicleSelected: false },
      });

      assert.strictEqual(result.ok, false, 'Выдача OBD должна быть заблокирована');
      assert.ok(result.error?.includes('vehicle'), 'Ошибка должна упоминать vehicle');
    });
  });

  describe('Idempotency', () => {
    it('должен возвращать тот же actionId при повторных запросах', async () => {
      const idemKey = 'test-session-idem:thickness:test-payment-123';

      // First request
      const result1 = await lockController.openSlot('thickness', {
        operationKey: idemKey,
        context: { paymentStatus: 'succeeded' },
      });

      assert.strictEqual(result1.ok, true, 'Первый запрос должен быть успешным');
      const actionId1 = result1.actionId;

      // Second request with same key
      const result2 = await lockController.openSlot('thickness', {
        operationKey: idemKey,
        context: { paymentStatus: 'succeeded' },
      });

      assert.strictEqual(result2.ok, true, 'Второй запрос должен быть успешным');
      assert.strictEqual(result2.actionId, actionId1, 'ActionId должен совпадать');

      await lockController.closeSlot('thickness');
    });
  });

  describe('Lock Status', () => {
    it('должен возвращать корректный статус замков', async () => {
      const thicknessStatus = await lockController.getStatus('thickness');
      const obdStatus = await lockController.getStatus('obd');

      assert.ok(thicknessStatus, 'Статус толщиномера должен существовать');
      assert.ok(obdStatus, 'Статус OBD должен существовать');

      assert.strictEqual(thicknessStatus.deviceType, 'thickness');
      assert.strictEqual(obdStatus.deviceType, 'obd');

      assert.ok(['locked', 'unlocked', 'error'].includes(thicknessStatus.status));
      assert.ok(['locked', 'unlocked', 'error'].includes(obdStatus.status));
      
      // Check that lastOperationKey is tracked
      if (thicknessStatus.status === 'unlocked') {
        assert.ok(thicknessStatus.lastOperationKey, 'LastOperationKey должен быть установлен для открытого замка');
      }
    });
  });
});
