/**
 * OBD-II протокольные профили для различных марок автомобилей
 * Определяют приоритеты протоколов и специфичные команды инициализации
 */
/**
 * Спецификации всех поддерживаемых протоколов
 */
export const PROTOCOL_SPECS = {
    'auto': {
        id: 'auto',
        command: 'ATSP0',
        name: 'Auto',
        description: 'Automatic protocol detection',
    },
    'iso15765-4': {
        id: 'iso15765-4',
        command: 'ATSP6',
        name: 'ISO 15765-4 (CAN 11bit 500kb)',
        description: 'CAN bus 11-bit ID, 500 kbps',
    },
    'iso15765-5': {
        id: 'iso15765-5',
        command: 'ATSP7',
        name: 'ISO 15765-4 (CAN 29bit 500kb)',
        description: 'CAN bus 29-bit ID, 500 kbps',
    },
    'iso9141-2': {
        id: 'iso9141-2',
        command: 'ATSP3',
        name: 'ISO 9141-2',
        description: 'ISO 9141-2 (legacy, 5 baud init)',
    },
    'kwp2000-5': {
        id: 'kwp2000-5',
        command: 'ATSP4',
        name: 'KWP2000 (5 baud init)',
        description: 'ISO 14230-4, 5 baud initialization',
    },
    'kwp2000-f': {
        id: 'kwp2000-f',
        command: 'ATSP5',
        name: 'KWP2000 (fast init)',
        description: 'ISO 14230-4, fast initialization',
    },
    'sae-j1850-p': {
        id: 'sae-j1850-p',
        command: 'ATSP1',
        name: 'SAE J1850 PWM',
        description: 'SAE J1850 PWM (41.6 kbps)',
    },
    'sae-j1850-v': {
        id: 'sae-j1850-v',
        command: 'ATSP2',
        name: 'SAE J1850 VPW',
        description: 'SAE J1850 VPW (10.4 kbps)',
    },
};
/**
 * Предопределенные профили для различных марок
 */
export const PROTOCOL_PROFILES = {
    auto: {
        name: 'auto',
        displayName: 'Automatic (Universal)',
        protocols: ['auto'],
    },
    toyota_lexus: {
        name: 'toyota_lexus',
        displayName: 'Toyota / Lexus',
        protocols: ['iso15765-4', 'iso9141-2', 'kwp2000-5', 'kwp2000-f'],
        initCommands: [
            'ATCAF0', // CAN Auto Formatting off (для более точного контроля)
        ],
    },
    honda: {
        name: 'honda',
        displayName: 'Honda / Acura',
        protocols: ['iso15765-4', 'kwp2000-f'],
    },
    nissan: {
        name: 'nissan',
        displayName: 'Nissan / Infiniti',
        protocols: ['iso15765-4', 'kwp2000-f', 'iso9141-2'],
    },
    gm: {
        name: 'gm',
        displayName: 'General Motors',
        protocols: ['iso15765-4', 'sae-j1850-v'],
    },
    ford: {
        name: 'ford',
        displayName: 'Ford / Lincoln / Mercury',
        protocols: ['iso15765-4', 'sae-j1850-p'],
    },
    european: {
        name: 'european',
        displayName: 'European (VW, BMW, Mercedes, etc.)',
        protocols: ['iso15765-4', 'kwp2000-f', 'iso9141-2'],
    },
};
/**
 * Получить профиль по имени или вернуть auto по умолчанию
 */
export function getProtocolProfile(profileName) {
    if (!profileName) {
        return PROTOCOL_PROFILES.auto;
    }
    const normalized = profileName.toLowerCase().trim();
    return PROTOCOL_PROFILES[normalized] ?? PROTOCOL_PROFILES.auto;
}
/**
 * Получить команду AT для установки протокола
 */
export function getProtocolCommand(protocol) {
    return PROTOCOL_SPECS[protocol]?.command ?? 'ATSP0';
}
/**
 * Проверить, поддерживается ли протокол
 */
export function isValidProtocol(protocol) {
    return protocol in PROTOCOL_SPECS;
}
