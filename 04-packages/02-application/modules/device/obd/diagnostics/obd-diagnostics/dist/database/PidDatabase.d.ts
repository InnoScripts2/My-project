/**
 * PID Database
 * Ported from node-bluetooth-obd-master (Apache-2.0 license)
 * Contains PID definitions with conversion formulas
 */
import type { PidDefinition, ObdMode, PidIdentifier } from './types.js';
/**
 * PID Database class
 * Provides methods to query and validate PIDs
 */
export declare class PidDatabase {
    private readonly pids;
    constructor();
    /**
     * Get PID definition by name
     */
    getPidByName(name: string): PidDefinition | undefined;
    /**
     * Get PID definition by mode and PID identifier
     */
    getPidByModeAndPid(mode: ObdMode, pid: PidIdentifier): PidDefinition | undefined;
    /**
     * Get all PIDs (returns a copy)
     */
    getAllPids(): PidDefinition[];
    /**
     * Get PIDs by mode
     */
    getPidsByMode(mode: ObdMode): PidDefinition[];
    /**
     * Validate that a PID exists by name
     */
    validatePidExists(name: string): boolean;
}
