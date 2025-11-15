/**
 * Unit tests for DTC Parser
 * Tests parsing of Mode 03 responses according to SAE J2012 standard
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DtcParser } from '../../parsers/DtcParser.js';

describe('DtcParser', () => {
  describe('parseDtcResponse', () => {
    it('should parse single DTC code', () => {
      const response = '43 01 33 00 00 00 00 00';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 1);
      assert.equal(result[0].code, 'P0133');
      assert.equal(result[0].type, 'Powertrain');
    });

    it('should parse multiple DTC codes', () => {
      const response = '43 01 33 00 44 00 00 00';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 2);
      assert.equal(result[0].code, 'P0133');
      assert.equal(result[1].code, 'P0044');
    });

    it('should return empty array for no codes', () => {
      const response = '43 00 00 00 00 00 00 00';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 0);
    });

    it('should handle response without 43 prefix', () => {
      const response = '01 33 00 44';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 2);
      assert.equal(result[0].code, 'P0133');
      assert.equal(result[1].code, 'P0044');
    });

    it('should parse C-codes correctly', () => {
      const response = '43 41 23';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 1);
      assert.equal(result[0].code[0], 'C');
      assert.equal(result[0].type, 'Chassis');
    });

    it('should parse B-codes correctly', () => {
      const response = '43 81 23';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 1);
      assert.equal(result[0].code[0], 'B');
      assert.equal(result[0].type, 'Body');
    });

    it('should parse U-codes correctly', () => {
      const response = '43 C1 00';
      const result = DtcParser.parseDtcResponse(response);

      assert.equal(result.length, 1);
      assert.equal(result[0].code[0], 'U');
      assert.equal(result[0].type, 'Network');
    });
  });

  describe('formatDtcCode', () => {
    it('should format P0133 correctly', () => {
      const code = DtcParser.formatDtcCode(0x01, 0x33);
      assert.equal(code, 'P0133');
    });

    it('should format P0044 correctly', () => {
      const code = DtcParser.formatDtcCode(0x00, 0x44);
      assert.equal(code, 'P0044');
    });

    it('should format C0040 correctly', () => {
      const code = DtcParser.formatDtcCode(0x40, 0x40);
      assert.equal(code, 'C0040');
    });

    it('should format B0001 correctly', () => {
      const code = DtcParser.formatDtcCode(0x80, 0x01);
      assert.equal(code, 'B0001');
    });

    it('should format U0100 correctly', () => {
      const code = DtcParser.formatDtcCode(0xC1, 0x00);
      assert.equal(code, 'U0100');
    });
  });

  describe('getDtcType', () => {
    it('should identify Powertrain codes', () => {
      assert.equal(DtcParser.getDtcType('P0133'), 'Powertrain');
    });

    it('should identify Chassis codes', () => {
      assert.equal(DtcParser.getDtcType('C0040'), 'Chassis');
    });

    it('should identify Body codes', () => {
      assert.equal(DtcParser.getDtcType('B0001'), 'Body');
    });

    it('should identify Network codes', () => {
      assert.equal(DtcParser.getDtcType('U0100'), 'Network');
    });

    it('should default to Powertrain for unknown prefix', () => {
      assert.equal(DtcParser.getDtcType('X0000'), 'Powertrain');
    });
  });
});
