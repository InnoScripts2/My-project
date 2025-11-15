/**
 * OBD Manager Adapter
 * Adapter to integrate new OBD infrastructure with existing ObdConnectionManager
 */

import { BluetoothObdDriver } from '../drivers/BluetoothObdDriver.js';
import { PidDatabase } from '../database/PidDatabase.js';
import { PollingManager } from '../polling/PollingManager.js';
import type { ObdDriver } from '../drivers/ObdDriverInterface.js';
import type { DtcCode } from '../database/types.js';

/**
 * OBD Manager Adapter
 * Provides high-level interface for OBD operations
 */
export class ObdManagerAdapter {
  private readonly pidDatabase: PidDatabase;

  constructor() {
    this.pidDatabase = new PidDatabase();
  }

  /**
   * Setup and configure Bluetooth OBD driver
   */
  setupDriver(portPath: string, baudRate: number = 38400): BluetoothObdDriver {
    return new BluetoothObdDriver({
      portPath,
      baudRate,
    });
  }

  /**
   * Setup polling manager for driver
   */
  setupPolling(driver: ObdDriver, pids: string[]): PollingManager {
    const manager = new PollingManager(driver, this.pidDatabase);
    
    // Add all requested PIDs
    for (const pid of pids) {
      manager.addPid(pid);
    }

    return manager;
  }

  /**
   * Connect driver and initialize
   */
  async connectAndInitialize(portPath: string, baudRate?: number): Promise<ObdDriver> {
    const driver = this.setupDriver(portPath, baudRate);
    await driver.connect();
    return driver;
  }

  /**
   * Start diagnostics with polling
   */
  async startDiagnostics(driver: ObdDriver, pids: string[], interval: number = 1000): Promise<PollingManager> {
    const manager = this.setupPolling(driver, pids);
    manager.startPolling(interval);
    return manager;
  }

  /**
   * Stop diagnostics
   */
  async stopDiagnostics(manager: PollingManager): Promise<void> {
    manager.stopPolling();
  }

  /**
   * Get DTC codes
   */
  async getDtcCodes(driver: ObdDriver): Promise<DtcCode[]> {
    return await driver.requestDtc();
  }

  /**
   * Clear DTC codes
   */
  async clearDtcCodes(driver: ObdDriver): Promise<void> {
    await driver.clearDtc();
  }

  /**
   * Get PID database reference
   */
  getPidDatabase(): PidDatabase {
    return this.pidDatabase;
  }
}
