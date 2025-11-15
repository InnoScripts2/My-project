/**
 * Integration test for Elm327Driver with DevTransport
 * Tests full initialization, command execution, and DTC/PID reading
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Elm327Driver } from '../Elm327Driver.js';
import { ObdStatus } from '../DeviceObd.js';

describe('Elm327Driver Integration (DEV Mode)', () => {
  let driver: Elm327Driver;

  before(() => {
    process.env.AGENT_ENV = 'DEV';
  });

  after(async () => {
    if (driver) {
      await driver.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should initialize with DEV mock transport', async () => {
      driver = new Elm327Driver();

      let connectedEvent = false;
      driver.on('connected', () => {
        connectedEvent = true;
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
        baudRate: 38400,
        timeout: 2000,
      });

      assert.equal(driver.getStatus(), ObdStatus.READY);
      assert.equal(connectedEvent, true);
    });

    it('should track status changes', async () => {
      const statusChanges: ObdStatus[] = [];

      driver = new Elm327Driver();
      driver.on('status-change', (status: ObdStatus) => {
        statusChanges.push(status);
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.ok(statusChanges.includes(ObdStatus.CONNECTING));
      assert.ok(statusChanges.includes(ObdStatus.INITIALIZING));
      assert.ok(statusChanges.includes(ObdStatus.READY));
    });
  });

  describe('DTC Operations', () => {
    it('should read DTCs', async () => {
      driver = new Elm327Driver();

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const dtcs = await driver.readDtc();

      assert.ok(Array.isArray(dtcs));
      assert.equal(dtcs.length, 2);
      assert.equal(dtcs[0].code, 'P0133');
      assert.equal(dtcs[1].code, 'P0044');
    });

    it('should clear DTCs', async () => {
      driver = new Elm327Driver();

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const success = await driver.clearDtc();
      assert.equal(success, true);
    });

    it('should emit dtc-read event', async () => {
      driver = new Elm327Driver();

      let eventFired = false;
      driver.on('dtc-read', (dtcs) => {
        eventFired = true;
        assert.ok(Array.isArray(dtcs));
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readDtc();
      assert.equal(eventFired, true);
    });

    it('should emit dtc-cleared event', async () => {
      driver = new Elm327Driver();

      let eventFired = false;
      driver.on('dtc-cleared', (success) => {
        eventFired = true;
        assert.equal(success, true);
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.clearDtc();
      assert.equal(eventFired, true);
    });
  });

  describe('PID Operations', () => {
    it('should read RPM (PID 0C)', async () => {
      driver = new Elm327Driver();

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const rpm = await driver.readPid('0C');

      assert.ok(rpm);
      assert.equal(rpm.pid, '0C');
      assert.ok(typeof rpm.value === 'number');
      assert.equal(rpm.unit, 'rpm');
      assert.ok(rpm.timestamp > 0);
    });

    it('should read multiple PIDs sequentially', async () => {
      driver = new Elm327Driver();

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const rpm = await driver.readPid('0C');
      const speed = await driver.readPid('0D');
      const coolant = await driver.readPid('05');

      assert.ok(rpm.value > 0);
      assert.ok(speed.value >= 0);
      assert.ok(coolant.value > -40);
    });

    it('should emit pid-read event', async () => {
      driver = new Elm327Driver();

      let eventFired = false;
      driver.on('pid-read', (value) => {
        eventFired = true;
        assert.ok(value.pid);
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readPid('0C');
      assert.equal(eventFired, true);
    });
  });

  describe('Metrics', () => {
    it('should track command metrics', async () => {
      driver = new Elm327Driver();

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readPid('0C');
      await driver.readPid('0D');

      const metrics = driver.getMetrics();

      assert.ok(metrics.totalCommands > 0);
      assert.ok(metrics.successfulCommands > 0);
      assert.ok(metrics.averageLatencyMs >= 0);
      assert.ok(metrics.lastCommand);
      assert.ok(metrics.lastUpdatedAt);
    });
  });

  describe('Disconnect', () => {
    it('should disconnect cleanly', async () => {
      driver = new Elm327Driver();

      let disconnectedEvent = false;
      driver.on('disconnected', () => {
        disconnectedEvent = true;
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.disconnect();

      assert.equal(driver.getStatus(), ObdStatus.DISCONNECTED);
      assert.equal(disconnectedEvent, true);
    });
  });
});
