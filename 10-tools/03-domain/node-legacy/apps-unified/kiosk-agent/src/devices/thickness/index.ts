/**
 * Thickness Driver - Public API exports
 */

export { ThicknessDriver } from './driver/ThicknessDriver.js';
export type { ThicknessConfig, DeviceInfo, MeasurementSessionSummary } from './driver/ThicknessDriver.js';

export {
  ThicknessError,
  ThicknessConnectionError,
  ThicknessTimeoutError,
  ThicknessMeasurementError,
} from './driver/errors.js';

export {
  ThicknessStatus,
  type ZoneDefinition,
  type MeasurementPoint,
  type MeasurementSession,
  getZoneDefinition,
  getAllZones,
  createMeasurementPoint,
} from './models/Measurement.js';

export type { DeviceThickness } from './DeviceThickness.js';

export { registerThicknessDriverMetrics } from './metrics.js';
export type { ThicknessDriverMetrics } from './metrics.js';
