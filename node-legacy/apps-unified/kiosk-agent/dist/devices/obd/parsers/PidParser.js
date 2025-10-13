/**
 * PID Parser
 * Parses OBD-II PID values from Mode 01 responses
 * Uses formulas from node-bluetooth-obd-master
 */
import { PidDatabase } from '../database/PidDatabase.js';
export class PidParser {
    /**
     * Parse PID value from hex response
     */
    static parsePid(pid, hexData) {
        const pidDef = this.database.getPidByModeAndPid('01', pid);
        if (!pidDef) {
            throw new Error(`Unknown PID: ${pid}`);
        }
        try {
            const value = pidDef.convertToUseful(hexData);
            return {
                name: pidDef.name,
                value,
                unit: pidDef.unit,
                timestamp: new Date(),
            };
        }
        catch (error) {
            throw new Error(`Failed to parse PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Validate PID exists and is supported
     */
    static isPidSupported(pid) {
        return this.database.getPidByModeAndPid('01', pid) !== undefined;
    }
    /**
     * Get PID metadata
     */
    static getPidMetadata(pid) {
        return this.database.getPidByModeAndPid('01', pid);
    }
}
PidParser.database = new PidDatabase();
