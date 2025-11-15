/**
 * Тесты для LockController
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LockController } from './LockController.js';
import { DefaultDeviceDispensePolicy, PermissiveDeviceDispensePolicy } from './policies.js';
describe('LockController', () => {
    describe('Инициализация', () => {
        it('должен создать контроллер с mock-драйверами', async () => {
            const configs = [
                { deviceType: 'thickness', driverType: 'mock' },
                { deviceType: 'obd', driverType: 'mock' },
            ];
            const controller = new LockController(configs);
            const status = await controller.getAllStatus();
            assert.ok(status.thickness, 'Статус толщиномера должен существовать');
            assert.ok(status.obd, 'Статус OBD должен существовать');
            assert.strictEqual(status.thickness?.locked, true);
            assert.strictEqual(status.obd?.locked, true);
            await controller.cleanup();
        });
        it('должен выбросить ошибку для неподдерживаемого драйвера', () => {
            const configs = [
                { deviceType: 'thickness', driverType: 'unknown' },
            ];
            assert.throws(() => {
                new LockController(configs);
            }, /Unsupported lock driver type/);
        });
    });
    describe('Операции с замками', () => {
        let controller;
        before(() => {
            const configs = [
                { deviceType: 'thickness', driverType: 'mock' },
                { deviceType: 'obd', driverType: 'mock' },
            ];
            controller = new LockController(configs, new PermissiveDeviceDispensePolicy());
        });
        after(async () => {
            await controller.cleanup();
        });
        it('должен открыть замок', async () => {
            const result = await controller.openSlot('thickness');
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.deviceType, 'thickness');
            assert.strictEqual(result.status, 'unlocked');
            const status = await controller.getStatus('thickness');
            assert.strictEqual(status?.locked, false);
            assert.strictEqual(status?.status, 'unlocked');
        });
        it('должен закрыть замок', async () => {
            await controller.openSlot('thickness');
            const result = await controller.closeSlot('thickness');
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'locked');
            const status = await controller.getStatus('thickness');
            assert.strictEqual(status?.locked, true);
        });
        it('должен вернуть ошибку для несуществующего замка', async () => {
            const result = await controller.openSlot('unknown');
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.error, 'lock_not_found');
        });
        it('должен поддерживать idempotency ключи', async () => {
            const key = 'test-operation-123';
            // Первый запрос
            const result1 = await controller.openSlot('thickness', { operationKey: key });
            assert.strictEqual(result1.ok, true);
            // Повторный запрос с тем же ключом
            const result2 = await controller.openSlot('thickness', { operationKey: key });
            assert.strictEqual(result2.ok, true);
            assert.strictEqual(result2.status, 'unlocked');
            await controller.closeSlot('thickness');
        });
        it('должен планировать auto-close', async () => {
            const result = await controller.openSlot('obd', { autoCloseMs: 100 });
            assert.strictEqual(result.ok, true);
            let status = await controller.getStatus('obd');
            assert.strictEqual(status?.autoCloseScheduled, true);
            // Ждём auto-close
            await new Promise(resolve => setTimeout(resolve, 150));
            status = await controller.getStatus('obd');
            assert.strictEqual(status?.locked, true);
            assert.strictEqual(status?.autoCloseScheduled, false);
        });
        it('должен отменять предыдущий таймер при повторном открытии', async () => {
            await controller.openSlot('thickness', { autoCloseMs: 1000 });
            let status = await controller.getStatus('thickness');
            assert.strictEqual(status?.autoCloseScheduled, true);
            // Повторное открытие должно отменить старый таймер
            await controller.openSlot('thickness', { autoCloseMs: 2000 });
            status = await controller.getStatus('thickness');
            assert.strictEqual(status?.autoCloseScheduled, true);
            await controller.closeSlot('thickness');
        });
    });
    describe('Политики выдачи', () => {
        let controller;
        before(() => {
            const configs = [
                { deviceType: 'thickness', driverType: 'mock' },
                { deviceType: 'obd', driverType: 'mock' },
            ];
            controller = new LockController(configs, new DefaultDeviceDispensePolicy());
        });
        after(async () => {
            await controller.cleanup();
        });
        it('должен блокировать выдачу толщиномера без оплаты', async () => {
            const result = await controller.openSlot('thickness', {
                context: { paymentStatus: 'pending' },
            });
            assert.strictEqual(result.ok, false);
            assert.ok(result.error?.includes('payment_status'));
        });
        it('должен разрешить выдачу толщиномера после оплаты', async () => {
            const result = await controller.openSlot('thickness', {
                context: { paymentStatus: 'succeeded' },
            });
            assert.strictEqual(result.ok, true);
            await controller.closeSlot('thickness');
        });
        it('должен блокировать выдачу OBD без выбора авто', async () => {
            const result = await controller.openSlot('obd', {
                context: { vehicleSelected: false },
            });
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.error, 'vehicle_not_selected');
        });
        it('должен разрешить выдачу OBD после выбора авто', async () => {
            const result = await controller.openSlot('obd', {
                context: { vehicleSelected: true },
            });
            assert.strictEqual(result.ok, true);
            await controller.closeSlot('obd');
        });
    });
    describe('Edge cases', () => {
        it('должен обрабатывать ошибки драйвера при открытии', async () => {
            const configs = [
                {
                    deviceType: 'thickness',
                    driverType: 'mock',
                    driverConfig: { failOnOpen: true },
                },
            ];
            const controller = new LockController(configs, new PermissiveDeviceDispensePolicy());
            const result = await controller.openSlot('thickness');
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'error');
            assert.ok(result.error);
            await controller.cleanup();
        });
        it('должен обрабатывать ошибки драйвера при закрытии', async () => {
            const configs = [
                {
                    deviceType: 'thickness',
                    driverType: 'mock',
                    driverConfig: { failOnClose: true },
                },
            ];
            const controller = new LockController(configs, new PermissiveDeviceDispensePolicy());
            await controller.openSlot('thickness');
            const result = await controller.closeSlot('thickness');
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'error');
            await controller.cleanup();
        });
        it('должен возвращать корректный статус после ошибки', async () => {
            const configs = [
                {
                    deviceType: 'thickness',
                    driverType: 'mock',
                    driverConfig: { failOnOpen: true },
                },
            ];
            const controller = new LockController(configs, new PermissiveDeviceDispensePolicy());
            await controller.openSlot('thickness');
            const status = await controller.getStatus('thickness');
            assert.strictEqual(status?.status, 'error');
            await controller.cleanup();
        });
    });
    describe('getAllStatus', () => {
        it('должен возвращать статусы всех замков', async () => {
            const configs = [
                { deviceType: 'thickness', driverType: 'mock' },
                { deviceType: 'obd', driverType: 'mock' },
            ];
            const controller = new LockController(configs);
            const statuses = await controller.getAllStatus();
            assert.ok(statuses.thickness);
            assert.ok(statuses.obd);
            assert.strictEqual(statuses.thickness?.deviceType, 'thickness');
            assert.strictEqual(statuses.obd?.deviceType, 'obd');
            await controller.cleanup();
        });
    });
});
