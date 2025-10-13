/**
 * PID Parser
 * Parses OBD-II PID values from Mode 01 responses
 * Uses formulas from node-bluetooth-obd-master
 */
import type { PidValue } from '../database/types.js';
export declare class PidParser {
    private static database;
    /**
     * Parse PID value from hex response
     */
    static parsePid(pid: string, hexData: string): PidValue;
    /**
     * Validate PID exists and is supported
     */
    static isPidSupported(pid: string): boolean;
    /**
     * Get PID metadata
     */
    static getPidMetadata(pid: string): import("../database/types.js").PidDefinition | undefined;
}
