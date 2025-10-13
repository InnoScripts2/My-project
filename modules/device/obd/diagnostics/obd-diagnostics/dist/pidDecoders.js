/**
 * PID Decoders for OBD-II Mode 01
 *
 * Модуль для декодирования оперативных параметров двигателя (PIDs).
 * Реализует стандартные формулы SAE J1979 для парсинга hex-payload в числовые значения.
 *
 * Источники:
 * - SAE J1979 (стандарт OBD-II PIDs)
 * - ISO 15031-5
 * - Идеи структуры из партнёрских программ (без копирования кода)
 */
/**
 * Декодирует PID 0C: Engine RPM (обороты двигателя)
 * Формула: ((A * 256) + B) / 4
 * Диапазон: 0-16,383.75 об/мин
 */
function parseRpm(payload) {
    const parts = payload.split(/\s+/).filter(Boolean).map(x => parseInt(x, 16));
    if (parts.length < 2 || parts.some(Number.isNaN))
        return NaN;
    const [A, B] = parts;
    return ((A * 256) + B) / 4;
}
/**
 * Декодирует PID 05/0F: Engine/Intake Temperature (температура)
 * Формула: A - 40
 * Диапазон: -40 to 215°C
 */
function parseTemperature(payload) {
    const parts = payload.split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return NaN;
    const A = parseInt(parts[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return A - 40;
}
/**
 * Декодирует PID 0D: Vehicle Speed (скорость автомобиля)
 * Формула: A
 * Диапазон: 0-255 км/ч
 */
function parseSpeed(payload) {
    const parts = payload.split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return NaN;
    const A = parseInt(parts[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return A;
}
/**
 * Декодирует PID 42: Control Module Voltage (напряжение бортовой сети)
 * Формула: ((A * 256) + B) / 1000
 * Диапазон: 0-65.535 В
 */
function parseVoltage(payload) {
    const parts = payload.split(/\s+/).filter(Boolean).map(x => parseInt(x, 16));
    if (parts.length < 2 || parts.some(Number.isNaN))
        return NaN;
    const [A, B] = parts;
    return ((A * 256) + B) / 1000;
}
/**
 * Декодирует PID 11: Throttle Position (положение дроссельной заслонки)
 * Формула: (A * 100) / 255
 * Диапазон: 0-100%
 */
function parseThrottle(payload) {
    const parts = payload.split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return NaN;
    const A = parseInt(parts[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return (A * 100) / 255;
}
/**
 * Реестр всех поддерживаемых декодеров
 */
export const PID_DECODERS = {
    '0C': {
        pid: '0C',
        kind: 'arith',
        name: 'Engine RPM',
        unit: 'об/мин',
        parse: parseRpm,
    },
    '05': {
        pid: '05',
        kind: 'arith',
        name: 'Engine Coolant Temperature',
        unit: '°C',
        parse: parseTemperature,
    },
    '0F': {
        pid: '0F',
        kind: 'arith',
        name: 'Intake Air Temperature',
        unit: '°C',
        parse: parseTemperature,
    },
    '0D': {
        pid: '0D',
        kind: 'arith',
        name: 'Vehicle Speed',
        unit: 'км/ч',
        parse: parseSpeed,
    },
    '42': {
        pid: '42',
        kind: 'arith',
        name: 'Control Module Voltage',
        unit: 'В',
        parse: parseVoltage,
    },
    '11': {
        pid: '11',
        kind: 'arith',
        name: 'Throttle Position',
        unit: '%',
        parse: parseThrottle,
    },
};
/**
 * Парсит значение PID используя соответствующий декодер из реестра
 *
 * @param pid - PID в hex формате (например, '0C')
 * @param payload - hex данные от адаптера (например, '0C 5A')
 * @returns Декодированное значение или undefined если декодер не найден
 */
export function parsePid(pid, payload) {
    const normalizedPid = pid.toUpperCase();
    const decoder = PID_DECODERS[normalizedPid];
    if (!decoder) {
        return undefined;
    }
    try {
        const value = decoder.parse(payload);
        // Возвращаем undefined для NaN вместо самого NaN
        return Number.isNaN(value) ? undefined : value;
    }
    catch {
        return undefined;
    }
}
/**
 * Получает информацию о декодере для указанного PID
 *
 * @param pid - PID в hex формате
 * @returns Информация о декодере или undefined
 */
export function getDecoderInfo(pid) {
    const normalizedPid = pid.toUpperCase();
    const decoder = PID_DECODERS[normalizedPid];
    if (!decoder) {
        return undefined;
    }
    return {
        pid: decoder.pid,
        kind: decoder.kind,
        name: decoder.name,
        unit: decoder.unit,
    };
}
/**
 * Возвращает список всех поддерживаемых PIDs
 */
export function getSupportedPids() {
    return Object.keys(PID_DECODERS);
}
