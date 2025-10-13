/**
 * ELM327 command constants
 * Standard AT commands and OBD-II mode requests
 */
/**
 * AT Commands for ELM327 initialization and configuration
 */
export const RESET = 'ATZ';
export const ECHO_OFF = 'ATE0';
export const LINEFEED_OFF = 'ATL0';
export const SPACES_OFF = 'ATS0';
export const HEADERS_ON = 'ATH1';
export const AUTO_PROTOCOL = 'ATSP0';
/**
 * Initialization sequence for ELM327
 * Commands sent in order during connection
 */
export const INIT_SEQUENCE = [
    RESET,
    ECHO_OFF,
    LINEFEED_OFF,
    SPACES_OFF,
    HEADERS_ON,
    AUTO_PROTOCOL,
];
/**
 * Build Mode 01 request command (current data)
 */
export function REQUEST_MODE_01(pid) {
    return `01${pid.toUpperCase()}`;
}
/**
 * Mode 03 request (read diagnostic trouble codes)
 */
export const REQUEST_MODE_03 = '03';
/**
 * Mode 04 request (clear diagnostic trouble codes)
 */
export const REQUEST_MODE_04 = '04';
/**
 * Build Mode 09 request command (vehicle information)
 */
export function REQUEST_MODE_09(pid) {
    return `09${pid.toUpperCase()}`;
}
/**
 * Build generic OBD request for any mode and PID
 */
export function buildObdRequest(mode, pid) {
    return `${mode}${pid.toUpperCase()}`;
}
