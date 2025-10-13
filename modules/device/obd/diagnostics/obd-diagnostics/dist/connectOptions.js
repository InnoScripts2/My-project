const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);
const INVALID_MARKER = Symbol('invalid');
// BLE-only: force, timeoutMs, deviceName, canFdEnabled
export function parseObdConnectPayload(payload) {
    const issues = [];
    const options = {};
    if (payload === undefined || payload === null) {
        return { options, issues };
    }
    if (typeof payload !== 'object' || Array.isArray(payload)) {
        issues.push('payload_must_be_object');
        return { options, issues };
    }
    const source = payload;
    const force = parseBooleanish(source.force);
    if (force === INVALID_MARKER)
        issues.push('force must be boolean-like');
    else if (force !== undefined)
        options.force = force;
    const timeoutMs = parseNumberish(source.timeoutMs, { positive: true });
    if (timeoutMs === INVALID_MARKER)
        issues.push('timeoutMs must be a positive number');
    else if (timeoutMs !== undefined)
        options.timeoutMs = timeoutMs;
    const deviceName = parseStringish(source.deviceName ?? source.bluetoothName);
    if (deviceName === INVALID_MARKER)
        issues.push('deviceName must be a non-empty string');
    else if (deviceName !== undefined)
        options.deviceName = deviceName;
    const canFdEnabled = parseBooleanish(source.canFdEnabled);
    if (canFdEnabled === INVALID_MARKER)
        issues.push('canFdEnabled must be boolean-like');
    else if (canFdEnabled !== undefined)
        options.canFdEnabled = canFdEnabled;
    return { options, issues };
}
export function formatObdError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function parseBooleanish(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (value === 1)
            return true;
        if (value === 0)
            return false;
        return INVALID_MARKER;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized)
            return undefined;
        if (BOOLEAN_TRUE_VALUES.has(normalized))
            return true;
        if (BOOLEAN_FALSE_VALUES.has(normalized))
            return false;
        return INVALID_MARKER;
    }
    return INVALID_MARKER;
}
function parseStringish(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string')
        return INVALID_MARKER;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    return trimmed;
}
function parseNumberish(value, constraints = {}) {
    if (value === undefined || value === null || value === '')
        return undefined;
    let numeric;
    if (typeof value === 'number') {
        numeric = value;
    }
    else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        numeric = Number(trimmed);
    }
    else {
        return INVALID_MARKER;
    }
    if (!Number.isFinite(numeric))
        return INVALID_MARKER;
    if (constraints.positive && !(numeric > 0))
        return INVALID_MARKER;
    if (constraints.nonNegative && numeric < 0)
        return INVALID_MARKER;
    return numeric;
}
