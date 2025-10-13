/**
 * Custom error classes for thickness driver
 */

export class ThicknessError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ThicknessError';
    this.timestamp = new Date().toISOString();
  }

  public readonly timestamp: string;
}

export class ThicknessConnectionError extends ThicknessError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'THICKNESS_CONNECTION_ERROR', details);
    this.name = 'ThicknessConnectionError';
  }
}

export class ThicknessTimeoutError extends ThicknessError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'THICKNESS_TIMEOUT_ERROR', details);
    this.name = 'ThicknessTimeoutError';
  }
}

export class ThicknessMeasurementError extends ThicknessError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'THICKNESS_MEASUREMENT_ERROR', details);
    this.name = 'ThicknessMeasurementError';
  }
}
