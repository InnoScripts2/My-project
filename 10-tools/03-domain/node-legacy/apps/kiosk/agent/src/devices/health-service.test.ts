import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DeviceHealthService, getHealthService } from './health-service.js';

await describe('DeviceHealthService', async () => {
  await describe('singleton', async () => {
    await it('should return same instance', () => {
      const service1 = getHealthService();
      const service2 = getHealthService();
      assert.strictEqual(service1, service2);
    });
  });

  await describe('getHealthReport', async () => {
    await it('should return health report structure', async () => {
      const service = new DeviceHealthService();
      const report = await service.getHealthReport();

      assert.ok('obd' in report);
      assert.ok('thickness' in report);
      assert.ok('storage' in report);

      assert.ok('available' in report.obd);
      assert.ok('connected' in report.obd);
      assert.ok('state' in report.obd);

      assert.ok('available' in report.thickness);
      assert.ok('connected' in report.thickness);
      assert.ok('state' in report.thickness);

      assert.ok('available' in report.storage);
      assert.ok('path' in report.storage);
      assert.ok('events' in report.storage);
    });

    await it('should report devices as unavailable when not set', async () => {
      const service = new DeviceHealthService();
      const report = await service.getHealthReport();

      assert.strictEqual(report.obd.available, false);
      assert.strictEqual(report.thickness.available, false);
    });

    await it('should report storage as always available', async () => {
      const service = new DeviceHealthService();
      const report = await service.getHealthReport();

      assert.strictEqual(report.storage.available, true);
    });
  });

  await describe('checkHealth', async () => {
    await it('should return healthy status with report', async () => {
      const service = new DeviceHealthService();
      const result = await service.checkHealth();

      assert.ok('healthy' in result);
      assert.ok('report' in result);
      assert.strictEqual(typeof result.healthy, 'boolean');
    });

    await it('should be healthy when no errors present', async () => {
      const service = new DeviceHealthService();
      const result = await service.checkHealth();

      // Should be healthy if storage is available and no critical errors
      assert.strictEqual(result.healthy, true);
    });
  });
});
