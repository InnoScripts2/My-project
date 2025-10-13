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
 * Тип декодера: arithmetic (арифметический), bit (битовый), ascii (текстовый)
 */
export type DecoderKind = 'arith' | 'bit' | 'ascii';
/**
 * Запись декодера для конкретного PID
 */
export interface DecoderEntry {
    /** PID в hex (например, '0C') */
    pid: string;
    /** Тип декодирования */
    kind: DecoderKind;
    /** Человекочитаемое имя параметра */
    name: string;
    /** Единица измерения */
    unit?: string;
    /** Функция парсинга hex-payload в значение */
    parse: (payload: string) => number | string | undefined;
}
/**
 * Реестр всех поддерживаемых декодеров
 */
export declare const PID_DECODERS: Record<string, DecoderEntry>;
/**
 * Парсит значение PID используя соответствующий декодер из реестра
 *
 * @param pid - PID в hex формате (например, '0C')
 * @param payload - hex данные от адаптера (например, '0C 5A')
 * @returns Декодированное значение или undefined если декодер не найден
 */
export declare function parsePid(pid: string, payload: string): number | string | undefined;
/**
 * Получает информацию о декодере для указанного PID
 *
 * @param pid - PID в hex формате
 * @returns Информация о декодере или undefined
 */
export declare function getDecoderInfo(pid: string): Omit<DecoderEntry, 'parse'> | undefined;
/**
 * Возвращает список всех поддерживаемых PIDs
 */
export declare function getSupportedPids(): string[];
/**
 * Удобный тип для поддерживаемых PID'ов в реестре
 */
export type SupportedPid = keyof typeof PID_DECODERS;
