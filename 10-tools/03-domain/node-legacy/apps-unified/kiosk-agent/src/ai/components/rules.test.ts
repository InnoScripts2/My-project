/**
 * Unit tests for rules.ts - OBD status aggregator
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { aggregateObdStatus, type ObdScanResult, type OverallStatus } from './rules.js';

describe('aggregateObdStatus', () => {
  it('returns OK status when no issues detected', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [
        { name: 'Catalyst', status: 'Ready' },
        { name: 'Oxygen Sensor', status: 'Ready' },
      ],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'OK');
    assert.strictEqual(summary.dtcCount, 0);
    assert.strictEqual(summary.criticalCodes.length, 0);
    assert.strictEqual(summary.warningCodes.length, 0);
    assert.ok(summary.recommendations.length > 0);
  });

  it('returns CRITICAL status when MIL is ON', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [],
      milStatus: 'ON',
      freezeFrame: null,
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'CRITICAL');
    assert.ok(summary.criticalCodes.includes('MIL_ON'));
  });

  it('returns CRITICAL status when freeze frame data exists', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [],
      milStatus: 'OFF',
      freezeFrame: {
        dtcCode: 'P0301',
        rpm: 2000,
        coolantTemp: 90,
      },
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'CRITICAL');
    assert.ok(summary.criticalCodes.some(code => code.includes('P0301')));
  });

  it('returns CRITICAL status for confirmed P0xxx codes', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [
        { code: 'P0301', status: 'Confirmed', description: 'Misfire cylinder 1' },
      ],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'CRITICAL');
    assert.ok(summary.criticalCodes.includes('P0301'));
  });

  it('returns CRITICAL status for pending P2xxx codes', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [
        { code: 'P2002', status: 'Pending', description: 'Diesel particulate filter' },
      ],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'CRITICAL');
    assert.ok(summary.criticalCodes.includes('P2002'));
  });

  it('returns WARNING status for stored codes only', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [
        { code: 'P0420', status: 'Stored', description: 'Catalyst efficiency' },
      ],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'WARNING');
    assert.ok(summary.warningCodes.includes('P0420'));
    assert.strictEqual(summary.criticalCodes.length, 0);
  });

  it('returns WARNING status for not ready monitors', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [
        { name: 'Catalyst', status: 'NotReady' },
        { name: 'Oxygen Sensor', status: 'Incomplete' },
      ],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'WARNING');
    assert.ok(summary.recommendations.some(r => r.includes('не готовы')));
  });

  it('prioritizes CRITICAL over WARNING', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [
        { code: 'P0301', status: 'Confirmed', description: 'Misfire' },
        { code: 'P0420', status: 'Stored', description: 'Catalyst' },
      ],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [
        { name: 'EVAP', status: 'NotReady' },
      ],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.status, 'CRITICAL');
    assert.ok(summary.criticalCodes.includes('P0301'));
    assert.ok(summary.warningCodes.includes('P0420'));
  });

  it('counts all DTC codes correctly', () => {
    const scanResult: ObdScanResult = {
      dtcCodes: [
        { code: 'P0301', status: 'Confirmed', description: 'Misfire 1' },
        { code: 'P0302', status: 'Pending', description: 'Misfire 2' },
        { code: 'P0420', status: 'Stored', description: 'Catalyst' },
      ],
      milStatus: 'OFF',
      freezeFrame: null,
      readinessMonitors: [],
      timestamp: new Date(),
    };

    const summary = aggregateObdStatus(scanResult);

    assert.strictEqual(summary.dtcCount, 3);
  });
});
