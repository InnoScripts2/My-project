/**
 * OBD Driver Interface
 * Defines the contract for OBD-II adapter drivers
 */

import type { EventEmitter } from 'events';

export type ObdMode = '01' | '03' | '04' | '09' | '22';
export type PidIdentifier = string;

export interface DtcCode {
  code: string;
  type: 'Powertrain' | 'Chassis' | 'Body' | 'Network';
  description?: string;
}

/**
 * OBD Driver interface
 * All OBD adapter drivers must implement this interface
 */
export interface ObdDriver extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendCommand(command: string): Promise<string>;
  requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string>;
  requestDtc(): Promise<DtcCode[]>;
  clearDtc(): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
}
