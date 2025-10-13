/**
 * Custom OBD-II Error Classes
 * Provides specific error types for different OBD failure scenarios
 */
/**
 * Base OBD Error class
 */
export declare class ObdError extends Error {
    readonly code: string;
    readonly details: unknown;
    readonly timestamp: string;
    constructor(message: string, code: string, details?: unknown);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        details: unknown;
        timestamp: string;
        stack: string | undefined;
    };
}
/**
 * Connection-related errors
 */
export declare class ObdConnectionError extends ObdError {
    constructor(message: string, details?: unknown);
}
/**
 * Timeout errors
 */
export declare class ObdTimeoutError extends ObdError {
    constructor(message: string, command?: string, details?: Record<string, unknown>);
}
/**
 * Parse/format errors
 */
export declare class ObdParseError extends ObdError {
    constructor(message: string, rawData?: string, details?: Record<string, unknown>);
}
/**
 * Unsupported command/feature errors
 */
export declare class ObdUnsupportedError extends ObdError {
    constructor(message: string, command?: string, details?: Record<string, unknown>);
}
/**
 * Protocol errors
 */
export declare class ObdProtocolError extends ObdError {
    constructor(message: string, details?: unknown);
}
/**
 * Transport layer errors
 */
export declare class ObdTransportError extends ObdError {
    constructor(message: string, details?: unknown);
}
