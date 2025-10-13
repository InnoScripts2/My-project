/**
 * API типы для endpoints устройств
 */

import { DtcEntry, PidValue } from '../devices/obd/driver/DeviceObd.js';
import { ThicknessMeasurement } from '../devices/thickness/driver/DeviceThickness.js';

// ============================================================================
// OBD-II API Types
// ============================================================================

export interface ObdStatusResponse {
  connected: boolean;
  adapter: string | null;
  protocol: string | null;
  vehicle: {
    make?: string;
    model?: string;
    year?: number;
  } | null;
}

export interface ObdConnectRequest {
  vehicleMake: string;
  model?: string;
  mode?: 'general' | 'obd' | 'hybrid';
  transport?: 'serial' | 'bluetooth' | 'auto';
  portPath?: string;
  bluetoothAddress?: string;
}

export interface ObdConnectResponse {
  success: boolean;
  adapter: string;
  protocol: string;
}

export interface ObdDtcResponse {
  codes: Array<{
    code: string;
    description?: string;
    category: 'P' | 'C' | 'B' | 'U';
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export interface ObdClearDtcRequest {
  confirm: boolean;
}

export interface ObdClearDtcResponse {
  success: boolean;
  timestamp: string;
}

export interface ObdPidResponse {
  timestamp: string;
  pids: Array<{
    name: string;
    value: number;
    unit: string;
  }>;
}

export interface ObdHealthResponse {
  connected: boolean;
  state: string;
  lastConnected?: string;
  lastError?: string;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    totalOperations: number;
    failedOperations: number;
  };
}

// ============================================================================
// Thickness API Types
// ============================================================================

export interface ThicknessStatusResponse {
  connected: boolean;
  device: string | null;
  state: string;
  measuredZones: number;
  totalZones: number;
}

export interface ThicknessConnectRequest {
  deviceName?: string;
  deviceAddress?: string;
  vehicleType: 'sedan' | 'minivan';
}

export interface ThicknessConnectResponse {
  success: boolean;
  device: string;
  totalZones: number;
}

export interface ThicknessStartMeasuringResponse {
  success: boolean;
  status: string;
}

export interface ThicknessMeasurementsResponse {
  measurements: ThicknessMeasurement[];
  summary: {
    total: number;
    normal: number;
    suspicious: number;
    repainted: number;
  };
}

export interface ThicknessHealthResponse {
  connected: boolean;
  state: string;
  lastConnected?: string;
  lastError?: string;
  progress: {
    measuredZones: number;
    totalZones: number;
    percentage: number;
  };
}

// ============================================================================
// Common API Types
// ============================================================================

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, any>;
}

export interface ApiSuccess<T = any> {
  success: true;
  data?: T;
}
