/**
 * Тестирование OBD-II системы с эмулятором ELM327
 * Комплексные тесты диагностических сценариев
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327EmulatorTransport, VEHICLE_PROFILES } from './ELM327Emulator.js';
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
            const responses = [];
            emulator.onData((data) => {
                responses.push(data);
            });
            // Test initialization sequence
            await emulator.write('ATZ');
            await emulator.write('ATE0');
            await emulator.write('ATL0');
            await emulator.write('ATDP');
            // Wait for responses
            await new Promise(resolve => setTimeout(resolve, 500));
            assert(responses.length >= 4);
            assert(responses[0].includes('ELM327'));
            assert(responses[1].includes('OK'));
            assert(responses[2].includes('OK'));
            assert(responses[3].includes('ISO'));
            await emulator.close();
        });
        test('should return engine RPM data', async () => {
            const emulator = new ELM327EmulatorTransport({
                vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
                responseDelay: 50
            });
            await emulator.open();
            const responses = [];
            emulator.onData((data) => {
                responses.push(data);
            });
            await emulator.write('010C'); // Request RPM
            await new Promise(resolve => setTimeout(resolve, 100));
            assert(responses.length > 0);
            const rpmResponse = responses[0];
            assert(rpmResponse.includes('41 0C'));
            await emulator.close();
        });
        test('should simulate DTC codes', async () => {
            const emulator = new ELM327EmulatorTransport({
                vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
                customDtcCodes: ['P0171', 'P0420'],
                responseDelay: 50
            });
            await emulator.open();
            const responses = [];
            emulator.onData((data) => {
                responses.push(data);
            });
            await emulator.write('03'); // Request DTCs
            await new Promise(resolve => setTimeout(resolve, 100));
            assert(responses.length > 0);
            const dtcResponse = responses[0];
            assert(dtcResponse.includes('43'));
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
            const responses = [];
            emulator.onData((data) => {
                responses.push(data);
            });
            // Clear DTCs
            await emulator.write('04');
            await new Promise(resolve => setTimeout(resolve, 100));
            // Check DTCs after clearing
            await emulator.write('03');
            await new Promise(resolve => setTimeout(resolve, 100));
            assert(responses.length >= 2);
            assert(responses[0].includes('44')); // Clear confirmation
            assert(responses[1].includes('NO DATA')); // No DTCs remain
            await emulator.close();
        });
        test('should simulate parameter changes over time', async () => {
            const emulator = new ELM327EmulatorTransport({
                vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
                responseDelay: 20
            });
            await emulator.open();
            const rpmValues = [];
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
        const responses = [];
        emulator.onData((data) => {
            responses.push(data);
        });
        await emulator.write('ATZ');
        await emulator.write('ATE0');
        await emulator.write('010C');
        await emulator.write('03');
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert(responses.length >= 4);
        assert(responses.some((r) => r.includes('ELM327')));
        assert(responses.some((r) => r.startsWith('41 0C')));
        assert(responses.some((r) => r.startsWith('43')));
        await emulator.write('04');
        await new Promise((resolve) => setTimeout(resolve, 80));
        const hasClearResponse = responses.some((r) => r.startsWith('44'));
        assert(hasClearResponse, 'DTC clear confirmation expected');
        await emulator.close();
    });
});
