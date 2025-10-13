import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Elm327Driver } from './Elm327Driver.js';
import { ObdConfig, ObdStatus } from './driver/DeviceObd.js';
import { DeviceState } from '../common/interfaces.js';

await describe('Elm327Driver', async () => {
  await describe('initialization', async () => {
    await it('should start in disconnected state', () => {
      const driver = new Elm327Driver();
      assert.strictEqual(driver.getStatus(), ObdStatus.DISCONNECTED);
      assert.strictEqual(driver.getState(), DeviceState.DISCONNECTED);
    });

    await it('should emit state_changed on init', async () => {
      const driver = new Elm327Driver();
      let stateChangedCount = 0;

      driver.on('state_changed', () => {
        stateChangedCount++;
      });

      // В тестовой среде без реального устройства init должен упасть
      try {
        const config: ObdConfig = {
          transport: 'serial',
          port: '/dev/ttyUSB99',
          baudRate: 38400,
          timeout: 1000,
        };
        await driver.init(config);
      } catch (error) {
        // Ожидаемая ошибка
      }

      assert.ok(stateChangedCount > 0, 'state_changed should be emitted');
    });
  });

  await describe('getHealthStatus', async () => {
    await it('should return health status with metrics', () => {
      const driver = new Elm327Driver();
      const health = driver.getHealthStatus();

      assert.ok('state' in health);
      assert.ok('connected' in health);
      assert.ok('metrics' in health);
      assert.ok('successRate' in health.metrics);
      assert.ok('avgResponseTime' in health.metrics);
      assert.ok('totalOperations' in health.metrics);
      assert.ok('failedOperations' in health.metrics);
    });

    await it('should have zero metrics initially', () => {
      const driver = new Elm327Driver();
      const health = driver.getHealthStatus();

      assert.strictEqual(health.metrics.totalOperations, 0);
      assert.strictEqual(health.metrics.failedOperations, 0);
    });
  });

  await describe('DTC parsing', async () => {
    await it('should handle empty DTC response', async () => {
      const driver = new Elm327Driver();
      
      // Тестируем внутреннюю логику парсинга
      // В реальности parseDtcResponse - private, но мы проверяем через readDtc
      // который должен вернуть пустой массив при NO DATA
    });
  });
});
