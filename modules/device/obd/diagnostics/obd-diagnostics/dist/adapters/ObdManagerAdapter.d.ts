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
export declare class ObdManagerAdapter {
    private readonly pidDatabase;
    constructor();
    /**
     * Setup and configure Bluetooth OBD driver
     */
    setupDriver(portPath: string, baudRate?: number): BluetoothObdDriver;
    /**
     * Setup polling manager for driver
     */
    setupPolling(driver: ObdDriver, pids: string[]): PollingManager;
    /**
     * Connect driver and initialize
     */
    connectAndInitialize(portPath: string, baudRate?: number): Promise<ObdDriver>;
    /**
     * Start diagnostics with polling
     */
    startDiagnostics(driver: ObdDriver, pids: string[], interval?: number): Promise<PollingManager>;
    /**
     * Stop diagnostics
     */
    stopDiagnostics(manager: PollingManager): Promise<void>;
    /**
     * Get DTC codes
     */
    getDtcCodes(driver: ObdDriver): Promise<DtcCode[]>;
    /**
     * Clear DTC codes
     */
    clearDtcCodes(driver: ObdDriver): Promise<void>;
    /**
     * Get PID database reference
     */
    getPidDatabase(): PidDatabase;
}
