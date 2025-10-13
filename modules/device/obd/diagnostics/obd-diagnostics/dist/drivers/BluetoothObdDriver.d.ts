/**
 * Bluetooth OBD Driver
 * Implements OBD-II communication over Bluetooth Serial Port (SPP)
 * Uses ELM327 protocol
 */
import { EventEmitter } from 'events';
import type { ObdDriver } from './ObdDriverInterface.js';
import type { ObdMode, PidIdentifier, DtcCode } from '../database/types.js';
/**
 * Configuration for Bluetooth OBD driver
 */
export interface BluetoothObdConfig {
    portPath: string;
    baudRate?: number;
}
/**
 * Custom errors
 */
export declare class ObdConnectionError extends Error {
    constructor(message: string);
}
export declare class ObdTimeoutError extends Error {
    constructor(message: string);
}
export declare class ObdCommandError extends Error {
    constructor(message: string);
}
/**
 * Bluetooth Serial Port OBD Driver
 * Implements ELM327 protocol over Bluetooth SPP
 */
export declare class BluetoothObdDriver extends EventEmitter implements ObdDriver {
    private serialPort;
    private connected;
    private responseBuffer;
    private commandQueue;
    private processing;
    private readonly portPath;
    private readonly baudRate;
    private readonly commandTimeout;
    constructor(config: BluetoothObdConfig);
    /**
     * Connect to OBD adapter and initialize ELM327
     */
    connect(): Promise<void>;
    /**
     * Disconnect from OBD adapter
     */
    disconnect(): Promise<void>;
    /**
     * Check if adapter is connected
     */
    isConnected(): boolean;
    /**
     * Send raw command to adapter
     */
    sendCommand(command: string): Promise<string>;
    /**
     * Request PID data
     */
    requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string>;
    /**
     * Request diagnostic trouble codes
     */
    requestDtc(): Promise<DtcCode[]>;
    /**
     * Clear diagnostic trouble codes
     */
    clearDtc(): Promise<void>;
    /**
     * Initialize ELM327 adapter
     */
    private initializeElm327;
    /**
     * Process command queue
     */
    private processQueue;
    /**
     * Write data to serial port
     */
    private writeToPort;
    /**
     * Handle incoming data from serial port
     */
    private handleData;
    /**
     * Handle serial port close
     */
    private handleClose;
    /**
     * Handle serial port error
     */
    private handleError;
}
