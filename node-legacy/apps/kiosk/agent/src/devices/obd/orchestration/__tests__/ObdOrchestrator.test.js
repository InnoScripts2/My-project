/**
 * ObdOrchestrator Unit Tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { ObdOrchestrator, OrchestratorState } from '../ObdOrchestrator.js';
import { ObdSessionError, ObdStateError } from '../errors.js';
import { SessionStatus } from '../Session.js';
class MockDriver extends EventEmitter {
    status = 'disconnected';
    shouldFail = false;
    async init(config) {
        if (this.shouldFail) {
            throw new Error('Mock init failed');
        }
        this.status = 'ready';
        setTimeout(() => this.emit('connected'), 10);
    }
    async readDtc() {
        if (this.shouldFail) {
            throw new Error('Mock readDtc failed');
        }
        return [
            { code: 'P0420', category: 'P', description: 'Catalyst System Efficiency Below Threshold', rawBytes: '0420' },
            { code: 'P0171', category: 'P', description: 'System Too Lean', rawBytes: '0171' },
        ];
    }
    async clearDtc() {
        if (this.shouldFail) {
            throw new Error('Mock clearDtc failed');
        }
        return true;
    }
    async readPid(pid) {
        if (this.shouldFail) {
            throw new Error('Mock readPid failed');
        }
        const values = {
            '0C': 1500,
            '0D': 60,
            '05': 85,
            '0F': 25,
            '11': 30,
        };
        return {
            pid,
            value: values[pid] || 0,
            unit: 'unit',
            rawBytes: '00',
            timestamp: Date.now(),
        };
    }
    getStatus() {
        return this.status;
    }
    async disconnect() {
        this.status = 'disconnected';
        setTimeout(() => this.emit('disconnected'), 10);
    }
    setShouldFail(fail) {
        this.shouldFail = fail;
    }
}
describe('ObdOrchestrator', () => {
    describe('connect', () => {
        it('should transition to CONNECTED state on successful connection', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            const status = orchestrator.getStatus();
            assert.strictEqual(status.currentStatus, OrchestratorState.CONNECTED);
        });
        it('should emit error on connection failure', async () => {
            const driver = new MockDriver();
            driver.setShouldFail(true);
            const orchestrator = new ObdOrchestrator(driver);
            let errorEmitted = false;
            orchestrator.on('error', () => {
                errorEmitted = true;
            });
            await assert.rejects(async () => orchestrator.connect(), (err) => err instanceof ObdSessionError && err.code === 'connection_failed');
        });
        it('should return immediately if already connected', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            await orchestrator.connect();
            const status = orchestrator.getStatus();
            assert.strictEqual(status.currentStatus, OrchestratorState.CONNECTED);
        });
    });
    describe('startScan', () => {
        it('should create session and start scanning', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            let sessionStarted = false;
            orchestrator.on('session-started', () => {
                sessionStarted = true;
            });
            const sessionId = await orchestrator.startScan();
            assert.ok(sessionId);
            assert.ok(sessionStarted);
            const status = orchestrator.getStatus();
            assert.strictEqual(status.currentStatus, OrchestratorState.SCANNING);
            assert.strictEqual(status.sessionId, sessionId);
        });
        it('should throw error if not connected', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await assert.rejects(async () => orchestrator.startScan(), (err) => err instanceof ObdStateError && err.code === 'invalid_state');
        });
        it('should complete scan and transition to RESULTS_READY', async (t) => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            return new Promise((resolve, reject) => {
                orchestrator.on('scan-complete', (sessionId) => {
                    try {
                        const status = orchestrator.getStatus();
                        assert.strictEqual(status.currentStatus, OrchestratorState.RESULTS_READY);
                        const session = orchestrator.getScanResults(sessionId);
                        assert.ok(session);
                        assert.strictEqual(session.status, SessionStatus.COMPLETED);
                        assert.ok(session.dtcList.length > 0);
                        resolve(undefined);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
                orchestrator.startScan().catch(reject);
            });
        });
        it('should track scan progress', async (t) => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            return new Promise((resolve, reject) => {
                const progressValues = [];
                orchestrator.on('scan-progress', (progress) => {
                    progressValues.push(progress);
                });
                orchestrator.on('scan-complete', () => {
                    try {
                        assert.ok(progressValues.length > 0);
                        assert.ok(progressValues.some(p => p > 0 && p < 100));
                        assert.ok(progressValues[progressValues.length - 1] === 100);
                        resolve(undefined);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
                orchestrator.startScan().catch(reject);
            });
        });
    });
    describe('getScanResults', () => {
        it('should return session data', async (t) => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            return new Promise((resolve, reject) => {
                orchestrator.on('scan-complete', (sessionId) => {
                    try {
                        const session = orchestrator.getScanResults(sessionId);
                        assert.ok(session);
                        assert.strictEqual(session.sessionId, sessionId);
                        assert.ok(Array.isArray(session.dtcList));
                        assert.ok(Array.isArray(session.pidSnapshots));
                        assert.ok(session.startTime);
                        assert.ok(session.endTime);
                        resolve(undefined);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
                orchestrator.startScan().catch(reject);
            });
        });
        it('should return undefined for non-existent session', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            const session = orchestrator.getScanResults('non-existent-id');
            assert.strictEqual(session, undefined);
        });
    });
    describe('clearDtc', () => {
        it('should require confirmation', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            await assert.rejects(async () => orchestrator.clearDtc(false), (err) => err instanceof ObdSessionError && err.code === 'confirmation_required');
        });
        it('should clear DTC codes when confirmed', async (t) => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            return new Promise((resolve, reject) => {
                orchestrator.on('scan-complete', async (sessionId) => {
                    try {
                        const success = await orchestrator.clearDtc(true);
                        assert.strictEqual(success, true);
                        const session = orchestrator.getScanResults(sessionId);
                        assert.ok(session);
                        assert.ok(session.dtcClearedAt);
                        assert.strictEqual(session.dtcClearResult, true);
                        const status = orchestrator.getStatus();
                        assert.strictEqual(status.currentStatus, OrchestratorState.IDLE);
                        resolve(undefined);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
                orchestrator.startScan().catch(reject);
            });
        });
    });
    describe('disconnect', () => {
        it('should disconnect and transition to DISCONNECTED state', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            await orchestrator.connect();
            let disconnected = false;
            orchestrator.on('disconnected', () => {
                disconnected = true;
            });
            await orchestrator.disconnect();
            assert.ok(disconnected);
            const status = orchestrator.getStatus();
            assert.strictEqual(status.currentStatus, OrchestratorState.DISCONNECTED);
        });
    });
    describe('getStatus', () => {
        it('should return current status', async () => {
            const driver = new MockDriver();
            const orchestrator = new ObdOrchestrator(driver);
            const initialStatus = orchestrator.getStatus();
            assert.strictEqual(initialStatus.currentStatus, OrchestratorState.DISCONNECTED);
            assert.ok(initialStatus.message);
            await orchestrator.connect();
            const connectedStatus = orchestrator.getStatus();
            assert.strictEqual(connectedStatus.currentStatus, OrchestratorState.CONNECTED);
        });
    });
});
