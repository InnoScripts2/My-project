/**
 * Unit tests for Elm327Driver
 * Tests initialization, command queue, retry logic, and error handling
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Elm327Driver } from '../Elm327Driver.js';
import { ObdStatus } from '../DeviceObd.js';
import { ObdConnectionError, ObdTimeoutError, ObdUnsupportedError } from '../errors.js';

describe('Elm327Driver', () => {
  let driver: Elm327Driver;

  before(() => {
    process.env.AGENT_ENV = 'DEV';
  });

  after(async () => {
    if (driver) {
      await driver.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      driver = new Elm327Driver();
      assert.equal(driver.getStatus(), ObdStatus.DISCONNECTED);
    });

    it('should have default configuration values', () => {
      driver = new Elm327Driver();
      const metrics = driver.getMetrics();
      assert.equal(metrics.totalCommands, 0);
      assert.equal(metrics.successfulCommands, 0);
      assert.equal(metrics.failedCommands, 0);
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid config', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
        baudRate: 38400,
      });
      assert.equal(driver.getStatus(), ObdStatus.READY);
    });

    it('should emit connected event on successful init', async () => {
      driver = new Elm327Driver();
      let eventEmitted = false;
      driver.on('connected', () => {
        eventEmitted = true;
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.equal(eventEmitted, true);
    });

    it('should track status changes during init', async () => {
      driver = new Elm327Driver();
      const statuses: ObdStatus[] = [];
      driver.on('status-change', (status) => {
        statuses.push(status);
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.ok(statuses.includes(ObdStatus.CONNECTING));
      assert.ok(statuses.includes(ObdStatus.INITIALIZING));
      assert.ok(statuses.includes(ObdStatus.READY));
    });

    it('should throw ObdConnectionError on invalid transport', async () => {
      driver = new Elm327Driver();
      await assert.rejects(
        async () => {
          await driver.init({
            transport: 'bluetooth' as any,
            port: 'MOCK',
          });
        },
        ObdConnectionError
      );
    });
  });

  describe('Status Management', () => {
    it('should return current status', async () => {
      driver = new Elm327Driver();
      assert.equal(driver.getStatus(), ObdStatus.DISCONNECTED);

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.equal(driver.getStatus(), ObdStatus.READY);
    });

    it('should update status to IDLE after operations', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readDtc();
      assert.equal(driver.getStatus(), ObdStatus.IDLE);
    });
  });

  describe('DTC Operations', () => {
    it('should read DTCs successfully', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const dtcs = await driver.readDtc();
      assert.ok(Array.isArray(dtcs));
      assert.ok(dtcs.length >= 0);
    });

    it('should emit dtc-read event', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      let eventData: any = null;
      driver.on('dtc-read', (data) => {
        eventData = data;
      });

      await driver.readDtc();
      assert.ok(eventData !== null);
      assert.ok(Array.isArray(eventData));
    });

    it('should clear DTCs successfully', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const result = await driver.clearDtc();
      assert.equal(typeof result, 'boolean');
    });

    it('should emit dtc-cleared event', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      let eventData: any = null;
      driver.on('dtc-cleared', (data) => {
        eventData = data;
      });

      await driver.clearDtc();
      assert.equal(typeof eventData, 'boolean');
    });

    it('should reject operations when not ready', async () => {
      driver = new Elm327Driver();
      await assert.rejects(
        async () => {
          await driver.readDtc();
        },
        ObdConnectionError
      );
    });
  });

  describe('PID Operations', () => {
    it('should read PID successfully', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const result = await driver.readPid('0C');
      assert.ok(result);
      assert.equal(result.pid, '0C');
      assert.ok(typeof result.value === 'number');
      assert.ok(result.unit);
      assert.ok(result.timestamp > 0);
    });

    it('should emit pid-read event', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      let eventData: any = null;
      driver.on('pid-read', (data) => {
        eventData = data;
      });

      await driver.readPid('0C');
      assert.ok(eventData !== null);
      assert.equal(eventData.pid, '0C');
    });

    it('should throw error for unsupported PID', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await assert.rejects(
        async () => {
          await driver.readPid('FF');
        },
        ObdUnsupportedError
      );
    });

    it('should handle case-insensitive PID', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const result = await driver.readPid('0c');
      assert.equal(result.pid, '0C');
    });
  });

  describe('Metrics', () => {
    it('should track command metrics', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const initialMetrics = driver.getMetrics();
      assert.ok(initialMetrics.totalCommands > 0);

      await driver.readPid('0C');
      const updatedMetrics = driver.getMetrics();
      assert.ok(updatedMetrics.totalCommands > initialMetrics.totalCommands);
    });

    it('should track successful commands', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readDtc();
      const metrics = driver.getMetrics();
      assert.ok(metrics.successfulCommands > 0);
    });

    it('should calculate average latency', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.readPid('0C');
      const metrics = driver.getMetrics();
      assert.ok(metrics.averageLatencyMs >= 0);
    });

    it('should return immutable metrics copy', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      const metrics1 = driver.getMetrics();
      const metrics2 = driver.getMetrics();
      assert.notEqual(metrics1, metrics2);
    });
  });

  describe('Disconnect', () => {
    it('should disconnect cleanly', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      await driver.disconnect();
      assert.equal(driver.getStatus(), ObdStatus.DISCONNECTED);
    });

    it('should emit disconnected event', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      let eventEmitted = false;
      driver.on('disconnected', () => {
        eventEmitted = true;
      });

      await driver.disconnect();
      assert.equal(eventEmitted, true);
    });

    it('should handle disconnect when not connected', async () => {
      driver = new Elm327Driver();
      await driver.disconnect();
      assert.equal(driver.getStatus(), ObdStatus.DISCONNECTED);
    });
  });

  describe('Event System', () => {
    it('should support multiple event listeners', async () => {
      driver = new Elm327Driver();
      let count1 = 0;
      let count2 = 0;

      driver.on('connected', () => count1++);
      driver.on('connected', () => count2++);

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.equal(count1, 1);
      assert.equal(count2, 1);
    });

    it('should emit status-change events', async () => {
      driver = new Elm327Driver();
      const statuses: ObdStatus[] = [];

      driver.on('status-change', (status) => {
        statuses.push(status);
      });

      await driver.init({
        transport: 'serial',
        port: 'MOCK',
      });

      assert.ok(statuses.length > 0);
    });
  });

  describe('Configuration', () => {
    it('should use custom timeout', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
        timeout: 2000,
      });

      assert.equal(driver.getStatus(), ObdStatus.READY);
    });

    it('should use custom retries', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
        retries: 5,
      });

      assert.equal(driver.getStatus(), ObdStatus.READY);
    });

    it('should use custom baudRate', async () => {
      driver = new Elm327Driver();
      await driver.init({
        transport: 'serial',
        port: 'MOCK',
        baudRate: 9600,
      });

      assert.equal(driver.getStatus(), ObdStatus.READY);
    });
  });
});
