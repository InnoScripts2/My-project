/**
 * Central export barrel for the OBD subsystem.
 * Explicit .js extensions keep TypeScript NodeNext happy.
 */

export * from './types/ObdTypes.js';

export { DtcDatabase, dtcDatabase } from './database/DtcDatabase.js';
export { PidDatabase, pidDatabase } from './database/PidDatabase.js';

export { parseDtc, parseDtcCount } from './parsers/DtcParser.js';
export { parsePidResponse } from './parsers/PidParser.js';

export {
  Transport,
  TransportFactory,
  BaseTransport,
  MockTransport
} from './transport/Transport.js';
export type {
  SerialConfig,
  BluetoothConfig,
  UsbConfig,
  TransportEvents
} from './transport/Transport.js';

export { Elm327Driver } from './drivers/Elm327Driver.js';
export type { Elm327Config } from './drivers/Elm327Driver.js';

export { ObdManager } from './ObdManager.js';
export type { ObdManagerConfig, ObdDeviceInfo } from './ObdManager.js';
