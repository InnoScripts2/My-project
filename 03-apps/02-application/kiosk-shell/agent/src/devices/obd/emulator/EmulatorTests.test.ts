/**
 * Тестирование OBD-II системы с эмулятором ELM327
 * Комплексные тесты диагностических сценариев
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327EmulatorTransport, VEHICLE_PROFILES } from './ELM327Emulator.js';

async function sendCommand(
  emulator: ELM327EmulatorTransport,
  command: string,
  timeoutMs = 500
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const handler = (chunk: string) => {
      clearTimeout(timer);
      emulator.offData(handler);
      resolve(chunk.trim());
    };

    const timer = setTimeout(() => {
      emulator.offData(handler);
      reject(new Error(`Timed out waiting for response to ${command}`));
    }, timeoutMs);

    emulator.onData(handler);
    void emulator.write(command);
  });
}

describe('OBD-II Emulation Tests', () => {
  describe('ELM327 Emulator Transport', () => {
    test('should initialize with Toyota Camry profile', async () => {
      const emulator = new ELM327EmulatorTransport({
        vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
        responseDelay: 50
      });

      await emulator.open();
      assert.strictEqual(emulator.getStats().isOpen, true);

      const stats = emulator.getStats();
      assert.strictEqual(stats.currentState.engineRunning, true);
      assert(stats.currentState.rpm > 0);

      await emulator.close();
    });

    test('should respond to basic AT commands', async (t) => {
      const emulator = new ELM327EmulatorTransport();
      await emulator.open();

      const atz = await sendCommand(emulator, 'ATZ');
      const ate0 = await sendCommand(emulator, 'ATE0');
      const atl0 = await sendCommand(emulator, 'ATL0');
      const atdp = await sendCommand(emulator, 'ATDP');

      assert(atz.includes('ELM327'));
      assert(ate0.includes('OK'));
      assert(atl0.includes('OK'));
      assert(atdp.includes('ISO'));

      await emulator.close();
    });

    test('should return engine RPM data', async () => {
      const emulator = new ELM327EmulatorTransport({
        vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
        responseDelay: 50
      });

      await emulator.open();

      const rpmResponse = await sendCommand(emulator, '010C');
      assert(rpmResponse.startsWith('41 0C'));

      await emulator.close();
    });

    test('should simulate DTC codes', async () => {
      const emulator = new ELM327EmulatorTransport({
        vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
        customDtcCodes: ['P0171', 'P0420'],
        responseDelay: 50
      });

      await emulator.open();

      const dtcResponse = await sendCommand(emulator, '03');
      assert(dtcResponse.startsWith('43'));
      assert(!dtcResponse.includes('NO DATA'));

      await emulator.close();
    });

    test('should clear DTC codes', async () => {
      const emulator = new ELM327EmulatorTransport({
        vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
        customDtcCodes: ['P0171'],
        responseDelay: 50
      });

      await emulator.open();

      const clearResponse = await sendCommand(emulator, '04');
      assert(clearResponse.startsWith('44'));

      const dtcAfterClear = await sendCommand(emulator, '03');
      assert(dtcAfterClear.includes('NO DATA'));

      await emulator.close();
    });

    test('should simulate parameter changes over time', async () => {
      const emulator = new ELM327EmulatorTransport({
        vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
        responseDelay: 20
      });

      await emulator.open();

      const rpmValues: number[] = [];

      // Collect RPM values over time
      for (let i = 0; i < 5; i++) {
        const stats = emulator.getStats();
        rpmValues.push(stats.currentState.rpm);
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      // RPM should vary over time
      const uniqueValues = new Set(rpmValues);
      assert(uniqueValues.size > 1, 'RPM should change over time');

      await emulator.close();
    });
  });

  test('should execute a complete diagnostic command sequence', async () => {
    const emulator = new ELM327EmulatorTransport({
      vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
      customDtcCodes: ['P0171', 'P0420'],
      responseDelay: 40
    });

    await emulator.open();

    const atz = await sendCommand(emulator, 'ATZ');
    const ate0 = await sendCommand(emulator, 'ATE0');
    const rpm = await sendCommand(emulator, '010C');
    const dtcBefore = await sendCommand(emulator, '03');
    const clearResponse = await sendCommand(emulator, '04');
    const dtcAfter = await sendCommand(emulator, '03');

    assert(atz.includes('ELM327'));
    assert(ate0.includes('OK'));
    assert(rpm.startsWith('41 0C'));
    assert(dtcBefore.startsWith('43'));
    assert(clearResponse.startsWith('44'), 'DTC clear confirmation expected');
    assert(dtcAfter.includes('NO DATA'), 'Expected NO DATA after clearing DTC codes');

    await emulator.close();
  });
});
