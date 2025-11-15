/**
 * OBD Orchestration Error Classes
 * Custom error types for orchestration layer
 */

export class ObdSessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly sessionId?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ObdSessionError';
  }
}

export class ObdStateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly currentState: string,
    public readonly attemptedAction: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ObdStateError';
  }
}
