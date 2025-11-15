/**
 * ELM327 response parser
 * Parses and validates responses from ELM327 adapter
 */

import type { ObdMode, PidIdentifier } from '../database/types.js';

/**
 * ELM327 response parser
 */
export class Elm327Parser {
  /**
   * Parse raw response from ELM327
   * Removes whitespace, line breaks, and prompt characters
   */
  static parseResponse(rawResponse: string): string {
    return rawResponse
      .replace(/\s+/g, '')
      .replace(/>/g, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .trim()
      .toUpperCase();
  }

  /**
   * Check if response is valid (not an error)
   */
  static isValidResponse(response: string): boolean {
    const upper = response.toUpperCase();
    const errorPatterns = ['NODATA', 'ERROR', '?', 'UNABLETOCONNECT', 'BUSINIT'];
    return !errorPatterns.some((pattern) => upper.includes(pattern));
  }

  /**
   * Extract data bytes from OBD response
   * Removes mode prefix, PID prefix, and CAN headers
   */
  static extractDataBytes(response: string, mode: ObdMode, pid: PidIdentifier): string {
    const cleaned = this.parseResponse(response);
    
    if (!this.isValidResponse(cleaned)) {
      throw new Error(`Invalid OBD response: ${response}`);
    }

    // Expected response format: mode+0x40 PID databytes
    // Mode 01 -> response 41, Mode 03 -> response 43, etc.
    const expectedPrefix = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase();
    const pidUpper = pid.toUpperCase();

    // Handle CAN headers (7E8, 7E9, etc.)
    let workingString = cleaned;
    const canHeaderMatch = workingString.match(/^7E[0-9A-F]/);
    if (canHeaderMatch) {
      // Remove CAN header (7E8 03...) - skip header (3 chars) and byte count (2 chars)
      workingString = workingString.substring(5);
    }

    // Find the mode response prefix
    const prefixIndex = workingString.indexOf(expectedPrefix);
    if (prefixIndex === -1) {
      throw new Error(`Response does not contain expected mode prefix ${expectedPrefix}`);
    }

    // Skip mode prefix
    workingString = workingString.substring(prefixIndex + 2);

    // For mode 03 (DTC), return all data after prefix
    if (mode === '03') {
      return workingString;
    }

    // For other modes, skip PID and return data
    if (workingString.startsWith(pidUpper)) {
      return workingString.substring(2);
    }

    // If PID not found, return all data (some responses omit PID)
    return workingString;
  }

  /**
   * Parse multiline response into array of strings
   */
  static parseMultilineResponse(response: string): string[] {
    return response
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== '>');
  }
}
