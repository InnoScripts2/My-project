/**
 * Thickness Driver - Public API exports
 */
export { ThicknessDriver } from './driver/ThicknessDriver.js';
export { ThicknessError, ThicknessConnectionError, ThicknessTimeoutError, ThicknessMeasurementError, } from './driver/errors.js';
export { ThicknessStatus, getZoneDefinition, getAllZones, createMeasurementPoint, } from './models/Measurement.js';
export { registerThicknessDriverMetrics } from './metrics.js';
