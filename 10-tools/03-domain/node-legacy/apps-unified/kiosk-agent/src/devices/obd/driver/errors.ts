/**
 * Custom OBD-II Error Classes
 * Provides specific error types for different OBD failure scenarios
 */

/**
 * Base OBD Error class
 */
export class ObdError extends Error {
  public readonly code: string;
  public readonly details: unknown;
  public readonly timestamp: string;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Connection-related errors
 */
export class ObdConnectionError extends ObdError {
  constructor(message: string, details?: unknown) {
    super(message, 'OBD_CONNECTION_ERROR', details);
  }
}

/**
 * Timeout errors
 */
export class ObdTimeoutError extends ObdError {
  constructor(message: string, command?: string, details?: Record<string, unknown>) {
    const combinedDetails = details ? { command, ...details } : { command };
    super(message, 'OBD_TIMEOUT_ERROR', combinedDetails);
  }
}

/**
 * Parse/format errors
 */
export class ObdParseError extends ObdError {
  constructor(message: string, rawData?: string, details?: Record<string, unknown>) {
    const combinedDetails = details ? { rawData, ...details } : { rawData };
    super(message, 'OBD_PARSE_ERROR', combinedDetails);
  }
}

/**
 * Unsupported command/feature errors
 */
export class ObdUnsupportedError extends ObdError {
  constructor(message: string, command?: string, details?: Record<string, unknown>) {
    const combinedDetails = details ? { command, ...details } : { command };
    super(message, 'OBD_UNSUPPORTED_ERROR', combinedDetails);
  }
}

/**
 * Protocol errors
 */
export class ObdProtocolError extends ObdError {
  constructor(message: string, details?: unknown) {
    super(message, 'OBD_PROTOCOL_ERROR', details);
  }
}

/**
 * Transport layer errors
 */
export class ObdTransportError extends ObdError {
  constructor(message: string, details?: unknown) {
    super(message, 'OBD_TRANSPORT_ERROR', details);
  }
}
