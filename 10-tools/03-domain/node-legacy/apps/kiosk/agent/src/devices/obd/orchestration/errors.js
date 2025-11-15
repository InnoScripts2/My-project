/**
 * OBD Orchestration Error Classes
 * Custom error types for orchestration layer
 */
export class ObdSessionError extends Error {
    code;
    sessionId;
    details;
    constructor(message, code, sessionId, details) {
        super(message);
        this.code = code;
        this.sessionId = sessionId;
        this.details = details;
        this.name = 'ObdSessionError';
    }
}
export class ObdStateError extends Error {
    code;
    currentState;
    attemptedAction;
    details;
    constructor(message, code, currentState, attemptedAction, details) {
        super(message);
        this.code = code;
        this.currentState = currentState;
        this.attemptedAction = attemptedAction;
        this.details = details;
        this.name = 'ObdStateError';
    }
}
