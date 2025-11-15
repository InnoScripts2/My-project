import { PidResponse, Pid } from '../types/ObdTypes.js';
import { ObdParseError } from '../types/ObdTypes.js';
import { pidDatabase } from '../database/PidDatabase.js';

/**
 * Парсер PID данных из OBD-II ответов
 *
 * Основан на алгоритмах из:
 * - node-bluetooth-obd-master
 * - node-obd2-master
 * - SAE J1979 стандарт
 */

/**
 * Парсинг ответа Mode 01 (текущие параметры)
 *
 * Формат ответа: 41 XX YY YY YY YY
 * - 41: заголовок ответа Mode 01
 * - XX: PID код (0C, 0D, 05, etc.)
 * - YY: данные (1-4 байта в зависимости от PID)
 */
export function parsePidResponse(response: string, requestedPid?: string): PidResponse {
  try {
    // Удаляем пробелы и нормализуем
    const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

    // Проверяем минимальную длину
    if (cleanResponse.length < 6) {
      throw new ObdParseError('PID response too short', response);
    }

    // Проверяем заголовок Mode 01
    if (!cleanResponse.startsWith('41')) {
      throw new ObdParseError('Invalid PID response header', response);
    }

    // Извлекаем PID код
    const pidCode = cleanResponse.substring(2, 4);

    // Находим PID в базе данных
    const pid = pidDatabase.getPidByCode('01', pidCode);
    if (!pid) {
      // Если PID неизвестен, возвращаем сырые данные
      const rawData = cleanResponse.substring(4);
      return {
        value: `Unknown PID ${pidCode}`,
        pid: pidCode,
        mode: '01',
        timestamp: Date.now(),
        rawBytes: rawData
      };
    }

    // Извлекаем байты данных
    const dataHex = cleanResponse.substring(4);
    const dataBytes = hexStringToBytes(dataHex);

    // Проверяем количество байт
    if (dataBytes.length < pid.bytes) {
      throw new ObdParseError(`Insufficient data bytes for PID ${pidCode}. Expected ${pid.bytes}, got ${dataBytes.length}`, response);
    }

    // Преобразуем сырые байты в полезное значение
    const value = convertPidValue(pid, dataBytes);

    return {
      value,
      name: pid.name,
      pid: pidCode,
      mode: '01',
      unit: pid.unit,
      timestamp: Date.now(),
      rawBytes: dataHex
    };

  } catch (error) {
    if (error instanceof ObdParseError) {
      throw error;
    }
    throw new ObdParseError(`Failed to parse PID response: ${error}`, response);
  }
}

/**
 * Парсинг ответа поддерживаемых PIDs (PID 00, 20, 40, 60, etc.)
 *
 * Ответ содержит битовую маску поддерживаемых PIDs
 * Каждый бит соответствует следующему PID (01-20, 21-40, etc.)
 */
export function parseSupportedPids(response: string, basePid: string): string[] {
  const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

  if (!cleanResponse.startsWith('41') || cleanResponse.length < 10) {
    throw new ObdParseError('Invalid supported PIDs response', response);
  }

  const pidCode = cleanResponse.substring(2, 4);
  const dataHex = cleanResponse.substring(4, 12); // 4 байта данных

  // Определяем базовое значение PID
  const baseValue = parseInt(basePid, 16);
  const supportedPids: string[] = [];

  // Преобразуем hex в бинарный
  const binaryString = parseInt(dataHex, 16).toString(2).padStart(32, '0');

  // Проверяем каждый бит
  for (let i = 0; i < 32; i++) {
    if (binaryString[i] === '1') {
      const pidValue = baseValue + i + 1;
      const pidHex = pidValue.toString(16).toUpperCase().padStart(2, '0');
      supportedPids.push(pidHex);
    }
  }

  return supportedPids;
}

/**
 * Преобразование строки hex в массив байт
 */
function hexStringToBytes(hexString: string): number[] {
  const bytes: number[] = [];

  for (let i = 0; i < hexString.length; i += 2) {
    const byteHex = hexString.substring(i, i + 2);
    if (byteHex.length === 2) {
      bytes.push(parseInt(byteHex, 16));
    }
  }

  return bytes;
}

/**
 * Преобразование сырых байт в полезное значение с использованием формулы PID
 */
function convertPidValue(pid: Pid, dataBytes: number[]): number {
  try {
    // Применяем формулу преобразования из базы данных
    const byteA = dataBytes[0] || 0;
    const byteB = dataBytes[1];
    const byteC = dataBytes[2];
    const byteD = dataBytes[3];

    const result = pid.convertToUseful(byteA, byteB, byteC, byteD);

    // Округляем до разумного количества знаков после запятой
    return Math.round(result * 100) / 100;

  } catch (error) {
    throw new ObdParseError(`Failed to convert PID ${pid.pid} value: ${error}`, dataBytes.join(' '));
  }
}

/**
 * Специализированные парсеры для популярных PIDs
 */

/**
 * Парсер для RPM (PID 0C)
 */
export function parseRpm(response: string): PidResponse {
  const result = parsePidResponse(response, '0C');

  // Дополнительная валидация для RPM
  if (typeof result.value === 'number') {
    if (result.value < 0 || result.value > 16383) {
      throw new ObdParseError('RPM value out of range', response);
    }
  }

  return result;
}

/**
 * Парсер для скорости (PID 0D)
 */
export function parseSpeed(response: string): PidResponse {
  const result = parsePidResponse(response, '0D');

  // Дополнительная валидация для скорости
  if (typeof result.value === 'number') {
    if (result.value < 0 || result.value > 255) {
      throw new ObdParseError('Speed value out of range', response);
    }
  }

  return result;
}

/**
 * Парсер для температуры охлаждающей жидкости (PID 05)
 */
export function parseTemperature(response: string): PidResponse {
  const result = parsePidResponse(response, '05');

  // Дополнительная валидация для температуры
  if (typeof result.value === 'number') {
    if (result.value < -40 || result.value > 215) {
      throw new ObdParseError('Temperature value out of range', response);
    }
  }

  return result;
}

/**
 * Парсер для нагрузки двигателя (PID 04)
 */
export function parseEngineLoad(response: string): PidResponse {
  const result = parsePidResponse(response, '04');

  // Дополнительная валидация для нагрузки
  if (typeof result.value === 'number') {
    if (result.value < 0 || result.value > 100) {
      throw new ObdParseError('Engine load value out of range', response);
    }
  }

  return result;
}

/**
 * Универсальный парсер по имени PID
 */
export function parsePidByName(response: string, pidName: string): PidResponse {
  const pid = pidDatabase.getPidByName(pidName);
  if (!pid) {
    throw new ObdParseError(`Unknown PID name: ${pidName}`, response);
  }

  return parsePidResponse(response, pid.pid);
}

/**
 * Валидация PID ответа
 */
export function isValidPidResponse(response: string): boolean {
  try {
    const cleanResponse = response.replace(/\s+/g, '').toUpperCase();

    // Минимальная длина и правильный заголовок
    if (cleanResponse.length < 6 || !cleanResponse.startsWith('41')) {
      return false;
    }

    // Проверяем, что все символы hex
    const hexPattern = /^[0-9A-F]+$/;
    return hexPattern.test(cleanResponse);

  } catch {
    return false;
  }
}

/**
 * Создание тестовых PID ответов (только в DEV режиме)
 */
export function createTestPidResponse(pidName: string, testValue: number): PidResponse {
  if (process.env.AGENT_ENV !== 'DEV') {
    throw new Error('Test PID responses only available in DEV mode');
  }

  const pid = pidDatabase.getPidByName(pidName);
  if (!pid) {
    throw new Error(`Unknown PID name: ${pidName}`);
  }

  return {
    value: testValue,
    name: pid.name,
    pid: pid.pid,
    mode: '01',
    unit: pid.unit,
    timestamp: Date.now(),
    rawBytes: 'TEST_DATA'
  };
}
