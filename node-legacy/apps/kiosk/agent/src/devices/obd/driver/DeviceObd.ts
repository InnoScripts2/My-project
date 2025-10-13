/**
 * DeviceObd Interface
 * Core interface for OBD-II device drivers according to specification
 */

import { EventEmitter } from 'events';

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

export type DtcCategory = 'P' | 'C' | 'B' | 'U';

export interface DtcEntry {
  code: string;
  category: DtcCategory;
  description?: string;
  rawBytes: string;
}

export interface PidValue {
  pid: string;
  value: number;
  unit: string;
  rawBytes: string;
  timestamp: number;
}

export interface ObdConfig {
  transport: 'serial' | 'bluetooth';
  port: string;
  baudRate?: number;
  timeout?: number;
  retries?: number;
}

export interface DeviceObd extends EventEmitter {
  init(config: ObdConfig): Promise<void>;
  readDtc(): Promise<DtcEntry[]>;
  clearDtc(): Promise<boolean>;
  readPid(pid: string): Promise<PidValue>;
  getStatus(): ObdStatus;
  disconnect(): Promise<void>;
}
