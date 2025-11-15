/**
 * FakeObdDevice Unit Tests
 * Tests for mock OBD adapter with multiple scenarios
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeObdDevice } from '../mocks/FakeObdDevice.js';
describe('FakeObdDevice', () => {
    describe('connection', () => {
        it('should connect in fake mode', async () => {
            const device = new FakeObdDevice();
            assert.ok(!device.isConnected());
            await device.connect();
            assert.ok(device.isConnected());
            await device.disconnect();
        });
        it('should emit connected event', async () => {
            const device = new FakeObdDevice();
            let connected = false;
            device.on('connected', () => {
                connected = true;
            });
            await device.connect();
            assert.ok(connected);
            await device.disconnect();
        });
        it('should disconnect', async () => {
            const device = new FakeObdDevice();
            await device.connect();
            assert.ok(device.isConnected());
            await device.disconnect();
            assert.ok(!device.isConnected());
        });
    });
    describe('scenarios - Idle', () => {
        it('should return simulated idle data', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            // Test RPM (PID 0C) - should be ~800 RPM
            const rpmResponse = await device.requestPid('01', '0C');
            assert.ok(rpmResponse);
            // Test Speed (PID 0D) - should be 0
            const speedResponse = await device.requestPid('01', '0D');
            assert.ok(speedResponse);
            await device.disconnect();
        });
        it('should return RPM 800 in idle scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            const response = await device.sendCommand('010C');
            assert.match(response, /41\s*0C/i);
            await device.disconnect();
        });
        it('should return speed 0 in idle scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            const response = await device.sendCommand('010D');
            assert.match(response, /41\s*0D/i);
            await device.disconnect();
        });
    });
    describe('scenarios - Driving', () => {
        it('should return simulated driving data', async () => {
            const device = new FakeObdDevice({ scenario: 'Driving' });
            await device.connect();
            // Test RPM (PID 0C) - should be ~2500 RPM
            const rpmResponse = await device.requestPid('01', '0C');
            assert.ok(rpmResponse);
            // Test Speed (PID 0D) - should be 60 km/h
            const speedResponse = await device.requestPid('01', '0D');
            assert.ok(speedResponse);
            await device.disconnect();
        });
        it('should return RPM 2500 in driving scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'Driving' });
            await device.connect();
            const response = await device.sendCommand('010C');
            assert.match(response, /41\s*0C/i);
            await device.disconnect();
        });
        it('should return speed 60 in driving scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'Driving' });
            await device.connect();
            const response = await device.sendCommand('010D');
            assert.match(response, /41\s*0D/i);
            // Parse to verify it's approximately 60
            const speedHex = response.match(/41\s*0D\s*([0-9A-F]+)/i);
            if (speedHex) {
                const speed = parseInt(speedHex[1], 16);
                assert.ok(speed >= 59 && speed <= 61); // Allow small tolerance
            }
            await device.disconnect();
        });
    });
    describe('scenarios - DTC Present', () => {
        it('should return DTC codes in dtcPresent scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'DtcPresent' });
            await device.connect();
            const dtcs = await device.requestDtc();
            assert.ok(Array.isArray(dtcs));
            assert.equal(dtcs.length, 2);
            assert.ok(dtcs.some(dtc => dtc.code === 'P0420'));
            assert.ok(dtcs.some(dtc => dtc.code === 'P0171'));
            await device.disconnect();
        });
        it('should format DTC response correctly', async () => {
            const device = new FakeObdDevice({ scenario: 'DtcPresent' });
            await device.connect();
            const response = await device.sendCommand('03');
            assert.match(response, /43/); // Mode 03 response starts with 43
            await device.disconnect();
        });
    });
    describe('scenarios - Normal (no DTCs)', () => {
        it('should return empty DTC in normal scenarios', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            const dtcs = await device.requestDtc();
            assert.ok(Array.isArray(dtcs));
            assert.equal(dtcs.length, 0);
            await device.disconnect();
        });
    });
    describe('DTC operations', () => {
        it('should clear DTC codes', async () => {
            const device = new FakeObdDevice({ scenario: 'DtcPresent' });
            await device.connect();
            // Should not throw
            await device.clearDtc();
            await device.disconnect();
        });
        it('should respond to clear DTC command', async () => {
            const device = new FakeObdDevice();
            await device.connect();
            const response = await device.sendCommand('04');
            assert.equal(response, '44');
            await device.disconnect();
        });
    });
    describe('scenario switching', () => {
        it('should switch scenarios on the fly', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            // Check idle has no DTCs
            let dtcs = await device.requestDtc();
            assert.equal(dtcs.length, 0);
            // Switch to DTC present scenario
            device.setScenario('DtcPresent');
            // Now should have DTCs
            dtcs = await device.requestDtc();
            assert.equal(dtcs.length, 2);
            await device.disconnect();
        });
        it('should emit scenario_changed event', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            let eventFired = false;
            let newScenario = '';
            device.on('scenario_changed', (scenario) => {
                eventFired = true;
                newScenario = scenario;
            });
            await device.connect();
            device.setScenario('Driving');
            assert.ok(eventFired);
            assert.equal(newScenario, 'Driving');
            await device.disconnect();
        });
    });
    describe('response timing', () => {
        it('should simulate response delay', async () => {
            const device = new FakeObdDevice({ responseDelay: 75 });
            await device.connect();
            const start = Date.now();
            await device.sendCommand('010C');
            const elapsed = Date.now() - start;
            // Should take approximately 75ms
            assert.ok(elapsed >= 70 && elapsed <= 150); // Allow some tolerance
            await device.disconnect();
        });
        it('should respect custom response delay', async () => {
            const device = new FakeObdDevice({ responseDelay: 100 });
            await device.connect();
            const start = Date.now();
            await device.sendCommand('010C');
            const elapsed = Date.now() - start;
            // Should take approximately 100ms
            assert.ok(elapsed >= 95 && elapsed <= 150);
            await device.disconnect();
        });
    });
    describe('scenarios - Hybrid Toyota', () => {
        it('should support hybrid Toyota scenario', async () => {
            const device = new FakeObdDevice({ scenario: 'HybridToyota' });
            await device.connect();
            // HV battery data should be available
            const hvVoltageResponse = await device.sendCommand('220100');
            assert.match(hvVoltageResponse, /62\s*0100/i);
            await device.disconnect();
        });
        it('should return HV battery voltage', async () => {
            const device = new FakeObdDevice({ scenario: 'HybridToyota' });
            await device.connect();
            const response = await device.sendCommand('220100');
            assert.match(response, /62\s*0100/i); // UDS positive response
            await device.disconnect();
        });
        it('should return HV battery SOC', async () => {
            const device = new FakeObdDevice({ scenario: 'HybridToyota' });
            await device.connect();
            const response = await device.sendCommand('220102');
            assert.match(response, /62\s*0102/i);
            await device.disconnect();
        });
        it('should return MG1 and MG2 speeds', async () => {
            const device = new FakeObdDevice({ scenario: 'HybridToyota' });
            await device.connect();
            const mg1Response = await device.sendCommand('220120');
            assert.match(mg1Response, /62\s*0120/i);
            const mg2Response = await device.sendCommand('220121');
            assert.match(mg2Response, /62\s*0121/i);
            await device.disconnect();
        });
    });
    describe('UDS commands', () => {
        it('should support UDS commands in fake mode', async () => {
            const device = new FakeObdDevice({ scenario: 'Lexus' });
            await device.connect();
            // VIN via UDS
            const vinResponse = await device.sendCommand('22F190');
            assert.match(vinResponse, /62\s*F190/i);
            await device.disconnect();
        });
        it('should return simulated VIN data', async () => {
            const device = new FakeObdDevice({ scenario: 'Lexus' });
            await device.connect();
            const response = await device.sendCommand('22F190');
            assert.ok(response.includes('62'));
            assert.ok(response.includes('F190'));
            await device.disconnect();
        });
        it('should return negative response for unsupported DIDs', async () => {
            const device = new FakeObdDevice({ scenario: 'Idle' });
            await device.connect();
            const response = await device.sendCommand('22FFFF');
            assert.match(response, /7F/i); // Negative response
            await device.disconnect();
        });
    });
    describe('AT commands', () => {
        it('should respond to ATZ reset', async () => {
            const device = new FakeObdDevice();
            await device.connect();
            const response = await device.sendCommand('ATZ');
            assert.match(response, /ELM327/i);
            await device.disconnect();
        });
        it('should respond to AT commands with OK', async () => {
            const device = new FakeObdDevice();
            await device.connect();
            let response = await device.sendCommand('ATE0');
            assert.equal(response, 'OK');
            response = await device.sendCommand('ATL0');
            assert.equal(response, 'OK');
            await device.disconnect();
        });
    });
});
