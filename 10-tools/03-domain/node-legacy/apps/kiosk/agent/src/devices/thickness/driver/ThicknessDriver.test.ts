import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThicknessDriver } from './ThicknessDriver.js';
import { ThicknessConfig, ThicknessState } from './DeviceThickness.js';
import { DeviceState } from '../../common/interfaces.js';

await describe('ThicknessDriver', async () => {
  await describe('initialization', async () => {
    await it('should start in disconnected state', () => {
      const driver = new ThicknessDriver();
      assert.strictEqual(driver.getState(), DeviceState.DISCONNECTED);
      assert.strictEqual(driver.getThicknessState(), ThicknessState.DISCONNECTED);
    });

    await it('should initialize successfully in DEV mode', async () => {
      if (process.env.AGENT_ENV !== 'DEV') {
        return; // Пропускаем если не в DEV режиме
      }

      const driver = new ThicknessDriver();
      const config: ThicknessConfig = {
        deviceName: 'TH_Sensor',
        totalZones: 40,
        connectionTimeout: 5000,
      };

      await driver.init(config);
      assert.strictEqual(driver.getState(), DeviceState.READY);
      assert.strictEqual(driver.getThicknessState(), ThicknessState.READY);

      await driver.disconnect();
    });

    await it('should emit events during initialization', async () => {
      if (process.env.AGENT_ENV !== 'DEV') {
        return;
      }

      const driver = new ThicknessDriver();
      const events: string[] = [];

      driver.on('state_changed', (state) => events.push(`state:${state}`));
      driver.on('connected', () => events.push('connected'));

      const config: ThicknessConfig = {
        deviceName: 'TH_Sensor',
        totalZones: 40,
      };

      await driver.init(config);

      assert.ok(events.includes('connected'), 'connected event should be emitted');
      assert.ok(events.length > 0, 'events should be emitted');

      await driver.disconnect();
    });
  });

  await describe('getMeasurements', async () => {
    await it('should return empty array initially', () => {
      const driver = new ThicknessDriver();
      const measurements = driver.getMeasurements();
      assert.strictEqual(measurements.length, 0);
    });

    await it('should return copy of measurements', () => {
      const driver = new ThicknessDriver();
      const measurements1 = driver.getMeasurements();
      const measurements2 = driver.getMeasurements();
      assert.notStrictEqual(measurements1, measurements2, 'should return different instances');
    });
  });

  await describe('getHealthStatus', async () => {
    await it('should return health status with metrics', () => {
      const driver = new ThicknessDriver();
      const health = driver.getHealthStatus();

      assert.ok('state' in health);
      assert.ok('connected' in health);
      assert.ok('metrics' in health);
      assert.ok('successRate' in health.metrics);
      assert.ok('totalOperations' in health.metrics);
    });

    await it('should have zero metrics initially', () => {
      const driver = new ThicknessDriver();
      const health = driver.getHealthStatus();

      assert.strictEqual(health.metrics.totalOperations, 0);
      assert.strictEqual(health.metrics.failedOperations, 0);
    });
  });

  await describe('measurement process', async () => {
    await it('should not allow measuring when disconnected', async () => {
      const driver = new ThicknessDriver();

      await assert.rejects(
        async () => {
          await driver.startMeasuring();
        },
        { message: /not ready/i }
      );
    });
  });
});
