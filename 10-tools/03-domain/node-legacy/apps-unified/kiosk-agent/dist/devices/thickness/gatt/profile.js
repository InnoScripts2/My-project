/**
 * GATT Profile для толщиномера ЛКП
 *
 * Определяет Service UUID и Characteristics UUID для BLE коммуникации
 */
export const GATT_PROFILE = {
    SERVICE_UUID: '0000FFF0-0000-1000-8000-00805F9B34FB',
    CHARACTERISTICS: {
        MEASUREMENT: '0000FFF1-0000-1000-8000-00805F9B34FB',
        CONTROL: '0000FFF2-0000-1000-8000-00805F9B34FB',
        STATUS: '0000FFF3-0000-1000-8000-00805F9B34FB',
    },
    CCCD_UUID: '00002902-0000-1000-8000-00805F9B34FB',
};
export const CONTROL_COMMANDS = {
    START: 0x01,
    STOP: 0x02,
    RESET: 0x03,
};
export const STATUS_VALUES = {
    IDLE: 0x00,
    MEASURING: 0x01,
    ERROR: 0xFF,
};
export function parseMeasurementData(data) {
    if (data.length < 3) {
        return null;
    }
    const zoneId = data[0];
    const valueHigh = data[1];
    const valueLow = data[2];
    const value = (valueHigh << 8) | valueLow;
    return {
        zoneId,
        value,
        timestamp: Date.now(),
    };
}
export function encodeControlCommand(command) {
    return Buffer.from([command]);
}
