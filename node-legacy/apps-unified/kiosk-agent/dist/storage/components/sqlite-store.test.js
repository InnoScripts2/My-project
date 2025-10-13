/**
 * Unit tests for sqlite-store.ts - Local SQLite storage
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { SqliteStore, createSqliteStore } from './sqlite-store.js';
describe('SqliteStore', () => {
    const dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    let store;
    after(() => {
        try {
            if (store)
                store.close();
            unlinkSync(dbPath);
        }
        catch (error) {
            // Ignore cleanup errors
        }
    });
    it('creates store with createSqliteStore factory', () => {
        store = createSqliteStore(dbPath);
        assert.ok(store instanceof SqliteStore);
    });
    it('creates and retrieves sessions', async () => {
        store = new SqliteStore(dbPath);
        const session = await store.createSession({
            id: 'session-1',
            type: 'obd',
            status: 'in_progress',
            data: { test: true },
        });
        assert.strictEqual(session.id, 'session-1');
        assert.strictEqual(session.type, 'obd');
        assert.ok(session.createdAt instanceof Date);
        const retrieved = await store.getSession('session-1');
        assert.ok(retrieved);
        assert.strictEqual(retrieved.id, 'session-1');
        assert.deepStrictEqual(retrieved.data, { test: true });
    });
    it('updates session status', async () => {
        store = new SqliteStore(dbPath);
        await store.createSession({
            id: 'session-2',
            type: 'thickness',
            status: 'in_progress',
            data: {},
        });
        await store.updateSession('session-2', {
            status: 'completed',
            completedAt: new Date(),
        });
        const updated = await store.getSession('session-2');
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.ok(updated.completedAt);
    });
    it('lists sessions with filters', async () => {
        store = new SqliteStore(dbPath);
        await store.createSession({
            id: 'session-3',
            type: 'obd',
            status: 'completed',
            data: {},
        });
        await store.createSession({
            id: 'session-4',
            type: 'thickness',
            status: 'in_progress',
            data: {},
        });
        const obdSessions = await store.listSessions({ type: 'obd' });
        assert.ok(obdSessions.some(s => s.id === 'session-3'));
        const completedSessions = await store.listSessions({ status: 'completed' });
        assert.ok(completedSessions.some(s => s.id === 'session-3'));
    });
    it('returns null for non-existent session', async () => {
        store = new SqliteStore(dbPath);
        const session = await store.getSession('non-existent');
        assert.strictEqual(session, null);
    });
    it('saves and retrieves selfcheck logs', async () => {
        store = new SqliteStore(dbPath);
        const logId = await store.saveSelfCheckLog({
            device: 'obd',
            result: { status: 'pass', steps: [] },
        });
        assert.ok(typeof logId === 'number');
        const logs = await store.getSelfCheckLogs('obd', 10);
        assert.ok(logs.length > 0);
        const log = logs.find(l => l.id === logId);
        assert.ok(log);
        assert.strictEqual(log.device, 'obd');
    });
    it('filters selfcheck logs by device', async () => {
        store = new SqliteStore(dbPath);
        await store.saveSelfCheckLog({ device: 'obd', result: {} });
        await store.saveSelfCheckLog({ device: 'thickness', result: {} });
        const obdLogs = await store.getSelfCheckLogs('obd');
        assert.ok(obdLogs.every(l => l.device === 'obd'));
        const thicknessLogs = await store.getSelfCheckLogs('thickness');
        assert.ok(thicknessLogs.every(l => l.device === 'thickness'));
    });
    it('limits selfcheck logs results', async () => {
        store = new SqliteStore(dbPath);
        for (let i = 0; i < 10; i++) {
            await store.saveSelfCheckLog({ device: 'obd', result: { index: i } });
        }
        const logs = await store.getSelfCheckLogs('obd', 5);
        assert.ok(logs.length <= 5);
    });
    it('saves and retrieves payment receipts', async () => {
        store = new SqliteStore(dbPath);
        await store.savePaymentReceipt({
            intentId: 'intent-1',
            sessionId: 'session-1',
            amount: 48000,
            status: 'pending',
        });
        const receipt = await store.getPaymentReceipt('intent-1');
        assert.ok(receipt);
        assert.strictEqual(receipt.intentId, 'intent-1');
        assert.strictEqual(receipt.amount, 48000);
        assert.strictEqual(receipt.status, 'pending');
    });
    it('updates payment receipt status', async () => {
        store = new SqliteStore(dbPath);
        await store.savePaymentReceipt({
            intentId: 'intent-2',
            sessionId: 'session-1',
            amount: 35000,
            status: 'pending',
        });
        await store.updatePaymentReceipt('intent-2', {
            status: 'confirmed',
            confirmedAt: new Date(),
        });
        const receipt = await store.getPaymentReceipt('intent-2');
        assert.ok(receipt);
        assert.strictEqual(receipt.status, 'confirmed');
        assert.ok(receipt.confirmedAt);
    });
    it('returns null for non-existent payment receipt', async () => {
        store = new SqliteStore(dbPath);
        const receipt = await store.getPaymentReceipt('non-existent');
        assert.strictEqual(receipt, null);
    });
    it('saves and retrieves config values', async () => {
        store = new SqliteStore(dbPath);
        await store.setConfig('test-key', { value: 'test-value', number: 42 });
        const config = await store.getConfig('test-key');
        assert.ok(config);
        assert.strictEqual(config.value, 'test-value');
        assert.strictEqual(config.number, 42);
    });
    it('updates existing config values', async () => {
        store = new SqliteStore(dbPath);
        await store.setConfig('update-key', { version: 1 });
        await store.setConfig('update-key', { version: 2 });
        const config = await store.getConfig('update-key');
        assert.ok(config);
        assert.strictEqual(config.version, 2);
    });
    it('returns null for non-existent config', async () => {
        store = new SqliteStore(dbPath);
        const config = await store.getConfig('non-existent');
        assert.strictEqual(config, null);
    });
    it('cleans up old sessions', async () => {
        store = new SqliteStore(dbPath);
        await store.createSession({
            id: 'old-session',
            type: 'obd',
            status: 'completed',
            data: {},
        });
        const deleted = await store.cleanupOldSessions(0);
        assert.ok(deleted >= 0);
    });
    it('cleans up old logs', async () => {
        store = new SqliteStore(dbPath);
        await store.saveSelfCheckLog({ device: 'obd', result: {} });
        const deleted = await store.cleanupOldLogs(0);
        assert.ok(deleted >= 0);
    });
    it('handles concurrent operations', async () => {
        store = new SqliteStore(dbPath);
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(store.createSession({
                id: `concurrent-${i}`,
                type: 'obd',
                status: 'in_progress',
                data: { index: i },
            }));
        }
        await Promise.all(promises);
        const sessions = await store.listSessions();
        const concurrentSessions = sessions.filter(s => s.id.startsWith('concurrent-'));
        assert.strictEqual(concurrentSessions.length, 10);
    });
    it('closes database connection', () => {
        store = new SqliteStore(dbPath);
        store.close();
    });
    describe('Enhanced Features', () => {
        it('should execute transaction successfully', async () => {
            store = new SqliteStore(dbPath);
            const result = await store.withTransaction(async (db) => {
                return 42;
            });
            assert.strictEqual(result, 42);
        });
        it('should rollback transaction on error', async () => {
            store = new SqliteStore(dbPath);
            try {
                await store.withTransaction(async (db) => {
                    throw new Error('Test error');
                });
                assert.fail('Should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.message, 'Test error');
            }
        });
        it('should return health check status', async () => {
            store = new SqliteStore(dbPath);
            const health = await store.healthCheck();
            assert.ok(health.status === 'pass' || health.status === 'warn' || health.status === 'fail');
            assert.ok(health.details.latencyMs >= 0);
            assert.strictEqual(health.details.integrityCheck, 'ok');
            assert.strictEqual(health.details.journalMode, 'wal');
        });
        it('should return database stats', () => {
            store = new SqliteStore(dbPath);
            const stats = store.getStats();
            assert.ok(stats.sizeBytes > 0);
            assert.ok(stats.pageCount > 0);
            assert.strictEqual(stats.journalMode, 'wal');
            assert.ok(stats.pageSize > 0);
            assert.ok(stats.walAutoCheckpoint > 0);
        });
    });
});
