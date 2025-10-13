/**
 * DtcParser tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DtcParser } from '../parsers/DtcParser.js';
describe('DtcParser', () => {
    it('should parse single DTC code', () => {
        const response = '43 01 33';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0133');
        assert.equal(result[0].type, 'Powertrain');
    });
    it('should parse multiple DTC codes', () => {
        const response = '43 01 33 02 47';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 2);
        assert.equal(result[0].code, 'P0133');
        assert.equal(result[1].code, 'P0247');
    });
    it('should ignore empty DTC slots', () => {
        const response = '43 01 33 00 00';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0133');
    });
    it('should parse chassis DTC', () => {
        const response = '43 41 23';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'C0123');
        assert.equal(result[0].type, 'Chassis');
    });
    it('should parse body DTC', () => {
        const response = '43 81 45';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'B0145');
        assert.equal(result[0].type, 'Body');
    });
    it('should parse network DTC', () => {
        const response = '43 C1 67';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'U0167');
        assert.equal(result[0].type, 'Network');
    });
    it('should handle no DTCs', () => {
        const response = '43 00 00';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 0);
    });
    it('should format DTC code correctly', () => {
        // P0133: high=01, low=33
        const code = DtcParser.formatDtcCode(0x01, 0x33);
        assert.equal(code, 'P0133');
    });
    it('should handle P1xxx codes', () => {
        // P1234: high=12 (0x12), low=34 (0x34)
        // 0x12 = 0001 0010: bits 7-6=00 (P), bits 5-4=01 (1), bits 3-0=0010 (2)
        // 0x34 = 0011 0100: bits 7-4=0011 (3), bits 3-0=0100 (4)
        const response = '43 12 34';
        const result = DtcParser.parseDtcResponse(response);
        assert.ok(result.length > 0);
        assert.ok(result[0].code.startsWith('P'));
        assert.equal(result[0].code, 'P1234');
    });
    it('should determine DTC type correctly', () => {
        assert.equal(DtcParser.getDtcType('P0420'), 'Powertrain');
        assert.equal(DtcParser.getDtcType('C1234'), 'Chassis');
        assert.equal(DtcParser.getDtcType('B0001'), 'Body');
        assert.equal(DtcParser.getDtcType('U0001'), 'Network');
    });
    it('should handle lowercase input', () => {
        const response = '43 01 33';
        const result = DtcParser.parseDtcResponse(response.toLowerCase());
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0133');
    });
    it('should handle response without 43 prefix', () => {
        const response = '01 33 02 47';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 2);
    });
    it('should handle whitespace in response', () => {
        const response = '43 01 33 02 47';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 2);
        assert.equal(result[0].code, 'P0133');
        assert.equal(result[1].code, 'P0247');
    });
    it('should parse P0420 (catalyst efficiency)', () => {
        const response = '43 04 20';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0420');
    });
    it('should parse P0300 (random misfire)', () => {
        const response = '43 03 00';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0300');
    });
    it('should handle odd number of hex digits', () => {
        // Should handle gracefully or skip incomplete pairs
        const response = '43 01 33 0';
        const result = DtcParser.parseDtcResponse(response);
        // Should parse complete pairs only
        assert.equal(result.length, 1);
    });
    it('should handle multiple empty slots', () => {
        const response = '43 01 33 00 00 00 00 00 00';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 1);
        assert.equal(result[0].code, 'P0133');
    });
    it('should parse real-world Toyota DTC response', () => {
        // Common Toyota codes
        const response = '43 01 33 04 20 02 37';
        const result = DtcParser.parseDtcResponse(response);
        assert.equal(result.length, 3);
        assert.ok(result.every((dtc) => dtc.code.startsWith('P')));
    });
});
