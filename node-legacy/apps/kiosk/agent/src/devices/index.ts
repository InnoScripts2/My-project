/**
 * Central exports for device-related utilities.
 * TODO: Trim to actual runtime needs once OBD/Thickness modules stabilize.
 */

export { Elm327Driver } from './obd/Elm327Driver.js';
export type { Elm327Options, ObdResult, ObdStatus, ObdDtc, ObdLiveData } from './obd/Elm327Driver.js';

export { retryWithPolicy, calculateBackoffDelay, loadRetryPolicyConfig, DEFAULT_RETRY_POLICY } from './common/retry.js';
export type { RetryPolicyOptions } from './common/retry.js';

export { dtcDatabase, DtcDatabase } from './obd/database/DtcDatabase.js';
export { pidDatabase, PidDatabase } from './obd/database/PidDatabase.js';
export { parseDtc, parseDtcCount } from './obd/parsers/DtcParser.js';
export { parsePidResponse } from './obd/parsers/PidParser.js';
