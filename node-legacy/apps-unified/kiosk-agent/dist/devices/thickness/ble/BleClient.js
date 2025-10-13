/**
 * BLE Client интерфейс
 * Обёртка над @abandonware/noble для изоляции зависимости
 */
export class BleConnectionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'BleConnectionError';
    }
}
export class BleTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BleTimeoutError';
    }
}
export class BleDeviceNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BleDeviceNotFoundError';
    }
}
