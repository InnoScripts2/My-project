/**
 * DeviceObd Interface
 * Core interface for OBD-II device drivers according to specification
 * Provides standardized methods for OBD-II adapter communication
 */

import { EventEmitter } from 'events';

/**
 * OBD adapter status enumeration
 * Tracks the current operational state of the adapter
 */
export enum ObdStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SCANNING = 'scanning',
  IDLE = 'idle',
  ERROR = 'error',
  UNAVAILABLE = 'unavailable',
}

/**
 * DTC category based on SAE J2012 standard
 * P = Powertrain, C = Chassis, B = Body, U = Network
 */
export type DtcCategory = 'P' | 'C' | 'B' | 'U';

/**
 * Diagnostic Trouble Code entry
 */
export interface DtcEntry {
  code: string;
  category: DtcCategory;
  description?: string;
  rawBytes: string;
}

/**
 * PID value with metadata
 */
export interface PidValue {
  pid: string;
  value: number;
  unit: string;
  rawBytes: string;
  timestamp: number;
}

/**
 * OBD adapter configuration
 */
export interface ObdConfig {
  transport: 'serial' | 'bluetooth';
  port: string;
  baudRate?: number;
  timeout?: number;
  retries?: number;
  reconnectDelay?: number;
  reconnectAttempts?: number;
  pidPollRate?: number;
}

/**
 * Device OBD Interface
 * All OBD-II drivers must implement this interface
 */
export interface DeviceObd extends EventEmitter {
  /**
   * Initialize adapter and establish connection
   */
  init(config: ObdConfig): Promise<void>;

  /**
   * Read diagnostic trouble codes (Mode 03)
   */
  readDtc(): Promise<DtcEntry[]>;

  /**
   * Clear diagnostic trouble codes (Mode 04)
   */
  clearDtc(): Promise<boolean>;

  /**
   * Read PID value (Mode 01)
   */
  readPid(pid: string): Promise<PidValue>;

  /**
   * Get current adapter status
   */
  getStatus(): ObdStatus;

  /**
   * Disconnect from adapter
   */
  disconnect(): Promise<void>;
}

/**
 * Supported events for DeviceObd
 */
export interface DeviceObdEvents {
  connected: () => void;
  disconnected: () => void;
  'dtc-read': (dtcs: DtcEntry[]) => void;
  'dtc-cleared': (success: boolean) => void;
  'pid-read': (value: PidValue) => void;
  error: (error: Error) => void;
  timeout: (command: string) => void;
  'status-change': (status: ObdStatus) => void;
}
