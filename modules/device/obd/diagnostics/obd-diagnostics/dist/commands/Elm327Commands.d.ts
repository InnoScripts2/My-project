/**
 * ELM327 command constants
 * Standard AT commands and OBD-II mode requests
 */
import type { ObdMode, PidIdentifier } from '../database/types.js';
/**
 * AT Commands for ELM327 initialization and configuration
 */
export declare const RESET = "ATZ";
export declare const ECHO_OFF = "ATE0";
export declare const LINEFEED_OFF = "ATL0";
export declare const SPACES_OFF = "ATS0";
export declare const HEADERS_ON = "ATH1";
export declare const AUTO_PROTOCOL = "ATSP0";
/**
 * Initialization sequence for ELM327
 * Commands sent in order during connection
 */
export declare const INIT_SEQUENCE: readonly ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
/**
 * Build Mode 01 request command (current data)
 */
export declare function REQUEST_MODE_01(pid: PidIdentifier): string;
/**
 * Mode 03 request (read diagnostic trouble codes)
 */
export declare const REQUEST_MODE_03 = "03";
/**
 * Mode 04 request (clear diagnostic trouble codes)
 */
export declare const REQUEST_MODE_04 = "04";
/**
 * Build Mode 09 request command (vehicle information)
 */
export declare function REQUEST_MODE_09(pid: PidIdentifier): string;
/**
 * Build generic OBD request for any mode and PID
 */
export declare function buildObdRequest(mode: ObdMode, pid: PidIdentifier): string;
