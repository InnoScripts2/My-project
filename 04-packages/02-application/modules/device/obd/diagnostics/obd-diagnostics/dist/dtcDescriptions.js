/**
 * M4: DTC-декодер (стандартные SAE коды) + локальный словарь
 * S11: Парсер DTC с префиксами P/B/C/U
 * S12: Описание DTC из открытой базы
 */
/**
 * Расширенная база DTC кодов на основе открытых стандартов SAE J2012
 * S12: Описание DTC из открытой базы (встроенная таблица)
 */
const DTC_MAP = {
    // Misfires (P03xx) - Critical
    P0300: { description: 'Случайные/множественные пропуски воспламенения', category: 'Misfire' },
    P0301: { description: 'Пропуски воспламенения, цилиндр 1', category: 'Misfire' },
    P0302: { description: 'Пропуски воспламенения, цилиндр 2', category: 'Misfire' },
    P0303: { description: 'Пропуски воспламенения, цилиндр 3', category: 'Misfire' },
    P0304: { description: 'Пропуски воспламенения, цилиндр 4', category: 'Misfire' },
    P0305: { description: 'Пропуски воспламенения, цилиндр 5', category: 'Misfire' },
    P0306: { description: 'Пропуски воспламенения, цилиндр 6', category: 'Misfire' },
    P0307: { description: 'Пропуски воспламенения, цилиндр 7', category: 'Misfire' },
    P0308: { description: 'Пропуски воспламенения, цилиндр 8', category: 'Misfire' },
    // Fuel and Air Metering (P01xx-P02xx)
    P0100: { description: 'Неисправность датчика массового расхода воздуха (MAF)', category: 'Fuel/Air' },
    P0101: { description: 'Датчик MAF — диапазон/производительность', category: 'Fuel/Air' },
    P0102: { description: 'Датчик MAF — низкий сигнал', category: 'Fuel/Air' },
    P0103: { description: 'Датчик MAF — высокий сигнал', category: 'Fuel/Air' },
    P0105: { description: 'Неисправность датчика абсолютного давления во впускном коллекторе (MAP)', category: 'Fuel/Air' },
    P0106: { description: 'Датчик MAP — диапазон/производительность', category: 'Fuel/Air' },
    P0107: { description: 'Датчик MAP — низкий сигнал', category: 'Fuel/Air' },
    P0108: { description: 'Датчик MAP — высокий сигнал', category: 'Fuel/Air' },
    P0110: { description: 'Неисправность датчика температуры воздуха на впуске (IAT)', category: 'Fuel/Air' },
    P0111: { description: 'Датчик IAT — диапазон/производительность', category: 'Fuel/Air' },
    P0112: { description: 'Датчик IAT — низкий сигнал', category: 'Fuel/Air' },
    P0113: { description: 'Датчик IAT — высокий сигнал', category: 'Fuel/Air' },
    P0115: { description: 'Неисправность датчика температуры охлаждающей жидкости (ECT)', category: 'Fuel/Air' },
    P0116: { description: 'Датчик ECT — диапазон/производительность', category: 'Fuel/Air' },
    P0117: { description: 'Датчик ECT — низкий сигнал', category: 'Fuel/Air' },
    P0118: { description: 'Датчик ECT — высокий сигнал', category: 'Fuel/Air' },
    P0120: { description: 'Неисправность датчика положения дроссельной заслонки (TPS)', category: 'Fuel/Air' },
    P0121: { description: 'Датчик TPS — диапазон/производительность', category: 'Fuel/Air' },
    P0122: { description: 'Датчик TPS — низкий сигнал', category: 'Fuel/Air' },
    P0123: { description: 'Датчик TPS — высокий сигнал', category: 'Fuel/Air' },
    P0125: { description: 'Недостаточная температура охлаждающей жидкости для замкнутого контура', category: 'Fuel/Air' },
    P0128: { description: 'Температура охлаждающей жидкости ниже температуры термостата', category: 'Fuel/Air' },
    P0130: { description: 'Неисправность датчика O2 (банк 1, датчик 1)', category: 'Fuel/Air' },
    P0131: { description: 'Датчик O2 (банк 1, датчик 1) — низкое напряжение', category: 'Fuel/Air' },
    P0132: { description: 'Датчик O2 (банк 1, датчик 1) — высокое напряжение', category: 'Fuel/Air' },
    P0133: { description: 'Датчик O2 (банк 1, датчик 1) — медленный отклик', category: 'Fuel/Air' },
    P0134: { description: 'Датчик O2 (банк 1, датчик 1) — нет активности', category: 'Fuel/Air' },
    P0135: { description: 'Подогреватель датчика O2 (банк 1, датчик 1) — неисправность', category: 'Fuel/Air' },
    P0136: { description: 'Неисправность датчика O2 (банк 1, датчик 2)', category: 'Fuel/Air' },
    P0137: { description: 'Датчик O2 (банк 1, датчик 2) — низкое напряжение', category: 'Fuel/Air' },
    P0138: { description: 'Датчик O2 (банк 1, датчик 2) — высокое напряжение', category: 'Fuel/Air' },
    P0140: { description: 'Датчик O2 (банк 1, датчик 2) — нет активности', category: 'Fuel/Air' },
    P0141: { description: 'Подогреватель датчика O2 (банк 1, датчик 2) — неисправность', category: 'Fuel/Air' },
    P0150: { description: 'Неисправность датчика O2 (банк 2, датчик 1)', category: 'Fuel/Air' },
    P0151: { description: 'Датчик O2 (банк 2, датчик 1) — низкое напряжение', category: 'Fuel/Air' },
    P0152: { description: 'Датчик O2 (банк 2, датчик 1) — высокое напряжение', category: 'Fuel/Air' },
    P0153: { description: 'Датчик O2 (банк 2, датчик 1) — медленный отклик', category: 'Fuel/Air' },
    P0154: { description: 'Датчик O2 (банк 2, датчик 1) — нет активности', category: 'Fuel/Air' },
    P0155: { description: 'Подогреватель датчика O2 (банк 2, датчик 1) — неисправность', category: 'Fuel/Air' },
    P0156: { description: 'Неисправность датчика O2 (банк 2, датчик 2)', category: 'Fuel/Air' },
    P0157: { description: 'Датчик O2 (банк 2, датчик 2) — низкое напряжение', category: 'Fuel/Air' },
    P0158: { description: 'Датчик O2 (банк 2, датчик 2) — высокое напряжение', category: 'Fuel/Air' },
    P0160: { description: 'Датчик O2 (банк 2, датчик 2) — нет активности', category: 'Fuel/Air' },
    P0161: { description: 'Подогреватель датчика O2 (банк 2, датчик 2) — неисправность', category: 'Fuel/Air' },
    P0171: { description: 'Слишком бедная топливная смесь (банк 1)', category: 'Fuel/Air' },
    P0172: { description: 'Слишком богатая топливная смесь (банк 1)', category: 'Fuel/Air' },
    P0173: { description: 'Топливная коррекция (банк 2)', category: 'Fuel/Air' },
    P0174: { description: 'Слишком бедная топливная смесь (банк 2)', category: 'Fuel/Air' },
    P0175: { description: 'Слишком богатая топливная смесь (банк 2)', category: 'Fuel/Air' },
    // Ignition System (P02xx-P03xx)
    P0200: { description: 'Неисправность форсунки — общая', category: 'Ignition' },
    P0201: { description: 'Неисправность форсунки цилиндра 1', category: 'Ignition' },
    P0202: { description: 'Неисправность форсунки цилиндра 2', category: 'Ignition' },
    P0203: { description: 'Неисправность форсунки цилиндра 3', category: 'Ignition' },
    P0204: { description: 'Неисправность форсунки цилиндра 4', category: 'Ignition' },
    P0205: { description: 'Неисправность форсунки цилиндра 5', category: 'Ignition' },
    P0206: { description: 'Неисправность форсунки цилиндра 6', category: 'Ignition' },
    P0207: { description: 'Неисправность форсунки цилиндра 7', category: 'Ignition' },
    P0208: { description: 'Неисправность форсунки цилиндра 8', category: 'Ignition' },
    // Emissions (P04xx)
    P0400: { description: 'Неисправность системы рециркуляции отработавших газов (EGR)', category: 'Emissions' },
    P0401: { description: 'Недостаточный поток EGR', category: 'Emissions' },
    P0402: { description: 'Избыточный поток EGR', category: 'Emissions' },
    P0403: { description: 'Неисправность клапана EGR', category: 'Emissions' },
    P0404: { description: 'Диапазон/производительность клапана EGR', category: 'Emissions' },
    P0405: { description: 'Датчик EGR A — низкий сигнал', category: 'Emissions' },
    P0406: { description: 'Датчик EGR A — высокий сигнал', category: 'Emissions' },
    P0420: { description: 'Эффективность катализатора ниже порога (банк 1)', category: 'Emissions' },
    P0421: { description: 'Прогрев катализатора, эффективность ниже порога (банк 1)', category: 'Emissions' },
    P0430: { description: 'Эффективность катализатора ниже порога (банк 2)', category: 'Emissions' },
    P0431: { description: 'Прогрев катализатора, эффективность ниже порога (банк 2)', category: 'Emissions' },
    P0440: { description: 'Неисправность системы улавливания паров топлива (EVAP)', category: 'Emissions' },
    P0441: { description: 'Неправильный поток продувки EVAP', category: 'Emissions' },
    P0442: { description: 'Небольшая утечка в системе EVAP', category: 'Emissions' },
    P0443: { description: 'Неисправность клапана продувки EVAP', category: 'Emissions' },
    P0444: { description: 'Клапан продувки EVAP — разомкнутая цепь', category: 'Emissions' },
    P0445: { description: 'Клапан продувки EVAP — короткое замыкание', category: 'Emissions' },
    P0446: { description: 'Неисправность управления вентиляцией EVAP', category: 'Emissions' },
    P0450: { description: 'Неисправность датчика давления системы EVAP', category: 'Emissions' },
    P0451: { description: 'Датчик давления EVAP — диапазон/производительность', category: 'Emissions' },
    P0452: { description: 'Датчик давления EVAP — низкий сигнал', category: 'Emissions' },
    P0453: { description: 'Датчик давления EVAP — высокий сигнал', category: 'Emissions' },
    P0455: { description: 'Крупная утечка в системе EVAP', category: 'Emissions' },
    P0456: { description: 'Очень небольшая утечка в системе EVAP', category: 'Emissions' },
    // Vehicle Speed and Idle Control (P05xx)
    P0500: { description: 'Неисправность датчика скорости автомобиля (VSS)', category: 'Speed/Idle' },
    P0501: { description: 'Датчик VSS — диапазон/производительность', category: 'Speed/Idle' },
    P0502: { description: 'Датчик VSS — низкий сигнал', category: 'Speed/Idle' },
    P0503: { description: 'Датчик VSS — прерывистый/нестабильный сигнал', category: 'Speed/Idle' },
    P0505: { description: 'Неисправность системы управления холостым ходом (IAC)', category: 'Speed/Idle' },
    P0506: { description: 'Обороты холостого хода ниже ожидаемых', category: 'Speed/Idle' },
    P0507: { description: 'Обороты холостого хода выше ожидаемых', category: 'Speed/Idle' },
    // Computer and Output Signals (P06xx)
    P0600: { description: 'Неисправность связи последовательной шины', category: 'Computer' },
    P0601: { description: 'Ошибка контрольной суммы памяти модуля управления двигателем (ECM)', category: 'Computer' },
    P0602: { description: 'Ошибка программирования ECM', category: 'Computer' },
    P0603: { description: 'Ошибка памяти КАМ в ECM', category: 'Computer' },
    P0604: { description: 'Ошибка памяти RAM в ECM', category: 'Computer' },
    P0605: { description: 'Ошибка ROM в ECM', category: 'Computer' },
    P0606: { description: 'Неисправность процессора ECM', category: 'Computer' },
    P0607: { description: 'Производительность модуля управления', category: 'Computer' },
    P0610: { description: 'Ошибка конфигурации варианта управления', category: 'Computer' },
    // Transmission (P07xx)
    P0700: { description: 'Неисправность системы управления трансмиссией', category: 'Transmission' },
    P0705: { description: 'Неисправность датчика положения селектора трансмиссии (PRNDL)', category: 'Transmission' },
    P0706: { description: 'Датчик положения селектора — диапазон/производительность', category: 'Transmission' },
    P0710: { description: 'Неисправность датчика температуры трансмиссионной жидкости', category: 'Transmission' },
    P0711: { description: 'Датчик температуры трансмиссионной жидкости — диапазон/производительность', category: 'Transmission' },
    P0720: { description: 'Неисправность датчика скорости выходного вала', category: 'Transmission' },
    P0730: { description: 'Неправильное передаточное отношение', category: 'Transmission' },
    P0740: { description: 'Неисправность муфты гидротрансформатора', category: 'Transmission' },
    P0750: { description: 'Неисправность соленоида переключения передач A', category: 'Transmission' },
    // Body codes (B-codes) - примеры
    B0001: { description: 'Неисправность подушки безопасности водителя', category: 'Body' },
    B0002: { description: 'Неисправность подушки безопасности пассажира', category: 'Body' },
    // Chassis codes (C-codes) - примеры
    C0040: { description: 'Неисправность датчика скорости колеса (правый передний)', category: 'Chassis' },
    C0041: { description: 'Неисправность датчика скорости колеса (левый передний)', category: 'Chassis' },
    C0042: { description: 'Неисправность датчика скорости колеса (правый задний)', category: 'Chassis' },
    C0043: { description: 'Неисправность датчика скорости колеса (левый задний)', category: 'Chassis' },
    C0050: { description: 'Неисправность датчика положения рулевого колеса', category: 'Chassis' },
    // Network codes (U-codes) - примеры
    U0001: { description: 'Высокоскоростная CAN-шина связи', category: 'Network' },
    U0100: { description: 'Потеря связи с ECM/PCM', category: 'Network' },
    U0101: { description: 'Потеря связи с TCM', category: 'Network' },
    U0102: { description: 'Потеря связи с модулем управления коробкой передач', category: 'Network' },
    U0121: { description: 'Потеря связи с модулем управления ABS', category: 'Network' },
};
/**
 * S11: Парсер DTC с префиксами P/B/C/U
 * Извлекает префикс и нормализует код
 */
export function parseDtcPrefix(code) {
    const normalized = normalizeDtcCode(code);
    const prefix = normalized.charAt(0).toUpperCase();
    if (prefix === 'P' || prefix === 'B' || prefix === 'C' || prefix === 'U') {
        return prefix;
    }
    return 'P'; // default to powertrain
}
/**
 * S13, S87: Нормализация кодов DTC (дубликаты/регистр, ведущие нули/формат)
 */
export function normalizeDtcCode(code) {
    // Убираем ВСЕ пробелы (включая внутренние) и приводим к верхнему регистру
    let normalized = code.replace(/\s+/g, '').toUpperCase();
    // Если код начинается с префикса и имеет только 3 цифры, добавляем ведущий 0
    if (/^[PBCU]\d{3}$/.test(normalized)) {
        normalized = normalized.charAt(0) + '0' + normalized.substring(1);
    }
    return normalized;
}
/**
 * Получает полную информацию о DTC коде
 */
export function describeDtc(code) {
    const normalized = normalizeDtcCode(code);
    const prefix = parseDtcPrefix(normalized);
    const entry = DTC_MAP[normalized];
    if (entry) {
        return {
            code: normalized,
            description: entry.description,
            severity: severityFor(normalized),
            prefix,
            category: entry.category,
        };
    }
    // Fallback для неизвестных кодов
    return {
        code: normalized,
        description: `Стандартный код OBD-II (${getCategoryByPrefix(prefix)}). Детальная расшифровка будет добавлена.`,
        severity: 'info',
        prefix,
        category: getCategoryByPrefix(prefix),
    };
}
/**
 * Определяет категорию по префиксу
 */
function getCategoryByPrefix(prefix) {
    switch (prefix) {
        case 'P': return 'Powertrain';
        case 'B': return 'Body';
        case 'C': return 'Chassis';
        case 'U': return 'Network';
    }
}
/**
 * Определяет критичность кода на основе категории и паттернов
 */
export function severityFor(code) {
    const normalized = normalizeDtcCode(code);
    // Misfires (P03xx) - критичны для ресурса двигателя и катализатора
    if (/^P03\d\d$/.test(normalized))
        return 'critical';
    // Computer/ECM errors (P06xx) - могут быть критичны
    if (/^P06(0[0-9]|1[0-9])$/.test(normalized))
        return 'critical';
    // Catalyst efficiency и mixture (P0420, P0430, P0171-P0175)
    if (normalized === 'P0420' || normalized === 'P0430')
        return 'warning';
    if (/^P01(71|72|74|75)$/.test(normalized))
        return 'warning';
    // O2 sensor issues - warning
    if (/^P01[3-6]\d$/.test(normalized))
        return 'warning';
    // Injector issues (P020x) - warning
    if (/^P020[0-8]$/.test(normalized))
        return 'warning';
    // EGR issues (P040x) - обычно info, но могут влиять на выбросы
    if (/^P040[0-6]$/.test(normalized))
        return 'info';
    // EVAP issues (P044x, P045x) - info
    if (/^P04(4[0-6]|5[0-6])$/.test(normalized))
        return 'info';
    // Network/communication errors (U0xxx) - могут быть critical
    if (/^U0(100|101|102|121)$/.test(normalized))
        return 'critical';
    // Transmission errors (P07xx) - warning
    if (/^P07\d\d$/.test(normalized))
        return 'warning';
    return 'info';
}
/**
 * S13: Удаляет дубликаты из массива кодов
 */
export function deduplicateDtcCodes(codes) {
    const seen = new Set();
    const result = [];
    for (const code of codes) {
        const normalized = normalizeDtcCode(code);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(normalized);
        }
    }
    return result;
}
