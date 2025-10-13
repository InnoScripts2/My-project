import { DtcEntry, ObdParseError } from '../types/ObdTypes.js';

/**
 * Парсер DTC кодов из OBD-II ответов
 *
 * Основан на алгоритмах из:
 * - node-bluetooth-obd-master
 * - node-obd2-master
 * - kotlin-obd-api-master
 */

/**
 * Парсинг DTC кодов из ответа команды 03 (Request DTC)
 *
 * Формат ответа: 43 NN XX XX XX XX XX XX XX XX
 * - 43: заголовок ответа Mode 03
 * - NN: количество кодов
 * - XX XX: пары байт для каждого DTC кода
 *
 * Формат DTC кода (2 байта):
 * - Первый байт: биты 7-6 определяют категорию, биты 5-4 первую цифру, биты 3-0 вторую цифру
 * - Второй байт: биты 7-4 третья цифра, биты 3-0 четвертая цифра
 *
 * Категории:
 * - 00 (0x00-0x3F): P-коды (Powertrain)
 * - 01 (0x40-0x7F): C-коды (Chassis)
 * - 10 (0x80-0xBF): B-коды (Body)
 * - 11 (0xC0-0xFF): U-коды (Network)
 */
export function parseDtc(response: string): DtcEntry[] {
  try {
    // Удаляем пробелы и нормализуем
    const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

    // Проверяем минимальную длину (43 + количество + хотя бы один код)
    if (cleanResponse.length < 6) {
      throw new ObdParseError('DTC response too short', response);
    }

    // Проверяем заголовок Mode 03
    if (!cleanResponse.startsWith('43')) {
      throw new ObdParseError('Invalid DTC response header', response);
    }

    // Получаем количество кодов
    const countHex = cleanResponse.substring(2, 4);
    const dtcCount = parseInt(countHex, 16);

    // Если нет кодов ошибок
    if (dtcCount === 0) {
      return [];
    }

    // Проверяем длину ответа
    const expectedLength = 4 + (dtcCount * 4); // 43 + NN + (count * 2 bytes each)
    if (cleanResponse.length < expectedLength) {
      throw new ObdParseError(`DTC response too short for ${dtcCount} codes`, response);
    }

    const dtcEntries: DtcEntry[] = [];

    // Парсим каждый DTC код (по 2 байта)
    for (let i = 0; i < dtcCount; i++) {
      const startPos = 4 + (i * 4); // Начинаем после 43NN
      const byte1Hex = cleanResponse.substring(startPos, startPos + 2);
      const byte2Hex = cleanResponse.substring(startPos + 2, startPos + 4);

      const byte1 = parseInt(byte1Hex, 16);
      const byte2 = parseInt(byte2Hex, 16);

      // Пропускаем пустые коды (00 00)
      if (byte1 === 0 && byte2 === 0) {
        continue;
      }

      const dtcCode = decodeDtcBytes(byte1, byte2);
      if (dtcCode) {
        const rawBytes = byte1Hex + byte2Hex;
        const description = 'Unknown DTC code';

        dtcEntries.push({
          code: dtcCode.code,
          category: dtcCode.category,
          description,
          rawBytes
        });
      }
    }

    return dtcEntries;

  } catch (error) {
    if (error instanceof ObdParseError) {
      throw error;
    }
    throw new ObdParseError(`Failed to parse DTC response: ${error}`, response);
  }
}

/**
 * Декодирование DTC кода из двух байт
 */
function decodeDtcBytes(byte1: number, byte2: number): { code: string; category: 'P' | 'C' | 'B' | 'U' } | null {
  if (byte1 === 0 && byte2 === 0) {
    return null;
  }

  // Определяем категорию по битам 7-6 первого байта
  const categoryBits = (byte1 & 0xC0) >> 6; // Извлекаем биты 7-6
  const categoryMap: Record<number, 'P' | 'C' | 'B' | 'U'> = {
    0: 'P', // 00 - Powertrain
    1: 'C', // 01 - Chassis
    2: 'B', // 10 - Body
    3: 'U'  // 11 - Network
  };

  const category = categoryMap[categoryBits];

  // Извлекаем цифры
  const firstDigit = (byte1 & 0x30) >> 4;  // Биты 5-4
  const secondDigit = byte1 & 0x0F;        // Биты 3-0
  const thirdDigit = (byte2 & 0xF0) >> 4;  // Биты 7-4
  const fourthDigit = byte2 & 0x0F;        // Биты 3-0

  const code = `${category}${firstDigit}${secondDigit}${thirdDigit}${fourthDigit}`;

  return { code, category };
}

/**
 * Парсинг ответа команды Clear DTC (Mode 04)
 *
 * Успешный ответ: 44 00 00 00 00 00 00
 */
export function parseClearDtc(response: string): boolean {
  const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

  // Проверяем заголовок
  if (!cleanResponse.startsWith('44')) {
    return false;
  }

  // Успешная очистка обычно возвращает 44 с нулями
  return cleanResponse.startsWith('44');
}

/**
 * Парсинг количества DTC кодов из ответа Mode 01 PID 01
 *
 * PID 01 возвращает статус MIL и количество DTC
 * Формат: 41 01 XX XX XX XX
 * - Байт A: биты 7-4 количество DTC, бит 7 статус MIL
 */
export function parseDtcCount(response: string): { count: number; milOn: boolean } {
  const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

  if (!cleanResponse.startsWith('4101') || cleanResponse.length < 8) {
    throw new ObdParseError('Invalid DTC count response', response);
  }

  const statusByte = parseInt(cleanResponse.substring(4, 6), 16);

  const milOn = (statusByte & 0x80) !== 0;  // Бит 7
  const count = statusByte & 0x7F;          // Биты 6-0

  return { count, milOn };
}

/**
 * Валидация DTC кода по формату
 */
export function isValidDtcCode(code: string): boolean {
  // Формат: буква + 4 цифры (P0171, C1234, etc.)
  const dtcPattern = /^[PCBU][0-9]{4}$/;
  return dtcPattern.test(code);
}

/**
 * Создание фиктивных DTC для тестирования (только в DEV режиме)
 */
export function createTestDtcEntries(): DtcEntry[] {
  if (process.env.AGENT_ENV !== 'DEV') {
    throw new Error('Test DTC entries only available in DEV mode');
  }

  return [
    {
      code: 'P0171',
      category: 'P',
      description: 'System Too Lean (Bank 1)',
      rawBytes: '0171'
    },
    {
      code: 'P0420',
      category: 'P',
      description: 'Catalyst System Efficiency Below Threshold (Bank 1)',
      rawBytes: '0420'
    },
    {
      code: 'P0301',
      category: 'P',
      description: 'Cylinder 1 Misfire Detected',
      rawBytes: '0301'
    }
  ];
}
