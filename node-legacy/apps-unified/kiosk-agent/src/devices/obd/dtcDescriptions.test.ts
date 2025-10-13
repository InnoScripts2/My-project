/**
 * Тесты для DTC декодера
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  describeDtc,
  severityFor,
  normalizeDtcCode,
  parseDtcPrefix,
  deduplicateDtcCodes,
} from './dtcDescriptions.js';

await describe('normalizeDtcCode', async () => {
  await it('приводит код к верхнему регистру', () => {
    assert.strictEqual(normalizeDtcCode('p0300'), 'P0300');
    assert.strictEqual(normalizeDtcCode('p0171'), 'P0171');
  });

  await it('добавляет ведущий 0 для 3-значных кодов', () => {
    assert.strictEqual(normalizeDtcCode('P300'), 'P0300');
    assert.strictEqual(normalizeDtcCode('P420'), 'P0420');
  });

  await it('убирает пробелы', () => {
    assert.strictEqual(normalizeDtcCode(' P0300 '), 'P0300');
    assert.strictEqual(normalizeDtcCode('P 0300'), 'P0300');
  });

  await it('сохраняет корректные 4-значные коды', () => {
    assert.strictEqual(normalizeDtcCode('P0300'), 'P0300');
    assert.strictEqual(normalizeDtcCode('P0420'), 'P0420');
  });
});

await describe('parseDtcPrefix', async () => {
  await it('извлекает префикс P для powertrain кодов', () => {
    assert.strictEqual(parseDtcPrefix('P0300'), 'P');
    assert.strictEqual(parseDtcPrefix('p0420'), 'P');
  });

  await it('извлекает префикс B для body кодов', () => {
    assert.strictEqual(parseDtcPrefix('B0001'), 'B');
    assert.strictEqual(parseDtcPrefix('b0002'), 'B');
  });

  await it('извлекает префикс C для chassis кодов', () => {
    assert.strictEqual(parseDtcPrefix('C0040'), 'C');
    assert.strictEqual(parseDtcPrefix('c0041'), 'C');
  });

  await it('извлекает префикс U для network кодов', () => {
    assert.strictEqual(parseDtcPrefix('U0100'), 'U');
    assert.strictEqual(parseDtcPrefix('u0101'), 'U');
  });

  await it('возвращает P по умолчанию для неизвестных префиксов', () => {
    assert.strictEqual(parseDtcPrefix('X0300'), 'P');
    assert.strictEqual(parseDtcPrefix('0300'), 'P');
  });
});

await describe('describeDtc', async () => {
  await it('возвращает описание для известного кода P0300', () => {
    const info = describeDtc('P0300');
    assert.strictEqual(info.code, 'P0300');
    assert.ok(info.description.includes('пропуски воспламенения'));
    assert.strictEqual(info.prefix, 'P');
    assert.strictEqual(info.category, 'Misfire');
  });

  await it('возвращает описание для кода с регистром', () => {
    const info = describeDtc('p0420');
    assert.strictEqual(info.code, 'P0420');
    assert.ok(info.description.includes('катализатор'));
  });

  await it('возвращает описание для B-кода', () => {
    const info = describeDtc('B0001');
    assert.strictEqual(info.prefix, 'B');
    assert.strictEqual(info.category, 'Body');
  });

  await it('возвращает описание для C-кода', () => {
    const info = describeDtc('C0040');
    assert.strictEqual(info.prefix, 'C');
    assert.strictEqual(info.category, 'Chassis');
  });

  await it('возвращает описание для U-кода', () => {
    const info = describeDtc('U0100');
    assert.strictEqual(info.prefix, 'U');
    assert.strictEqual(info.category, 'Network');
  });

  await it('возвращает fallback для неизвестного кода', () => {
    const info = describeDtc('P9999');
    assert.strictEqual(info.code, 'P9999');
    assert.ok(info.description.includes('Стандартный код'));
    assert.strictEqual(info.severity, 'info');
  });

  await it('нормализует код перед поиском', () => {
    const info = describeDtc('p300');
    assert.strictEqual(info.code, 'P0300');
    assert.ok(info.description.includes('пропуски воспламенения'));
  });
});

await describe('severityFor', async () => {
  await it('возвращает critical для misfires (P03xx)', () => {
    assert.strictEqual(severityFor('P0300'), 'critical');
    assert.strictEqual(severityFor('P0301'), 'critical');
    assert.strictEqual(severityFor('P0308'), 'critical');
  });

  await it('возвращает critical для ECM ошибок (P06xx)', () => {
    assert.strictEqual(severityFor('P0601'), 'critical');
    assert.strictEqual(severityFor('P0606'), 'critical');
  });

  await it('возвращает warning для катализатора', () => {
    assert.strictEqual(severityFor('P0420'), 'warning');
    assert.strictEqual(severityFor('P0430'), 'warning');
  });

  await it('возвращает warning для топливной смеси', () => {
    assert.strictEqual(severityFor('P0171'), 'warning');
    assert.strictEqual(severityFor('P0174'), 'warning');
  });

  await it('возвращает info для EVAP ошибок', () => {
    assert.strictEqual(severityFor('P0442'), 'info');
    assert.strictEqual(severityFor('P0455'), 'info');
  });

  await it('возвращает critical для network ошибок', () => {
    assert.strictEqual(severityFor('U0100'), 'critical');
    assert.strictEqual(severityFor('U0121'), 'critical');
  });

  await it('возвращает warning для transmission ошибок', () => {
    assert.strictEqual(severityFor('P0700'), 'warning');
    assert.strictEqual(severityFor('P0730'), 'warning');
  });

  await it('возвращает info для неизвестных кодов', () => {
    assert.strictEqual(severityFor('P9999'), 'info');
  });
});

await describe('deduplicateDtcCodes', async () => {
  await it('удаляет дубликаты', () => {
    const codes = ['P0300', 'P0420', 'P0300', 'p0420'];
    const result = deduplicateDtcCodes(codes);
    assert.deepStrictEqual(result, ['P0300', 'P0420']);
  });

  await it('нормализует коды перед дедупликацией', () => {
    const codes = ['p300', 'P0300', 'P300'];
    const result = deduplicateDtcCodes(codes);
    assert.deepStrictEqual(result, ['P0300']);
  });

  await it('сохраняет порядок первых вхождений', () => {
    const codes = ['P0420', 'P0300', 'P0171', 'P0420'];
    const result = deduplicateDtcCodes(codes);
    assert.deepStrictEqual(result, ['P0420', 'P0300', 'P0171']);
  });

  await it('работает с пустым массивом', () => {
    const result = deduplicateDtcCodes([]);
    assert.deepStrictEqual(result, []);
  });
});
