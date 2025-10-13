/**
 * Custom error classes for thickness driver
 */
export class ThicknessError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ThicknessError';
        this.timestamp = new Date().toISOString();
    }
}
export class ThicknessConnectionError extends ThicknessError {
    constructor(message, details) {
        super(message, 'THICKNESS_CONNECTION_ERROR', details);
        this.name = 'ThicknessConnectionError';
    }
}
export class ThicknessTimeoutError extends ThicknessError {
    constructor(message, details) {
        super(message, 'THICKNESS_TIMEOUT_ERROR', details);
        this.name = 'ThicknessTimeoutError';
    }
}
export class ThicknessMeasurementError extends ThicknessError {
    constructor(message, details) {
        super(message, 'THICKNESS_MEASUREMENT_ERROR', details);
        this.name = 'ThicknessMeasurementError';
    }
}
