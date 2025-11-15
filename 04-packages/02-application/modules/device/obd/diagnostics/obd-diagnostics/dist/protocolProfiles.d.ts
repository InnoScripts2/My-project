/**
 * OBD-II протокольные профили для различных марок автомобилей
 * Определяют приоритеты протоколов и специфичные команды инициализации
 */
export type ObdProtocol = 'auto' | 'iso15765-4' | 'iso15765-5' | 'iso9141-2' | 'kwp2000-5' | 'kwp2000-f' | 'sae-j1850-p' | 'sae-j1850-v';
export interface ProtocolSpec {
    /** Идентификатор протокола */
    id: ObdProtocol;
    /** AT команда для установки протокола (например, ATSP6) */
    command: string;
    /** Дружественное название */
    name: string;
    /** Краткое описание */
    description: string;
}
export interface ProtocolProfile {
    /** Название профиля (например, 'toyota_lexus') */
    name: string;
    /** Дружественное описание */
    displayName: string;
    /** Приоритетный список протоколов для попытки подключения */
    protocols: ObdProtocol[];
    /** Дополнительные команды инициализации (опционально) */
    initCommands?: string[];
}
/**
 * Спецификации всех поддерживаемых протоколов
 */
export declare const PROTOCOL_SPECS: Record<ObdProtocol, ProtocolSpec>;
/**
 * Предопределенные профили для различных марок
 */
export declare const PROTOCOL_PROFILES: Record<string, ProtocolProfile>;
/**
 * Получить профиль по имени или вернуть auto по умолчанию
 */
export declare function getProtocolProfile(profileName?: string): ProtocolProfile;
/**
 * Получить команду AT для установки протокола
 */
export declare function getProtocolCommand(protocol: ObdProtocol): string;
/**
 * Проверить, поддерживается ли протокол
 */
export declare function isValidProtocol(protocol: string): protocol is ObdProtocol;
