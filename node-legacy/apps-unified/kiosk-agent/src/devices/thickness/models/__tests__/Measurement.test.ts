/**
 * Unit tests for Measurement models
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getZoneDefinition,
  getAllZones,
  createMeasurementPoint,
  createSession,
  addMeasurement,
  ThicknessStatus,
} from '../Measurement.js';

describe('Measurement models', () => {
  describe('getZoneDefinition', () => {
    it('should return zone definition for valid zoneId', () => {
      const zone = getZoneDefinition(0);
      assert.ok(zone);
      assert.strictEqual(zone.zoneId, 0);
      assert.strictEqual(zone.zoneName, 'Капот передний левый');
      assert.strictEqual(zone.normMin, 80);
      assert.strictEqual(zone.normMax, 150);
    });

    it('should return undefined for invalid zoneId', () => {
      const zone = getZoneDefinition(999);
      assert.strictEqual(zone, undefined);
    });
  });

  describe('getAllZones', () => {
    it('should return all 60 zones', () => {
      const zones = getAllZones();
      assert.strictEqual(zones.length, 60);
    });

    it('should have sequential zone IDs starting from 0', () => {
      const zones = getAllZones();
      zones.forEach((zone, index) => {
        assert.strictEqual(zone.zoneId, index);
      });
    });
  });

  describe('createMeasurementPoint', () => {
    it('should create measurement point with normal value', () => {
      const point = createMeasurementPoint(0, 100, Date.now());
      assert.ok(point);
      assert.strictEqual(point.zoneId, 0);
      assert.strictEqual(point.value, 100);
      assert.strictEqual(point.isNormal, true);
    });

    it('should create measurement point with abnormal value (too low)', () => {
      const point = createMeasurementPoint(0, 50, Date.now());
      assert.ok(point);
      assert.strictEqual(point.value, 50);
      assert.strictEqual(point.isNormal, false);
    });

    it('should create measurement point with abnormal value (too high)', () => {
      const point = createMeasurementPoint(0, 200, Date.now());
      assert.ok(point);
      assert.strictEqual(point.value, 200);
      assert.strictEqual(point.isNormal, false);
    });

    it('should return null for invalid zoneId', () => {
      const point = createMeasurementPoint(999, 100, Date.now());
      assert.strictEqual(point, null);
    });

    it('should check boundary values correctly', () => {
      const pointMin = createMeasurementPoint(0, 80, Date.now());
      const pointMax = createMeasurementPoint(0, 150, Date.now());
      assert.strictEqual(pointMin?.isNormal, true);
      assert.strictEqual(pointMax?.isNormal, true);
    });
  });

  describe('createSession', () => {
    it('should create session with default 60 zones', () => {
      const session = createSession();
      assert.strictEqual(session.totalZones, 60);
      assert.strictEqual(session.measuredZones, 0);
      assert.strictEqual(session.measurements.length, 0);
      assert.strictEqual(session.status, ThicknessStatus.MEASURING);
      assert.ok(session.sessionId);
      assert.ok(session.startTime);
    });

    it('should create session with custom zone count', () => {
      const session = createSession(40);
      assert.strictEqual(session.totalZones, 40);
    });
  });

  describe('addMeasurement', () => {
    it('should add measurement to session', () => {
      const session = createSession(3);
      const point = createMeasurementPoint(0, 100, Date.now());
      assert.ok(point);

      const updated = addMeasurement(session, point);
      assert.strictEqual(updated.measurements.length, 1);
      assert.strictEqual(updated.measuredZones, 1);
      assert.strictEqual(updated.status, ThicknessStatus.MEASURING);
    });

    it('should mark session complete when all zones measured', () => {
      let session = createSession(2);
      
      const point1 = createMeasurementPoint(0, 100, Date.now());
      assert.ok(point1);
      session = addMeasurement(session, point1);
      assert.strictEqual(session.status, ThicknessStatus.MEASURING);

      const point2 = createMeasurementPoint(1, 100, Date.now());
      assert.ok(point2);
      session = addMeasurement(session, point2);
      assert.strictEqual(session.status, ThicknessStatus.COMPLETE);
      assert.ok(session.endTime);
    });

    it('should not mutate original session', () => {
      const session = createSession(3);
      const point = createMeasurementPoint(0, 100, Date.now());
      assert.ok(point);

      const updated = addMeasurement(session, point);
      assert.strictEqual(session.measurements.length, 0);
      assert.strictEqual(updated.measurements.length, 1);
    });
  });
});
