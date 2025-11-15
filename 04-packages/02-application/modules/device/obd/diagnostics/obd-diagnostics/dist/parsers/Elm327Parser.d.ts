/**
 * ELM327 response parser
 * Parses and validates responses from ELM327 adapter
 */
import type { ObdMode, PidIdentifier } from '../database/types.js';
/**
 * ELM327 response parser
 */
export declare class Elm327Parser {
    /**
     * Parse raw response from ELM327
     * Removes whitespace, line breaks, and prompt characters
     */
    static parseResponse(rawResponse: string): string;
    /**
     * Check if response is valid (not an error)
     */
    static isValidResponse(response: string): boolean;
    /**
     * Extract data bytes from OBD response
     * Removes mode prefix, PID prefix, and CAN headers
     */
    static extractDataBytes(response: string, mode: ObdMode, pid: PidIdentifier): string;
    /**
     * Parse multiline response into array of strings
     */
    static parseMultilineResponse(response: string): string[];
}
