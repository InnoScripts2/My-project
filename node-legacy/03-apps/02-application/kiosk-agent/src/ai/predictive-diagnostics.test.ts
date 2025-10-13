/**
 * predictive-diagnostics.test.ts - Unit tests for predictive diagnostics
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PredictiveDiagnostics, type VehicleHistory, type DtcHistory } from './predictive-diagnostics.js';

describe('PredictiveDiagnostics', () => {
  describe('predictFutureIssues', () => {
    it('should predict recurring DTC codes', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const history: VehicleHistory = {
        vehicleId: 'test-vehicle',
        make: 'Toyota',
        model: 'Camry',
        year: 2018,
        mileage: 80000,
        dtcHistory: [
          { code: 'P0300', timestamp: '2024-01-01', cleared: false },
          { code: 'P0300', timestamp: '2024-02-01', cleared: true },
          { code: 'P0300', timestamp: '2024-03-01', cleared: false }
        ]
      };

      const predictions = await diagnostics.predictFutureIssues(history);

      assert.ok(predictions.length >= 1);
      const p300 = predictions.find(p => p.dtcCode === 'P0300');
      assert.ok(p300);
      assert.ok(p300.probability > 0.5);
      assert.ok(p300.preventiveMeasures.length > 0);
    });

    it('should return empty array for no recurring codes', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const history: VehicleHistory = {
        vehicleId: 'test-vehicle',
        mileage: 50000,
        dtcHistory: [
          { code: 'P0420', timestamp: '2024-01-01', cleared: true }
        ]
      };

      const predictions = await diagnostics.predictFutureIssues(history);

      assert.strictEqual(predictions.length, 0);
    });
  });

  describe('analyzeCorrelations', () => {
    it('should detect lean bank correlation', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const dtcs = ['P0171', 'P0174'];

      const correlations = await diagnostics.analyzeCorrelations(dtcs);

      assert.ok(correlations.length >= 1);
      const leanCorr = correlations.find(c => c.likelyRoot === 'vacuum_leak');
      assert.ok(leanCorr);
      assert.strictEqual(leanCorr.dtcCodes.length, 2);
      assert.ok(leanCorr.confidence > 0);
    });

    it('should detect misfire correlation', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const dtcs = ['P0300', 'P0301', 'P0302'];

      const correlations = await diagnostics.analyzeCorrelations(dtcs);

      assert.ok(correlations.length >= 1);
      const misfireCorr = correlations.find(c => c.likelyRoot === 'ignition_system');
      assert.ok(misfireCorr);
      assert.ok(misfireCorr.dtcCodes.length >= 2);
    });

    it('should return empty array for no correlations', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const dtcs = ['P0420'];

      const correlations = await diagnostics.analyzeCorrelations(dtcs);

      // P0420 alone doesn't correlate
      assert.strictEqual(correlations.length, 0);
    });
  });

  describe('predictComponentLifespan', () => {
    it('should predict oxygen sensor lifespan', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const history: DtcHistory[] = [
        { code: 'P0131', timestamp: '2024-01-01', cleared: false },
        { code: 'P0132', timestamp: '2024-02-01', cleared: false }
      ];

      const prediction = await diagnostics.predictComponentLifespan(
        'oxygen_sensor',
        80000,
        history
      );

      assert.strictEqual(prediction.component, 'oxygen_sensor');
      assert.ok(prediction.estimatedRemainingMileage >= 0);
      assert.strictEqual(prediction.confidenceInterval.length, 2);
      assert.ok(prediction.factors.length > 0);
    });

    it('should account for high mileage', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const history: DtcHistory[] = [];

      const prediction = await diagnostics.predictComponentLifespan(
        'spark_plugs',
        120000,
        history
      );

      assert.ok(prediction.factors.includes('high mileage'));
      assert.ok(prediction.estimatedRemainingMileage <= 0); // Over expected lifespan
    });

    it('should provide confidence intervals', async () => {
      const diagnostics = new PredictiveDiagnostics();
      const prediction = await diagnostics.predictComponentLifespan(
        'battery',
        40000,
        []
      );

      const [low, high] = prediction.confidenceInterval;
      assert.ok(high > low);
      assert.ok(low >= 0);
    });
  });

  describe('calculateRiskScore', () => {
    it('should return risk scores for all systems', async () => {
      const diagnostics = new PredictiveDiagnostics();

      const riskScores = await diagnostics.calculateRiskScore('vehicle-123');

      assert.ok(riskScores.engine >= 0 && riskScores.engine <= 100);
      assert.ok(riskScores.transmission >= 0 && riskScores.transmission <= 100);
      assert.ok(riskScores.emissions >= 0 && riskScores.emissions <= 100);
      assert.ok(riskScores.electrical >= 0 && riskScores.electrical <= 100);
      assert.ok(riskScores.overall >= 0 && riskScores.overall <= 100);
    });
  });
});
