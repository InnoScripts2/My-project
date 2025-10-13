/**
 * Нормализация и форматирование OBD ошибок
 * M3: Нормализация ошибок OBD (типизация, коды ошибок, сериализация для фронта)
 * S5, S32, S68: Маппинг ошибок транспорта, обогащённый formatObdError, выравнивание названий
 */
export type ObdErrorCode = 'obd_not_connected' | 'adapter_not_found' | 'connection_timeout' | 'init_failed' | 'protocol_selection_failed' | 'command_timeout' | 'command_failed' | 'no_data' | 'unable_to_connect' | 'bus_init_error' | 'transport_closed' | 'transport_error' | 'invalid_response' | 'buffer_overflow' | 'unknown_error';
export type ObdErrorSubtype = 'serial_port_error' | 'bluetooth_error' | 'protocol_error' | 'hardware_error' | 'timeout_error' | 'data_error' | 'configuration_error' | 'generic';
export interface NormalizedObdError {
    code: ObdErrorCode;
    subtype: ObdErrorSubtype;
    message: string;
    userMessage: string;
    originalError?: string;
    timestamp: string;
    context?: Record<string, unknown>;
}
/**
 * S2: Единая константа базового таймаута OBD операций
 */
export declare const OBD_BASE_TIMEOUT_MS = 2000;
export declare const OBD_INIT_TIMEOUT_MS = 5000;
export declare const OBD_CONNECT_TIMEOUT_MS = 10000;
export declare const OBD_READ_DTC_TIMEOUT_MS = 3000;
export declare const OBD_CLEAR_DTC_TIMEOUT_MS = 5000;
export declare const OBD_LIVE_DATA_TIMEOUT_MS = 1500;
/**
 * Нормализует ошибку OBD в структурированный формат
 * M3, S32: Типизация, обогащённый formatObdError с кодом/подтипом
 */
export declare function normalizeObdError(error: unknown, context?: Record<string, unknown>): NormalizedObdError;
/**
 * Форматирует OBD ошибку для отображения в UI
 * S32: Обогащённый formatObdError с кодом/подтипом
 */
export declare function formatObdError(error: NormalizedObdError | unknown): string;
/**
 * Сериализует ошибку для отправки на фронтенд
 * M3: сериализация для фронта
 */
export interface ObdErrorResponse {
    error: true;
    code: ObdErrorCode;
    message: string;
    details?: string;
    timestamp: string;
}
export declare function serializeObdError(error: unknown): ObdErrorResponse;
