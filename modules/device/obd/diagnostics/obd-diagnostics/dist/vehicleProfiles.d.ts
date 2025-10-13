/**
 * Vehicle-specific OBD-II profiles for adaptive protocol selection
 *
 * This module provides configuration profiles for different vehicle manufacturers,
 * with special focus on Toyota and Lexus requirements.
 */
export type ObdProtocol = 'AUTO' | 'J1850_PWM' | 'J1850_VPW' | 'ISO_9141_2' | 'KWP_5BAUD' | 'KWP_FAST' | 'CAN_11B_500' | 'CAN_29B_500' | 'CAN_11B_250' | 'CAN_29B_250';
export interface VehicleProtocolConfig {
    /** Protocol identifier for ELM327 */
    protocol: ObdProtocol;
    /** ELM327 AT command to set protocol */
    elmCommand: string;
    /** Recommended timeout in milliseconds */
    timeoutMs: number;
    /** Additional initialization commands */
    initCommands?: string[];
    /** CAN headers (if applicable) */
    headers?: {
        request: string;
        response: string;
    };
    /** Description of the protocol */
    description: string;
}
export interface VehicleProfile {
    /** Vehicle manufacturer */
    make: string;
    /** Model name (optional, for specific overrides) */
    model?: string;
    /** Model year range */
    yearRange?: {
        min?: number;
        max?: number;
    };
    /** Primary protocol to try first */
    primaryProtocol: VehicleProtocolConfig;
    /** Fallback protocols to try if primary fails */
    fallbackProtocols?: VehicleProtocolConfig[];
    /** Vehicle-specific quirks and workarounds */
    quirks?: {
        /** Requires longer init delay */
        slowInit?: boolean;
        /** Needs specific header configuration */
        customHeaders?: boolean;
        /** Requires extended timeout for certain commands */
        extendedTimeout?: boolean;
        /** Known issues or limitations */
        notes?: string;
    };
}
/**
 * Protocol configurations for ELM327
 */
declare const PROTOCOL_CONFIGS: Record<ObdProtocol, VehicleProtocolConfig>;
/**
 * Get vehicle profile by make and optional year
 */
export declare function getVehicleProfile(make: string, year?: number): VehicleProfile;
/**
 * Get all protocols to try for a vehicle in priority order
 */
export declare function getProtocolSequence(make: string, year?: number): VehicleProtocolConfig[];
/**
 * Get recommended timeout for a vehicle
 */
export declare function getRecommendedTimeout(make: string, year?: number): number;
/**
 * Check if vehicle requires special handling
 */
export declare function requiresSlowInit(make: string, year?: number): boolean;
/**
 * Get initialization commands for a vehicle
 */
export declare function getInitCommands(make: string, year?: number): string[];
/**
 * Export all protocol configs for external use
 */
export { PROTOCOL_CONFIGS };
