/**
 * PollingManager tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { PollingManager } from '../polling/PollingManager.js';
import { PidDatabase } from '../database/PidDatabase.js';
import type { ObdDriver } from '../drivers/ObdDriverInterface.js';
import type { ObdMode, PidIdentifier, DtcCode } from '../database/types.js';

// Mock OBD Driver
class MockObdDriver extends EventEmitter implements ObdDriver {
  private mockData: Map<string, string> = new Map();

  constructor() {
    super();
    // Setup some mock data
    this.mockData.set('010C', '1AF8'); // 2000 RPM
    this.mockData.set('010D', '64'); // 100 km/h
    this.mockData.set('0105', '78'); // 80°C
  }

  async connect(): Promise<void> {
    // Mock implementation
  }

  async disconnect(): Promise<void> {
    // Mock implementation
  }

  isConnected(): boolean {
    return true;
  }

  async sendCommand(command: string): Promise<string> {
    const data = this.mockData.get(command);
    if (data) {
      return `4${command.substring(1)} ${data}>`;
    }
    return 'NO DATA>';
  }

  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    const command = `${mode}${pid}`;
    const data = this.mockData.get(command);
    if (data) {
      return data;
    }
    throw new Error('NO DATA');
  }

  async requestDtc(): Promise<DtcCode[]> {
    return [];
  }

  async clearDtc(): Promise<void> {
    // Mock implementation
  }

  setMockData(mode: ObdMode, pid: PidIdentifier, data: string): void {
    this.mockData.set(`${mode}${pid}`, data);
  }
}

describe('PollingManager', () => {
  it('should add PID to polling list', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    const pids = manager.getPollingPids();
    assert.equal(pids.length, 1);
    assert.equal(pids[0], 'Engine RPM');
  });

  it('should remove PID from polling list', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.addPid('Vehicle Speed');
    assert.equal(manager.getPollingPids().length, 2);

    manager.removePid('Engine RPM');
    const pids = manager.getPollingPids();
    assert.equal(pids.length, 1);
    assert.equal(pids[0], 'Vehicle Speed');
  });

  it('should remove all PIDs', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.addPid('Vehicle Speed');
    manager.addPid('Engine Coolant Temperature');
    assert.equal(manager.getPollingPids().length, 3);

    manager.removeAllPids();
    assert.equal(manager.getPollingPids().length, 0);
  });

  it('should throw error when adding non-existent PID', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    assert.throws(() => {
      manager.addPid('NonExistent PID');
    }, /does not exist in database/);
  });

  it('should start polling with valid PIDs', { timeout: 5000 }, async () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.startPolling(100); // Poll every 100ms

    assert.ok(manager.isActive());

    // Wait for a polling cycle
    await new Promise((resolve) => setTimeout(resolve, 250));

    manager.stopPolling();
    assert.ok(!manager.isActive());
  });

  it('should stop polling', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.startPolling(1000);
    assert.ok(manager.isActive());

    manager.stopPolling();
    assert.ok(!manager.isActive());
  });

  it('should emit data events on successful poll', { timeout: 5000 }, async () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    let dataReceived = false;
    driver.on('obd:data', (event) => {
      dataReceived = true;
      assert.ok(event.pid);
      assert.ok(event.value);
      assert.ok(event.value.name);
      assert.ok(typeof event.value.value === 'number');
    });

    manager.addPid('Engine RPM');
    manager.startPolling(100);

    // Wait for polling to emit event
    await new Promise((resolve) => setTimeout(resolve, 250));

    manager.stopPolling();
    assert.ok(dataReceived, 'Data event should have been emitted');
  });

  it('should handle PID request error gracefully', { timeout: 5000 }, async () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    // Add multiple PIDs, one will fail
    manager.addPid('Engine RPM');
    manager.addPid('Vehicle Speed');

    // Override requestPid to fail for RPM
    const originalRequestPid = driver.requestPid.bind(driver);
    driver.requestPid = async (mode: ObdMode, pid: PidIdentifier) => {
      if (pid === '0C') {
        throw new Error('Simulated error');
      }
      return originalRequestPid(mode, pid);
    };

    let speedDataReceived = false;
    driver.on('obd:data', (event) => {
      if (event.pid === 'Vehicle Speed') {
        speedDataReceived = true;
      }
    });

    manager.startPolling(100);

    // Wait for polling cycles
    await new Promise((resolve) => setTimeout(resolve, 250));

    manager.stopPolling();

    // Speed data should still be received despite RPM error
    assert.ok(speedDataReceived, 'Should receive data for valid PID despite error in other PID');
  });

  it('should throw error when starting polling without PIDs', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    assert.throws(() => {
      manager.startPolling();
    }, /empty PID list/);
  });

  it('should throw error when starting polling twice', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.startPolling(1000);

    assert.throws(() => {
      manager.startPolling(1000);
    }, /already active/);

    manager.stopPolling();
  });

  it('should use custom interval', { timeout: 5000 }, async () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    let pollCount = 0;
    driver.on('obd:data', () => {
      pollCount++;
    });

    manager.addPid('Engine RPM');
    manager.startPolling(50); // Very fast polling

    await new Promise((resolve) => setTimeout(resolve, 200));

    manager.stopPolling();

    // Should have polled multiple times
    assert.ok(pollCount >= 3, `Expected at least 3 polls, got ${pollCount}`);
  });

  it('should allow adding PIDs while polling', { timeout: 5000 }, async () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    manager.addPid('Engine RPM');
    manager.startPolling(100);

    // Add another PID while polling
    await new Promise((resolve) => setTimeout(resolve, 150));
    manager.addPid('Vehicle Speed');

    await new Promise((resolve) => setTimeout(resolve, 150));

    const pids = manager.getPollingPids();
    assert.equal(pids.length, 2);

    manager.stopPolling();
  });

  it('should return correct polling status', () => {
    const driver = new MockObdDriver();
    const db = new PidDatabase();
    const manager = new PollingManager(driver, db);

    assert.ok(!manager.isActive());

    manager.addPid('Engine RPM');
    manager.startPolling(1000);
    assert.ok(manager.isActive());

    manager.stopPolling();
    assert.ok(!manager.isActive());
  });
});
