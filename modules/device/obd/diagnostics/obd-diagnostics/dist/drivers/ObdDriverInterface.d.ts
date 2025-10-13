/**
 * OBD Driver Interface
 * Defines the contract for OBD-II adapter drivers
 */
import type { EventEmitter } from 'events';
import type { ObdMode, PidIdentifier, DtcCode } from '../database/types.js';
/**
 * OBD Driver interface
 * All OBD adapter drivers must implement this interface
 */
export interface ObdDriver extends EventEmitter {
    /**
     * Connect to the OBD adapter
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the OBD adapter
     */
    disconnect(): Promise<void>;
    /**
     * Check if adapter is connected
     */
    isConnected(): boolean;
    /**
     * Send raw command to adapter
     * @param command - Raw command string
     * @returns Raw response string
     */
    sendCommand(command: string): Promise<string>;
    /**
     * Request PID data
     * @param mode - OBD mode
     * @param pid - PID identifier
     * @returns Hex string of data bytes
     */
    requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string>;
    /**
     * Request diagnostic trouble codes
     * @returns Array of DTC codes
     */
    requestDtc(): Promise<DtcCode[]>;
    /**
     * Clear diagnostic trouble codes
     */
    clearDtc(): Promise<void>;
    /**
     * Register event listener
     */
    on(event: string, listener: (...args: any[]) => void): this;
    /**
     * Unregister event listener
     */
    off(event: string, listener: (...args: any[]) => void): this;
    /**
     * Remove all event listeners
     */
    removeAllListeners(event?: string): this;
}
