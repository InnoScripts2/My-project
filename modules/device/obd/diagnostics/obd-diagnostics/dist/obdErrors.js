/**
 * Нормализация и форматирование OBD ошибок
 * M3: Нормализация ошибок OBD (типизация, коды ошибок, сериализация для фронта)
 * S5, S32, S68: Маппинг ошибок транспорта, обогащённый formatObdError, выравнивание названий
 */
/**
 * S2: Единая константа базового таймаута OBD операций
 */
export const OBD_BASE_TIMEOUT_MS = 2000;
export const OBD_INIT_TIMEOUT_MS = 5000;
export const OBD_CONNECT_TIMEOUT_MS = 10000;
export const OBD_READ_DTC_TIMEOUT_MS = 3000;
export const OBD_CLEAR_DTC_TIMEOUT_MS = 5000;
export const OBD_LIVE_DATA_TIMEOUT_MS = 1500;
/**
 * Маппинг транспортных и системных ошибок в user-friendly сообщения
 * S5: Маппинг ошибок транспорта → user-friendly сообщения
 */
const ERROR_MAPPINGS = {
    ENOENT: {
        code: 'adapter_not_found',
        subtype: 'serial_port_error',
        userMessage: 'Адаптер не найден. Проверьте подключение.',
    },
    EACCES: {
        code: 'unable_to_connect',
        subtype: 'serial_port_error',
        userMessage: 'Нет доступа к порту. Возможно, порт занят другим приложением.',
    },
    EBUSY: {
        code: 'unable_to_connect',
        subtype: 'serial_port_error',
        userMessage: 'Порт занят. Закройте другие программы, использующие адаптер.',
    },
    ETIMEDOUT: {
        code: 'connection_timeout',
        subtype: 'timeout_error',
        userMessage: 'Превышено время ожидания ответа от адаптера.',
    },
    TIMEOUT: {
        code: 'command_timeout',
        subtype: 'timeout_error',
        userMessage: 'Команда не выполнена в отведённое время.',
    },
    'NO DATA': {
        code: 'no_data',
        subtype: 'data_error',
        userMessage: 'Нет данных от автомобиля. Проверьте подключение к разъёму OBD-II.',
    },
    'UNABLE TO CONNECT': {
        code: 'unable_to_connect',
        subtype: 'protocol_error',
        userMessage: 'Не удаётся установить связь с автомобилем.',
    },
    'BUS INIT ERROR': {
        code: 'bus_init_error',
        subtype: 'protocol_error',
        userMessage: 'Ошибка инициализации шины. Попробуйте переподключить адаптер.',
    },
    'CAN ERROR': {
        code: 'protocol_selection_failed',
        subtype: 'protocol_error',
        userMessage: 'Ошибка CAN-шины. Возможно, несовместимый протокол.',
    },
    STOPPED: {
        code: 'transport_closed',
        subtype: 'generic',
        userMessage: 'Соединение прервано.',
    },
    BUFFER_OVERRUN: {
        code: 'buffer_overflow',
        subtype: 'hardware_error',
        userMessage: 'Переполнение буфера адаптера.',
    },
};
/**
 * Нормализует ошибку OBD в структурированный формат
 * M3, S32: Типизация, обогащённый formatObdError с кодом/подтипом
 */
export function normalizeObdError(error, context) {
    const timestamp = new Date().toISOString();
    // Если уже нормализована
    if (isNormalizedObdError(error)) {
        return { ...error, timestamp };
    }
    // Извлекаем текст ошибки
    const errorString = stringifyError(error);
    const errorMessage = extractErrorMessage(error);
    // Ищем маппинг по коду ошибки
    for (const [pattern, mapping] of Object.entries(ERROR_MAPPINGS)) {
        if (errorString.includes(pattern) || errorMessage.includes(pattern)) {
            return {
                ...mapping,
                message: errorMessage,
                originalError: errorString,
                timestamp,
                context,
            };
        }
    }
    // Дефолтная ошибка
    return {
        code: 'unknown_error',
        subtype: 'generic',
        message: errorMessage,
        userMessage: 'Произошла неизвестная ошибка при работе с адаптером.',
        originalError: errorString,
        timestamp,
        context,
    };
}
/**
 * Форматирует OBD ошибку для отображения в UI
 * S32: Обогащённый formatObdError с кодом/подтипом
 */
export function formatObdError(error) {
    if (isNormalizedObdError(error)) {
        return error.userMessage;
    }
    const normalized = normalizeObdError(error);
    return normalized.userMessage;
}
export function serializeObdError(error) {
    const normalized = normalizeObdError(error);
    return {
        error: true,
        code: normalized.code,
        message: normalized.userMessage,
        details: normalized.message,
        timestamp: normalized.timestamp,
    };
}
/**
 * Type guard для проверки, является ли объект нормализованной ошибкой
 */
function isNormalizedObdError(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        'subtype' in value &&
        'message' in value &&
        'userMessage' in value);
}
/**
 * Извлекает сообщение об ошибке из различных типов
 */
function extractErrorMessage(error) {
    if (typeof error === 'string')
        return error;
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'object' && error !== null) {
        if ('message' in error && typeof error.message === 'string') {
            return error.message;
        }
        if ('error' in error && typeof error.error === 'string') {
            return error.error;
        }
    }
    return 'Unknown error';
}
/**
 * Преобразует ошибку в строку для логирования
 */
function stringifyError(error) {
    if (typeof error === 'string')
        return error;
    if (error instanceof Error) {
        return `${error.name}: ${error.message}${error.stack ? '\n' + error.stack : ''}`;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
