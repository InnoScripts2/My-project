/**
 * DeviceThickness interface
 * Контракт для драйвера толщиномера
 */

import type { EventEmitter } from 'events';
import type { ThicknessStatus } from './models/Measurement.js';
import type { MeasurementPoint } from './models/Measurement.js';

export interface ThicknessConfig {
  scanTimeout?: number;
  connectionTimeout?: number;
  measurementTimeout?: number;
  targetDeviceName?: string;
  targetMAC?: string;
  totalZones?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface DeviceThickness extends EventEmitter {
  init(config?: ThicknessConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ThicknessStatus;
  getMeasurements(): MeasurementPoint[];
  disconnect(): Promise<void>;
}
