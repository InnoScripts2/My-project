import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePid,
  getDecoderInfo,
  getSupportedPids,
  PID_DECODERS,
  type DecoderKind,
} from './pidDecoders.js';

await describe('parsePid', async () => {
  await describe('PID 0C (RPM)', async () => {
    await it('декодирует корректные данные', () => {
      // Payload: 0C 5A -> A=0C (12), B=5A (90) -> ((12 * 256) + 90) / 4 = 790.5 об/мин
      const result = parsePid('0C', '0C 5A');
      assert.strictEqual(result, 790.5);
    });

    await it('декодирует нулевые обороты', () => {
      const result = parsePid('0C', '00 00');
      assert.strictEqual(result, 0);
    });

    await it('декодирует максимальные обороты', () => {
      // FF FF -> ((255 * 256) + 255) / 4 = 16383.75
      const result = parsePid('0C', 'FF FF');
      assert.strictEqual(result, 16383.75);
    });

    await it('возвращает undefined при некорректных данных', () => {
      const result = parsePid('0C', 'XX YY');
      assert.strictEqual(result, undefined);
    });

    await it('возвращает undefined при недостаточных данных', () => {
      const result = parsePid('0C', '0C');
      assert.strictEqual(result, undefined);
    });

    await it('работает с нижним регистром PID', () => {
      const result = parsePid('0c', '0C 5A');
      assert.strictEqual(result, 790.5);
    });
  });

  await describe('PID 05/0F (Temperature)', async () => {
    await it('декодирует положительную температуру охлаждающей жидкости', () => {
      // A=64 (100 dec) -> 100 - 40 = 60°C
      const result = parsePid('05', '64');
      assert.strictEqual(result, 60);
    });

    await it('декодирует отрицательную температуру', () => {
      // A=00 -> 0 - 40 = -40°C
      const result = parsePid('05', '00');
      assert.strictEqual(result, -40);
    });

    await it('декодирует температуру впускного воздуха', () => {
      // A=50 (80 dec) -> 80 - 40 = 40°C
      const result = parsePid('0F', '50');
      assert.strictEqual(result, 40);
    });

    await it('декодирует максимальную температуру', () => {
      // A=FF (255 dec) -> 255 - 40 = 215°C
      const result = parsePid('05', 'FF');
      assert.strictEqual(result, 215);
    });

    await it('возвращает undefined при некорректных данных', () => {
      const result = parsePid('05', 'XY');
      assert.strictEqual(result, undefined);
    });
  });

  await describe('PID 0D (Speed)', async () => {
    await it('декодирует нулевую скорость', () => {
      const result = parsePid('0D', '00');
      assert.strictEqual(result, 0);
    });

    await it('декодирует скорость 60 км/ч', () => {
      // A=3C (60 dec)
      const result = parsePid('0D', '3C');
      assert.strictEqual(result, 60);
    });

    await it('декодирует скорость 120 км/ч', () => {
      // A=78 (120 dec)
      const result = parsePid('0D', '78');
      assert.strictEqual(result, 120);
    });

    await it('декодирует максимальную скорость', () => {
      // A=FF (255 dec)
      const result = parsePid('0D', 'FF');
      assert.strictEqual(result, 255);
    });

    await it('возвращает undefined при некорректных данных', () => {
      const result = parsePid('0D', 'GG');
      assert.strictEqual(result, undefined);
    });
  });

  await describe('PID 42 (Voltage)', async () => {
    await it('декодирует напряжение 12.5В', () => {
      // 12.5V = 12500mV -> A=30 (48 dec), B=D4 (212 dec)
      // (48 * 256 + 212) / 1000 = 12.5
      const result = parsePid('42', '30 D4');
      assert.strictEqual(result, 12.5);
    });

    await it('декодирует напряжение 14.2В', () => {
      // 14.2V = 14200mV -> A=37 (55 dec), B=78 (120 dec)
      // (55 * 256 + 120) / 1000 = 14.2
      const result = parsePid('42', '37 78');
      assert.strictEqual(result, 14.2);
    });

    await it('декодирует нулевое напряжение', () => {
      const result = parsePid('42', '00 00');
      assert.strictEqual(result, 0);
    });

    await it('декодирует максимальное напряжение', () => {
      // FF FF -> ((255 * 256) + 255) / 1000 = 65.535
      const result = parsePid('42', 'FF FF');
      assert.strictEqual(result, 65.535);
    });

    await it('возвращает undefined при некорректных данных', () => {
      const result = parsePid('42', 'XX YY');
      assert.strictEqual(result, undefined);
    });

    await it('возвращает undefined при недостаточных данных', () => {
      const result = parsePid('42', '30');
      assert.strictEqual(result, undefined);
    });
  });

  await describe('PID 11 (Throttle)', async () => {
    await it('декодирует закрытую заслонку (0%)', () => {
      const result = parsePid('11', '00');
      assert.strictEqual(result, 0);
    });

    await it('декодирует полуоткрытую заслонку (~50%)', () => {
      // A=80 (128 dec) -> (128 * 100) / 255 = 50.196...
      const result = parsePid('11', '80');
      assert.ok(typeof result === 'number' && result > 50 && result < 51);
    });

    await it('декодирует полностью открытую заслонку (100%)', () => {
      // A=FF (255 dec) -> (255 * 100) / 255 = 100
      const result = parsePid('11', 'FF');
      assert.strictEqual(result, 100);
    });

    await it('возвращает undefined при некорректных данных', () => {
      const result = parsePid('11', 'ZZ');
      assert.strictEqual(result, undefined);
    });
  });

  await describe('Неизвестные PIDs', async () => {
    await it('возвращает undefined для несуществующего PID', () => {
      const result = parsePid('99', '12 34');
      assert.strictEqual(result, undefined);
    });

    await it('возвращает undefined для пустого PID', () => {
      const result = parsePid('', '12 34');
      assert.strictEqual(result, undefined);
    });
  });

  await describe('Обработка ошибок', async () => {
    await it('корректно обрабатывает пустой payload', () => {
      const result = parsePid('0C', '');
      assert.strictEqual(result, undefined);
    });

    await it('корректно обрабатывает payload с пробелами', () => {
      const result = parsePid('0C', '  0C   5A  ');
      assert.strictEqual(result, 790.5);
    });

    await it('корректно обрабатывает смешанный регистр в payload', () => {
      const result = parsePid('0C', '0c 5a');
      assert.strictEqual(result, 790.5);
    });
  });
});

await describe('getDecoderInfo', async () => {
  await it('возвращает информацию о декодере для PID 0C', () => {
    const info = getDecoderInfo('0C');
    assert.ok(info);
    const i = info!;
    assert.strictEqual(i.pid, '0C');
    assert.strictEqual(i.kind, 'arith');
    assert.strictEqual(i.name, 'Engine RPM');
    assert.strictEqual(i.unit, 'об/мин');
  });

  await it('возвращает информацию о декодере для PID 05', () => {
    const info = getDecoderInfo('05');
    assert.ok(info);
    const i = info!;
    assert.strictEqual(i.pid, '05');
    assert.strictEqual(i.name, 'Engine Coolant Temperature');
    assert.strictEqual(i.unit, '°C');
  });

  await it('работает с нижним регистром PID', () => {
    const info = getDecoderInfo('0c');
    assert.ok(info);
    const i = info!;
    assert.strictEqual(i.pid, '0C');
  });

  await it('возвращает undefined для неизвестного PID', () => {
    const info = getDecoderInfo('99');
    assert.strictEqual(info, undefined);
  });

  await it('не возвращает функцию parse в результате', () => {
    const info = getDecoderInfo('0C');
    assert.ok(info);
    const i = info!;
    assert.strictEqual((i as any).parse, undefined);
  });
});

await describe('getSupportedPids', async () => {
  await it('возвращает непустой массив', () => {
    const pids = getSupportedPids();
    assert.ok(Array.isArray(pids));
    assert.ok(pids.length > 0);
  });

  await it('содержит все ожидаемые PIDs', () => {
    const pids = getSupportedPids();
    const expected = ['0C', '05', '0F', '0D', '42', '11'];
    for (const pid of expected) {
      assert.ok(pids.includes(pid), `Missing PID ${pid}`);
    }
  });

  await it('возвращает PIDs в верхнем регистре', () => {
    const pids = getSupportedPids();
    for (const pid of pids) {
      assert.strictEqual(pid, pid.toUpperCase());
    }
  });
});

await describe('PID_DECODERS registry', async () => {
  await it('содержит все необходимые поля для каждого декодера', () => {
    const requiredFields: (keyof typeof PID_DECODERS[string])[] = ['pid', 'kind', 'name', 'parse'];

    for (const [pid, decoder] of Object.entries(PID_DECODERS)) {
      for (const field of requiredFields) {
        assert.ok(field in decoder, `Decoder ${pid} missing field ${field}`);
      }
    }
  });

  await it('все декодеры имеют корректный тип kind', () => {
    const validKinds: DecoderKind[] = ['arith', 'bit', 'ascii'];

    for (const [pid, decoder] of Object.entries(PID_DECODERS)) {
      assert.ok(
        validKinds.includes(decoder.kind),
        `Decoder ${pid} has invalid kind: ${decoder.kind}`
      );
    }
  });

  await it('PID в ключе соответствует PID в значении', () => {
    for (const [key, decoder] of Object.entries(PID_DECODERS)) {
      assert.strictEqual(key, decoder.pid, `Key ${key} does not match decoder.pid ${decoder.pid}`);
    }
  });

  await it('все parse функции возвращают number или NaN', () => {
    for (const decoder of Object.values(PID_DECODERS)) {
      const result = decoder.parse('00 00');
      assert.ok(
        typeof result === 'number',
        `Decoder ${decoder.pid} parse() did not return number`
      );
    }
  });
});

await describe('Граничные случаи и крайние значения', async () => {
  await it('RPM: обрабатывает минимальное значение', () => {
    const result = parsePid('0C', '00 00');
    assert.strictEqual(result, 0);
  });

  await it('RPM: обрабатывает максимальное значение', () => {
    const result = parsePid('0C', 'FF FF');
    assert.strictEqual(result, 16383.75);
  });

  await it('Temperature: обрабатывает минимум (-40°C)', () => {
    const result = parsePid('05', '00');
    assert.strictEqual(result, -40);
  });

  await it('Temperature: обрабатывает максимум (215°C)', () => {
    const result = parsePid('05', 'FF');
    assert.strictEqual(result, 215);
  });

  await it('Speed: обрабатывает минимум', () => {
    const result = parsePid('0D', '00');
    assert.strictEqual(result, 0);
  });

  await it('Speed: обрабатывает максимум', () => {
    const result = parsePid('0D', 'FF');
    assert.strictEqual(result, 255);
  });

  await it('Voltage: обрабатывает минимум', () => {
    const result = parsePid('42', '00 00');
    assert.strictEqual(result, 0);
  });

  await it('Voltage: обрабатывает максимум', () => {
    const result = parsePid('42', 'FF FF');
    assert.strictEqual(result, 65.535);
  });

  await it('Throttle: обрабатывает минимум', () => {
    const result = parsePid('11', '00');
    assert.strictEqual(result, 0);
  });

  await it('Throttle: обрабатывает максимум', () => {
    const result = parsePid('11', 'FF');
    assert.strictEqual(result, 100);
  });
});
