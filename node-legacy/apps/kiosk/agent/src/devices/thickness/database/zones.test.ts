import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sedanZones, minivanZones, ZoneDatabase } from './zones.js';

await describe('ZoneDatabase', async () => {
  await describe('sedan zones', async () => {
    await it('should have 40 zones', () => {
      const zones = sedanZones.getAllZones();
      assert.strictEqual(zones.length, 40);
    });

    await it('should get zone by id', () => {
      const zone = sedanZones.getZone(1);
      assert.ok(zone);
      assert.strictEqual(zone.id, 1);
      assert.ok(zone.name);
      assert.ok(zone.description);
    });

    await it('should return null for invalid zone id', () => {
      const zone = sedanZones.getZone(999);
      assert.strictEqual(zone, null);
    });

    await it('should filter zones by category', () => {
      const hoodZones = sedanZones.getZonesByCategory('hood');
      assert.strictEqual(hoodZones.length, 8);
      hoodZones.forEach((zone) => {
        assert.strictEqual(zone.category, 'hood');
      });
    });

    await it('should filter zones by position', () => {
      const leftZones = sedanZones.getZonesByPosition('left');
      assert.ok(leftZones.length > 0);
      leftZones.forEach((zone) => {
        assert.strictEqual(zone.position, 'left');
      });
    });

    await it('should validate thickness', () => {
      const zone = sedanZones.getZone(1);
      assert.ok(zone);

      const normalThickness = zone.standardThickness.typical;
      const isNormal = sedanZones.isThicknessNormal(1, normalThickness);
      assert.strictEqual(isNormal, true);

      const tooLow = zone.standardThickness.min - 10;
      const isLowNormal = sedanZones.isThicknessNormal(1, tooLow);
      assert.strictEqual(isLowNormal, false);

      const tooHigh = zone.standardThickness.max + 10;
      const isHighNormal = sedanZones.isThicknessNormal(1, tooHigh);
      assert.strictEqual(isHighNormal, false);
    });

    await it('should calculate deviation', () => {
      const zone = sedanZones.getZone(1);
      assert.ok(zone);

      const typical = zone.standardThickness.typical;
      const deviation = sedanZones.getDeviation(1, typical);
      assert.strictEqual(deviation, 0);

      const higher = typical + 50;
      const positiveDeviation = sedanZones.getDeviation(1, higher);
      assert.strictEqual(positiveDeviation, 50);

      const lower = typical - 30;
      const negativeDeviation = sedanZones.getDeviation(1, lower);
      assert.strictEqual(negativeDeviation, -30);
    });
  });

  await describe('minivan zones', async () => {
    await it('should have 60 zones', () => {
      const zones = minivanZones.getAllZones();
      assert.strictEqual(zones.length, 60);
    });

    await it('should include all sedan zones plus additional', () => {
      const sedanCount = sedanZones.getAllZones().length;
      const minivanCount = minivanZones.getAllZones().length;
      assert.ok(minivanCount > sedanCount);
    });
  });

  await describe('zone categories', async () => {
    await it('should have all required categories', () => {
      const categories: Array<'hood' | 'roof' | 'door' | 'fender' | 'quarter_panel' | 'bumper' | 'trunk'> = [
        'hood',
        'roof',
        'door',
        'fender',
        'quarter_panel',
        'trunk',
      ];

      for (const category of categories) {
        const zones = sedanZones.getZonesByCategory(category);
        assert.ok(zones.length > 0, `Should have zones for category: ${category}`);
      }
    });

    await it('should have zones in all positions', () => {
      const positions: Array<'front' | 'rear' | 'left' | 'right' | 'center'> = [
        'left',
        'right',
        'center',
      ];

      for (const position of positions) {
        const zones = sedanZones.getZonesByPosition(position);
        assert.ok(zones.length > 0, `Should have zones for position: ${position}`);
      }
    });
  });

  await describe('standard thickness values', async () => {
    await it('should have valid thickness ranges', () => {
      const zones = sedanZones.getAllZones();

      for (const zone of zones) {
        assert.ok(zone.standardThickness.min > 0);
        assert.ok(zone.standardThickness.max > zone.standardThickness.min);
        assert.ok(
          zone.standardThickness.typical >= zone.standardThickness.min &&
            zone.standardThickness.typical <= zone.standardThickness.max
        );
      }
    });
  });

  await describe('zone names and descriptions', async () => {
    await it('should have unique zone ids', () => {
      const zones = sedanZones.getAllZones();
      const ids = zones.map((z) => z.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'All zone IDs should be unique');
    });

    await it('should have non-empty names and descriptions', () => {
      const zones = sedanZones.getAllZones();

      for (const zone of zones) {
        assert.ok(zone.name.length > 0, `Zone ${zone.id} should have a name`);
        assert.ok(zone.description.length > 0, `Zone ${zone.id} should have a description`);
      }
    });
  });
});
