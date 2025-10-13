/**
 * M4: DTC-декодер (стандартные SAE коды) + локальный словарь
 * S11: Парсер DTC с префиксами P/B/C/U
 * S12: Описание DTC из открытой базы
 */
export type DtcSeverity = 'critical' | 'warning' | 'info';
export type DtcPrefix = 'P' | 'B' | 'C' | 'U';
export interface DtcInfo {
    code: string;
    description: string;
    severity: DtcSeverity;
    prefix: DtcPrefix;
    category?: string;
}
/**
 * S11: Парсер DTC с префиксами P/B/C/U
 * Извлекает префикс и нормализует код
 */
export declare function parseDtcPrefix(code: string): DtcPrefix;
/**
 * S13, S87: Нормализация кодов DTC (дубликаты/регистр, ведущие нули/формат)
 */
export declare function normalizeDtcCode(code: string): string;
/**
 * Получает полную информацию о DTC коде
 */
export declare function describeDtc(code: string): DtcInfo;
/**
 * Определяет критичность кода на основе категории и паттернов
 */
export declare function severityFor(code: string): DtcSeverity;
/**
 * S13: Удаляет дубликаты из массива кодов
 */
export declare function deduplicateDtcCodes(codes: string[]): string[];
