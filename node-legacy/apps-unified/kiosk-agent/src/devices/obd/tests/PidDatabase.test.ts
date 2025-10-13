/**
 * PidDatabase tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PidDatabase } from '../database/PidDatabase.js';

describe('PidDatabase', () => {
  const db = new PidDatabase();

  it('should return PID by name', () => {
    const pid = db.getPidByName('Engine RPM');
    assert.ok(pid, 'PID should exist');
    assert.equal(pid.name, 'Engine RPM');
    assert.equal(pid.mode, '01');
    assert.equal(pid.pid, '0C');
    assert.equal(pid.bytes, 2);
    assert.equal(pid.unit, 'rpm');
  });

  it('should return PID by mode and pid', () => {
    const pid = db.getPidByModeAndPid('01', '0C');
    assert.ok(pid, 'PID should exist');
    assert.equal(pid.name, 'Engine RPM');
  });

  it('should return all PIDs', () => {
    const allPids = db.getAllPids();
    assert.ok(allPids.length >= 50, `Should have at least 50 PIDs, got ${allPids.length}`);
  });

  it('should return PIDs by mode', () => {
    const mode01Pids = db.getPidsByMode('01');
    assert.ok(mode01Pids.length > 0, 'Should have Mode 01 PIDs');
    assert.ok(mode01Pids.every((pid) => pid.mode === '01'), 'All PIDs should be Mode 01');
  });

  it('should validate PID exists', () => {
    assert.equal(db.validatePidExists('Engine RPM'), true);
    assert.equal(db.validatePidExists('NonExistent PID'), false);
  });

  it('should convert single byte PID correctly', () => {
    const pid = db.getPidByName('Vehicle Speed');
    assert.ok(pid, 'Vehicle Speed PID should exist');
    
    // Test conversion: speed of 100 km/h = 0x64
    const result = pid.convertToUseful('64');
    assert.equal(result, 100);
  });

  it('should convert multi byte PID correctly', () => {
    const pid = db.getPidByName('Engine RPM');
    assert.ok(pid, 'Engine RPM PID should exist');
    
    // Test conversion: 2000 RPM
    // Formula: (A*256 + B) / 4
    // 2000 RPM = 8000 raw value
    // A = 31 (0x1F), B = 64 (0x40)
    // (31*256 + 64) / 4 = 8000 / 4 = 2000
    const result = pid.convertToUseful('1F40');
    assert.equal(result, 2000);
  });

  it('should handle temperature conversion', () => {
    const pid = db.getPidByName('Engine Coolant Temperature');
    assert.ok(pid, 'Coolant Temperature PID should exist');
    
    // Test conversion: 80°C
    // Formula: A - 40
    // 80°C = 120 raw (0x78)
    const result = pid.convertToUseful('78');
    assert.equal(result, 80);
    
    // Test negative temperature
    const resultNegative = pid.convertToUseful('00');
    assert.equal(resultNegative, -40);
  });

  it('should handle percentage conversion', () => {
    const pid = db.getPidByName('Throttle Position');
    assert.ok(pid, 'Throttle Position PID should exist');
    
    // Test conversion: 50%
    // Formula: A * 100 / 255
    // 50% ≈ 127 raw (0x7F)
    const result = pid.convertToUseful('7F');
    assert.ok(Math.abs(result - 49.8) < 0.5, `Expected ~50%, got ${result}%`);
    
    // Test 100%
    const resultMax = pid.convertToUseful('FF');
    assert.equal(resultMax, 100);
  });

  it('should return undefined for non-existent PID by name', () => {
    const pid = db.getPidByName('NonExistent PID');
    assert.equal(pid, undefined);
  });

  it('should return undefined for non-existent PID by mode and pid', () => {
    const pid = db.getPidByModeAndPid('01', 'FF');
    assert.equal(pid, undefined);
  });

  it('should handle case-insensitive PID lookup', () => {
    const pid1 = db.getPidByModeAndPid('01', '0c');
    const pid2 = db.getPidByModeAndPid('01', '0C');
    assert.ok(pid1, 'Lowercase PID should be found');
    assert.ok(pid2, 'Uppercase PID should be found');
    assert.equal(pid1.name, pid2.name);
  });

  it('should have correct min/max ranges', () => {
    const rpmPid = db.getPidByName('Engine RPM');
    assert.ok(rpmPid, 'RPM PID should exist');
    assert.equal(rpmPid.min, 0);
    assert.equal(rpmPid.max, 16383);

    const speedPid = db.getPidByName('Vehicle Speed');
    assert.ok(speedPid, 'Speed PID should exist');
    assert.equal(speedPid.min, 0);
    assert.equal(speedPid.max, 255);
  });

  it('should have correct units', () => {
    const rpmPid = db.getPidByName('Engine RPM');
    assert.equal(rpmPid?.unit, 'rpm');

    const tempPid = db.getPidByName('Engine Coolant Temperature');
    assert.equal(tempPid?.unit, '°C');

    const throttlePid = db.getPidByName('Throttle Position');
    assert.equal(throttlePid?.unit, '%');
  });
});
