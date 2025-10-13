/**
 * ThicknessAnalyzer.test.ts - Unit tests for thickness analyzer
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThicknessAnalyzer } from './ThicknessAnalyzer.js';
describe('ThicknessAnalyzer', () => {
    describe('detectAnomalies', () => {
        it('should detect high thickness anomalies', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 250 },
                { zone: 'hood_2', value: 120 },
                { zone: 'hood_3', value: 100 }
            ];
            const anomalies = analyzer.detectAnomalies(measurements);
            assert.strictEqual(anomalies.length, 1);
            assert.strictEqual(anomalies[0].zone, 'hood_1');
            assert.strictEqual(anomalies[0].type, 'too_high');
            assert.strictEqual(anomalies[0].severity, 'critical');
        });
        it('should detect low thickness anomalies', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 30 },
                { zone: 'hood_2', value: 120 },
                { zone: 'hood_3', value: 100 }
            ];
            const anomalies = analyzer.detectAnomalies(measurements);
            assert.strictEqual(anomalies.length, 1);
            assert.strictEqual(anomalies[0].zone, 'hood_1');
            assert.strictEqual(anomalies[0].type, 'too_low');
            assert.strictEqual(anomalies[0].severity, 'critical');
        });
        it('should detect warning level anomalies', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 220 }, // warning
                { zone: 'hood_2', value: 45 }, // warning
                { zone: 'hood_3', value: 100 }
            ];
            const anomalies = analyzer.detectAnomalies(measurements);
            assert.strictEqual(anomalies.length, 2);
            assert.ok(anomalies.every(a => a.severity === 'warning'));
        });
        it('should return empty array for no anomalies', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120 },
                { zone: 'hood_2', value: 115 },
                { zone: 'hood_3', value: 110 }
            ];
            const anomalies = analyzer.detectAnomalies(measurements);
            assert.strictEqual(anomalies.length, 0);
        });
    });
    describe('generateHeatMap', () => {
        it('should generate heat map grid', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120, x: 0.1, y: 0.1 },
                { zone: 'hood_2', value: 150, x: 0.5, y: 0.5 },
                { zone: 'hood_3', value: 100, x: 0.9, y: 0.9 }
            ];
            const heatMap = analyzer.generateHeatMap(measurements, 10, 6);
            assert.strictEqual(heatMap.width, 10);
            assert.strictEqual(heatMap.height, 6);
            assert.strictEqual(heatMap.data.length, 6);
            assert.strictEqual(heatMap.data[0].length, 10);
            assert.strictEqual(heatMap.colorScale.min, 100);
            assert.strictEqual(heatMap.colorScale.max, 150);
        });
        it('should handle measurements without coordinates', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120 },
                { zone: 'hood_2', value: 150 },
            ];
            const heatMap = analyzer.generateHeatMap(measurements, 10, 6);
            assert.ok(heatMap);
            assert.strictEqual(heatMap.width, 10);
            assert.strictEqual(heatMap.height, 6);
        });
    });
    describe('calculateStatistics', () => {
        it('should calculate correct statistics', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 100 },
                { zone: 'hood_2', value: 120 },
                { zone: 'hood_3', value: 140 },
                { zone: 'hood_4', value: 110 },
                { zone: 'hood_5', value: 130 }
            ];
            const stats = analyzer.calculateStatistics(measurements);
            assert.strictEqual(stats.count, 5);
            assert.strictEqual(stats.mean, 120);
            assert.strictEqual(stats.median, 120);
            assert.strictEqual(stats.min, 100);
            assert.strictEqual(stats.max, 140);
            assert.ok(stats.stddev > 0);
        });
        it('should handle empty measurements', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [];
            const stats = analyzer.calculateStatistics(measurements);
            assert.strictEqual(stats.count, 0);
            assert.strictEqual(stats.mean, 0);
            assert.strictEqual(stats.median, 0);
        });
        it('should calculate median correctly for even count', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'a', value: 100 },
                { zone: 'b', value: 120 },
                { zone: 'c', value: 140 },
                { zone: 'd', value: 160 }
            ];
            const stats = analyzer.calculateStatistics(measurements);
            assert.strictEqual(stats.median, 130); // (120 + 140) / 2
        });
    });
    describe('detectRepairZones', () => {
        it('should detect repair zones from clusters', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 190 },
                { zone: 'hood_2', value: 185 },
                { zone: 'hood_3', value: 195 },
                { zone: 'hood_4', value: 120 },
                { zone: 'hood_5', value: 110 }
            ];
            const zones = analyzer.detectRepairZones(measurements, 180);
            assert.ok(zones.length >= 1);
            assert.ok(zones[0].zones.length >= 3);
            assert.ok(zones[0].avgThickness > 180);
            assert.ok(zones[0].confidence >= 0 && zones[0].confidence <= 1);
        });
        it('should return empty array when no repair zones', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120 },
                { zone: 'hood_2', value: 115 },
                { zone: 'hood_3', value: 110 }
            ];
            const zones = analyzer.detectRepairZones(measurements, 180);
            assert.strictEqual(zones.length, 0);
        });
        it('should use custom threshold', () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 170 },
                { zone: 'hood_2', value: 165 },
                { zone: 'hood_3', value: 175 },
                { zone: 'hood_4', value: 120 }
            ];
            const zones = analyzer.detectRepairZones(measurements, 160);
            assert.ok(zones.length >= 1);
        });
    });
    describe('exportForML', () => {
        it('should export CSV format', async () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120, x: 0.1, y: 0.2 },
                { zone: 'hood_2', value: 130, x: 0.3, y: 0.4 }
            ];
            const filepath = await analyzer.exportForML('test-session', measurements);
            assert.ok(filepath.includes('.csv'));
            assert.ok(filepath.includes('test-session'));
            // Verify file content
            const fs = await import('fs/promises');
            const content = await fs.readFile(filepath, 'utf-8');
            assert.ok(content.includes('zone,x,y,thickness_microns'));
            assert.ok(content.includes('hood_1,0.1,0.2,120'));
            assert.ok(content.includes('hood_2,0.3,0.4,130'));
            // Cleanup
            await fs.unlink(filepath);
        });
        it('should handle measurements without coordinates', async () => {
            const analyzer = new ThicknessAnalyzer();
            const measurements = [
                { zone: 'hood_1', value: 120 },
                { zone: 'hood_2', value: 130 }
            ];
            const filepath = await analyzer.exportForML('test-session2', measurements);
            const fs = await import('fs/promises');
            const content = await fs.readFile(filepath, 'utf-8');
            assert.ok(content.includes('hood_1,0,0,120'));
            assert.ok(content.includes('hood_2,0,0,130'));
            // Cleanup
            await fs.unlink(filepath);
        });
    });
});
