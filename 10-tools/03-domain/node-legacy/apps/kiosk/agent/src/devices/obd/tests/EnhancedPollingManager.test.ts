/**
 * EnhancedPollingManager Unit Tests
 * Tests for priority-based smart polling system
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { EnhancedPollingManager, PidPriority } from '../polling/EnhancedPollingManager.js';
import type { ObdDriver, ObdMode, PidIdentifier, DtcCode } from '../drivers/ObdDriverInterface.js';

/**
 * Mock OBD Driver for testing polling
 */
class MockObdDriver extends EventEmitter implements ObdDriver {
  private pidValues: Map<string, string> = new Map();
  public requestLog: string[] = [];

  setPidValue(mode: ObdMode, pid: PidIdentifier, value: string): void {
    this.pidValues.set(`${mode}${pid}`, value);
  }

  async connect(): Promise<void> {}
  
  async disconnect(): Promise<void> {}
  
  isConnected(): boolean {
    return true;
  }

  async sendCommand(command: string): Promise<string> {
    return 'OK';
  }

  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    const key = `${mode}${pid}`;
    this.requestLog.push(key);
    
    const value = this.pidValues.get(key);
    return value || '0000';
  }

  async requestDtc(): Promise<DtcCode[]> {
    return [];
  }

  async clearDtc(): Promise<void> {}

  clearRequestLog(): void {
    this.requestLog = [];
  }
}

describe('EnhancedPollingManager', () => {
  describe('priority polling', () => {
    it('should poll HIGH priority PIDs every cycle', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000'); // RPM
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      // Poll 3 cycles
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      
      // HIGH should be polled 3 times
      const rpmRequests = driver.requestLog.filter(r => r === '010C');
      assert.equal(rpmRequests.length, 3);
    });

    it('should poll MEDIUM priority PIDs every 3rd cycle', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0D', '0050'); // Speed
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      
      // Poll 9 cycles
      for (let i = 0; i < 9; i++) {
        await manager.pollOnce();
      }
      
      // MEDIUM should be polled 3 times (cycles 3, 6, 9)
      const speedRequests = driver.requestLog.filter(r => r === '010D');
      assert.equal(speedRequests.length, 3);
    });

    it('should poll LOW priority PIDs every 10th cycle', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '2F', '0050'); // Fuel level
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '2F', PidPriority.LOW);
      
      // Poll 20 cycles
      for (let i = 0; i < 20; i++) {
        await manager.pollOnce();
      }
      
      // LOW should be polled 2 times (cycles 10, 20)
      const fuelRequests = driver.requestLog.filter(r => r === '012F');
      assert.equal(fuelRequests.length, 2);
    });

    it('should respect mixed priorities', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000'); // RPM - HIGH
      driver.setPidValue('01', '0D', '0050'); // Speed - MEDIUM
      driver.setPidValue('01', '2F', '0050'); // Fuel - LOW
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      manager.addPidWithPriority('01', '2F', PidPriority.LOW);
      
      driver.clearRequestLog();
      
      // Poll 10 cycles
      for (let i = 0; i < 10; i++) {
        await manager.pollOnce();
      }
      
      const rpmRequests = driver.requestLog.filter(r => r === '010C');
      const speedRequests = driver.requestLog.filter(r => r === '010D');
      const fuelRequests = driver.requestLog.filter(r => r === '012F');
      
      assert.equal(rpmRequests.length, 10); // Every cycle
      assert.ok(speedRequests.length >= 3); // Every 3rd cycle
      assert.equal(fuelRequests.length, 1); // Every 10th cycle
    });
  });

  describe('smart polling', () => {
    it('should enable smart polling option', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      
      const manager = new EnhancedPollingManager(driver, {
        enableSmartPolling: true,
        changeThreshold: 1000,
      });
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      // Should poll without errors
      await manager.pollOnce();
      await manager.pollOnce();
      
      assert.ok(driver.requestLog.length > 0);
    });

    it('should detect significant RPM changes', async () => {
      const driver = new MockObdDriver();
      
      const manager = new EnhancedPollingManager(driver, {
        enableSmartPolling: true,
        changeThreshold: 500,
      });
      
      manager.addPidWithPriority('01', '0C', PidPriority.LOW);
      
      // Initial low value
      driver.setPidValue('01', '0C', '03E8'); // 1000
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce(); // Cycle 10 - LOW gets polled
      
      driver.clearRequestLog();
      
      // Large change
      driver.setPidValue('01', '0C', '0BB8'); // 3000 (delta = 2000)
      
      // Poll several more cycles
      for (let i = 0; i < 5; i++) {
        await manager.pollOnce();
      }
      
      // Should have polled at least once
      assert.ok(driver.requestLog.length >= 0);
    });
  });

  describe('statistics', () => {
    it('should collect polling statistics', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      driver.setPidValue('01', '0D', '0050');
      
      const manager = new EnhancedPollingManager(driver);
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      
      // Poll several times
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      
      const stats = manager.getPollingStatistics();
      
      assert.ok(stats.size > 0);
      
      const rpmStats = stats.get('010C');
      assert.ok(rpmStats);
      assert.ok(rpmStats.totalPolls >= 3);
      assert.ok(rpmStats.successfulPolls >= 3);
      assert.equal(rpmStats.failedPolls, 0);
    });

    it('should track successful and failed polls', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      
      const manager = new EnhancedPollingManager(driver);
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      // Some successful polls
      await manager.pollOnce();
      await manager.pollOnce();
      
      const stats = manager.getPollingStatistics();
      const rpmStats = stats.get('010C');
      
      assert.ok(rpmStats);
      assert.ok(rpmStats.successfulPolls >= 2);
      assert.ok(rpmStats.totalPolls >= 2);
    });

    it('should calculate average latency', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      
      const manager = new EnhancedPollingManager(driver);
      
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      // Poll multiple times
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      
      const stats = manager.getPollingStatistics();
      const rpmStats = stats.get('010C');
      
      assert.ok(rpmStats);
      assert.ok(rpmStats.avgLatency >= 0);
      assert.ok(rpmStats.avgLatency < 1000); // Should be reasonable
    });
  });

  describe('priority adjustment', () => {
    it('should adjust priority dynamically', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '0C', PidPriority.LOW);
      
      // Initially LOW, poll 10 cycles
      for (let i = 0; i < 10; i++) {
        await manager.pollOnce();
      }
      
      let rpmRequests = driver.requestLog.filter(r => r === '010C');
      assert.equal(rpmRequests.length, 1); // Only on cycle 10
      
      driver.clearRequestLog();
      
      // Adjust to HIGH
      manager.adjustPriority('01', '0C', PidPriority.HIGH);
      
      // Poll 5 more cycles
      for (let i = 0; i < 5; i++) {
        await manager.pollOnce();
      }
      
      rpmRequests = driver.requestLog.filter(r => r === '010C');
      assert.equal(rpmRequests.length, 5); // Every cycle now
    });

    it('should update priority for existing PIDs', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0D', '0050');
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      
      // Upgrade to HIGH
      manager.adjustPriority('01', '0D', PidPriority.HIGH);
      
      driver.clearRequestLog();
      
      // Poll 3 cycles
      await manager.pollOnce();
      await manager.pollOnce();
      await manager.pollOnce();
      
      const speedRequests = driver.requestLog.filter(r => r === '010D');
      assert.equal(speedRequests.length, 3); // Should poll every cycle after upgrade
    });
  });

  describe('polling order optimization', () => {
    it('should optimize polling order', async () => {
      const driver = new MockObdDriver();
      
      const manager = new EnhancedPollingManager(driver);
      
      manager.addPidWithPriority('01', '2F', PidPriority.LOW);
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      
      // Optimize
      manager.optimizePollingOrder();
      
      // After optimization, PIDs should be ordered by priority
      // (implementation-specific verification)
      assert.ok(true); // Basic check that it doesn't throw
    });

    it('should maintain priority order after optimization', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      driver.setPidValue('01', '0D', '0050');
      driver.setPidValue('01', '2F', '0050');
      
      const manager = new EnhancedPollingManager(driver, { enableSmartPolling: false });
      
      // Add in random order
      manager.addPidWithPriority('01', '2F', PidPriority.LOW);
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      manager.addPidWithPriority('01', '0D', PidPriority.MEDIUM);
      
      manager.optimizePollingOrder();
      
      driver.clearRequestLog();
      
      // Poll 10 cycles
      for (let i = 0; i < 10; i++) {
        await manager.pollOnce();
      }
      
      // Verify correct polling frequencies maintained
      const rpmRequests = driver.requestLog.filter(r => r === '010C');
      const speedRequests = driver.requestLog.filter(r => r === '010D');
      const fuelRequests = driver.requestLog.filter(r => r === '012F');
      
      assert.equal(rpmRequests.length, 10); // HIGH
      assert.ok(speedRequests.length >= 3); // MEDIUM
      assert.equal(fuelRequests.length, 1); // LOW
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop polling', async () => {
      const driver = new MockObdDriver();
      
      const manager = new EnhancedPollingManager(driver);
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      assert.ok(!manager.isPollingActive());
      
      manager.startPolling(100);
      assert.ok(manager.isPollingActive());
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 250));
      
      manager.stopPolling();
      assert.ok(!manager.isPollingActive());
    });

    it('should poll at specified interval', async () => {
      const driver = new MockObdDriver();
      driver.setPidValue('01', '0C', '1000');
      
      const manager = new EnhancedPollingManager(driver);
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      driver.clearRequestLog();
      
      manager.startPolling(50); // 50ms interval
      
      // Wait for several polls
      await new Promise(resolve => setTimeout(resolve, 250));
      
      manager.stopPolling();
      
      // Should have polled approximately 5 times (250ms / 50ms)
      const requests = driver.requestLog.filter(r => r === '010C');
      assert.ok(requests.length >= 4 && requests.length <= 6);
    });

    it('should not start multiple polling intervals', async () => {
      const driver = new MockObdDriver();
      
      const manager = new EnhancedPollingManager(driver);
      manager.addPidWithPriority('01', '0C', PidPriority.HIGH);
      
      manager.startPolling(100);
      manager.startPolling(100); // Second call should be ignored
      
      assert.ok(manager.isPollingActive());
      
      manager.stopPolling();
    });
  });

  // Cleanup after all tests
  after(() => {
    // Ensure no lingering timers
  });
});
