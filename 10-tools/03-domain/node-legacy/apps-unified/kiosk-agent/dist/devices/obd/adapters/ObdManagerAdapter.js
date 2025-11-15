/**
 * OBD Manager Adapter
 * Adapter to integrate new OBD infrastructure with existing ObdConnectionManager
 */
import { BluetoothObdDriver } from '../drivers/BluetoothObdDriver.js';
import { PidDatabase } from '../database/PidDatabase.js';
import { PollingManager } from '../polling/PollingManager.js';
/**
 * OBD Manager Adapter
 * Provides high-level interface for OBD operations
 */
export class ObdManagerAdapter {
    constructor() {
        this.pidDatabase = new PidDatabase();
    }
    /**
     * Setup and configure Bluetooth OBD driver
     */
    setupDriver(portPath, baudRate = 38400) {
        return new BluetoothObdDriver({
            portPath,
            baudRate,
        });
    }
    /**
     * Setup polling manager for driver
     */
    setupPolling(driver, pids) {
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
    async connectAndInitialize(portPath, baudRate) {
        const driver = this.setupDriver(portPath, baudRate);
        await driver.connect();
        return driver;
    }
    /**
     * Start diagnostics with polling
     */
    async startDiagnostics(driver, pids, interval = 1000) {
        const manager = this.setupPolling(driver, pids);
        manager.startPolling(interval);
        return manager;
    }
    /**
     * Stop diagnostics
     */
    async stopDiagnostics(manager) {
        manager.stopPolling();
    }
    /**
     * Get DTC codes
     */
    async getDtcCodes(driver) {
        return await driver.requestDtc();
    }
    /**
     * Clear DTC codes
     */
    async clearDtcCodes(driver) {
        await driver.clearDtc();
    }
    /**
     * Get PID database reference
     */
    getPidDatabase() {
        return this.pidDatabase;
    }
}
