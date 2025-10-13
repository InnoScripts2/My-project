/**
 * Unit tests for PID Parser
 * Tests parsing of Mode 01 PID values with formulas
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PidParser } from '../../parsers/PidParser.js';

describe('PidParser', () => {
  describe('parsePid', () => {
    it('should parse RPM (PID 0C) correctly', () => {
      const hexData = '1AF8';
      const result = PidParser.parsePid('0C', hexData);

      const expectedRpm = (0x1A * 256 + 0xF8) / 4;
      assert.equal(result.value, expectedRpm);
      assert.equal(result.unit, 'rpm');
      assert.equal(result.name, 'Engine RPM');
    });

    it('should parse Vehicle Speed (PID 0D) correctly', () => {
      const hexData = '50';
      const result = PidParser.parsePid('0D', hexData);

      assert.equal(result.value, 80);
      assert.equal(result.unit, 'km/h');
      assert.equal(result.name, 'Vehicle Speed');
    });

    it('should parse Coolant Temperature (PID 05) correctly', () => {
      const hexData = '64';
      const result = PidParser.parsePid('05', hexData);

      const expectedTemp = 0x64 - 40;
      assert.equal(result.value, expectedTemp);
      assert.equal(result.unit, '°C');
      assert.equal(result.name, 'Engine Coolant Temperature');
    });

    it('should parse Intake Air Temperature (PID 0F) correctly', () => {
      const hexData = '50';
      const result = PidParser.parsePid('0F', hexData);

      const expectedTemp = 0x50 - 40;
      assert.equal(result.value, expectedTemp);
      assert.equal(result.unit, '°C');
      assert.equal(result.name, 'Intake Air Temperature');
    });

    it('should parse Throttle Position (PID 11) correctly', () => {
      const hexData = 'FF';
      const result = PidParser.parsePid('11', hexData);

      const expectedThrottle = (0xFF * 100) / 255;
      assert.ok(Math.abs(result.value - expectedThrottle) < 0.01);
      assert.equal(result.unit, '%');
      assert.equal(result.name, 'Throttle Position');
    });

    it('should parse Control Module Voltage (PID 42) correctly', () => {
      const hexData = '3039';
      const result = PidParser.parsePid('42', hexData);

      const expectedVoltage = (0x30 * 256 + 0x39) / 1000;
      assert.ok(Math.abs(result.value - expectedVoltage) < 0.001);
      assert.equal(result.unit, 'V');
      assert.equal(result.name, 'Control Module Voltage');
    });

    it('should throw error for unknown PID', () => {
      assert.throws(
        () => PidParser.parsePid('FF', '00'),
        /Unknown PID/
      );
    });

    it('should include timestamp in result', () => {
      const hexData = '50';
      const result = PidParser.parsePid('0D', hexData);

      assert.ok(result.timestamp instanceof Date);
      assert.ok(result.timestamp.getTime() <= Date.now());
    });
  });

  describe('isPidSupported', () => {
    it('should return true for known PIDs', () => {
      assert.equal(PidParser.isPidSupported('0C'), true);
      assert.equal(PidParser.isPidSupported('0D'), true);
      assert.equal(PidParser.isPidSupported('05'), true);
    });

    it('should return false for unknown PIDs', () => {
      assert.equal(PidParser.isPidSupported('FF'), false);
      assert.equal(PidParser.isPidSupported('00'), false);
    });
  });

  describe('getPidMetadata', () => {
    it('should return metadata for known PID', () => {
      const metadata = PidParser.getPidMetadata('0C');

      assert.ok(metadata);
      assert.equal(metadata.name, 'Engine RPM');
      assert.equal(metadata.unit, 'rpm');
      assert.equal(metadata.bytes, 2);
    });

    it('should return undefined for unknown PID', () => {
      const metadata = PidParser.getPidMetadata('FF');
      assert.equal(metadata, undefined);
    });
  });
});
