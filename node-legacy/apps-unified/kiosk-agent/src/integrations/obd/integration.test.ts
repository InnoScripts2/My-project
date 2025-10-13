import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { obdSessionManager } from './session-manager.js';
import { RecommendationsEngine } from './recommendations.js';

describe('ObdSessionManager', () => {
  it('should create a session', () => {
    const sessionId = obdSessionManager.createSession({
      make: 'Toyota',
      model: 'Prius',
    });

    assert.ok(sessionId);
    assert.ok(typeof sessionId === 'string');
  });

  it('should update session data', () => {
    const sessionId = obdSessionManager.createSession({
      make: 'Lexus',
      model: 'RX350',
    });

    obdSessionManager.updateSession(sessionId, {
      dtc: [{ code: 'P0420', description: 'Catalyst System Efficiency Below Threshold', severity: 'warning' }],
      pids: [{ name: 'coolantTempC', value: 85, unit: '°C' }],
      vin: 'TEST1234567890123',
    });

    const session = obdSessionManager.getSession(sessionId);
    assert.ok(session);
    assert.strictEqual(session.dtcCodes.length, 1);
    assert.strictEqual(session.vin, 'TEST1234567890123');
  });

  it('should complete session', () => {
    const sessionId = obdSessionManager.createSession({
      make: 'Toyota',
      model: 'Camry',
    });

    const completed = obdSessionManager.completeSession(sessionId);
    assert.strictEqual(completed.status, 'completed');
    assert.ok(completed.completedAt);
  });

  it('should mark session as paid', () => {
    const sessionId = obdSessionManager.createSession({
      make: 'Toyota',
      model: 'Corolla',
    });
    obdSessionManager.completeSession(sessionId);
    obdSessionManager.markSessionPaid(sessionId);

    const session = obdSessionManager.getSession(sessionId);
    assert.strictEqual(session?.status, 'paid');
    assert.ok(session?.paidAt);
  });

  it('should delete session', () => {
    const sessionId = obdSessionManager.createSession({
      make: 'Toyota',
      model: 'RAV4',
    });

    obdSessionManager.deleteSession(sessionId);
    const session = obdSessionManager.getSession(sessionId);
    assert.strictEqual(session, null);
  });
});

describe('RecommendationsEngine', () => {
  it('should generate recommendations for powertrain DTC', () => {
    const sessionData = {
      sessionId: 'test-1',
      vehicleMake: 'Toyota',
      vehicleModel: 'Prius',
      dtcCodes: [
        { code: 'P0420', description: 'Catalyst System Efficiency', severity: 'warning' },
      ],
      pidsSnapshot: [],
      timestamp: new Date().toISOString(),
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.some(r => r.text.includes('двигателя')));
  });

  it('should generate recommendations for critical coolant temp', () => {
    const sessionData = {
      sessionId: 'test-2',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      dtcCodes: [],
      pidsSnapshot: [
        { name: 'coolantTempC', value: 105, unit: '°C' },
      ],
      timestamp: new Date().toISOString(),
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.some(r => r.severity === 'critical'));
    assert.ok(recommendations.some(r => r.text.includes('температура')));
  });

  it('should generate recommendations for low battery voltage', () => {
    const sessionData = {
      sessionId: 'test-3',
      vehicleMake: 'Lexus',
      vehicleModel: 'ES350',
      dtcCodes: [],
      pidsSnapshot: [
        { name: 'batteryVoltageV', value: 11.0, unit: 'V' },
      ],
      timestamp: new Date().toISOString(),
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.some(r => r.text.includes('батареи')));
  });

  it('should generate OK recommendation when no issues', () => {
    const sessionData = {
      sessionId: 'test-4',
      vehicleMake: 'Toyota',
      vehicleModel: 'Highlander',
      dtcCodes: [],
      pidsSnapshot: [
        { name: 'coolantTempC', value: 85, unit: '°C' },
        { name: 'batteryVoltageV', value: 13.5, unit: 'V' },
      ],
      timestamp: new Date().toISOString(),
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.some(r => r.severity === 'info'));
  });

  it('should generate multiple errors recommendation', () => {
    const sessionData = {
      sessionId: 'test-5',
      vehicleMake: 'Toyota',
      vehicleModel: 'Tundra',
      dtcCodes: [
        { code: 'P0420', description: 'Catalyst', severity: 'warning' },
        { code: 'P0300', description: 'Random Misfire', severity: 'warning' },
        { code: 'P0171', description: 'System Too Lean', severity: 'warning' },
      ],
      pidsSnapshot: [],
      timestamp: new Date().toISOString(),
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    assert.ok(recommendations.some(r => r.text.includes('Множественные')));
  });
});
