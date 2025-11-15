/**
 * Session manager tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionStore } from './store.js';
import { SessionManager } from './manager.js';

describe('SessionManager', () => {
  let store: SessionStore;
  let manager: SessionManager;
  const testDbPath = path.join('/tmp', 'test-sessions.sqlite');

  before(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    store = new SessionStore(testDbPath);
    manager = new SessionManager(store, {
      defaultTtlMs: 5000, // 5 seconds for testing
      autoResetOnTimeout: true,
    });
  });

  after(() => {
    manager.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create a new session', async () => {
    const session = await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'test@example.com' },
      metadata: { test: true },
    });

    assert.ok(session.id);
    assert.strictEqual(session.type, 'diagnostics');
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.contact.email, 'test@example.com');
  });

  it('should get existing session', async () => {
    const created = await manager.createSession({
      type: 'thickness',
      contact: { phone: '+79001234567' },
    });

    const retrieved = await manager.getSession(created.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, created.id);
    assert.strictEqual(retrieved.type, 'thickness');
  });

  it('should update session', async () => {
    const session = await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'original@example.com' },
    });

    const updated = await manager.updateSession(session.id, {
      contact: { email: 'updated@example.com' },
      metadata: { updated: true },
    });

    assert.ok(updated);
    assert.strictEqual(updated.contact.email, 'updated@example.com');
    assert.strictEqual(updated.metadata.updated, true);
  });

  it('should complete session', async () => {
    const session = await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'test@example.com' },
    });

    const completed = await manager.completeSession(session.id, { result: 'success' });
    assert.ok(completed);
    assert.strictEqual(completed.status, 'completed');
    assert.ok(completed.completedAt);
    assert.strictEqual(completed.metadata.result, 'success');
  });

  it('should expire session', async () => {
    const session = await manager.createSession({
      type: 'thickness',
      contact: { phone: '+79001234567' },
    });

    const expired = await manager.expireSession(session.id);
    assert.ok(expired);
    assert.strictEqual(expired.status, 'expired');
  });

  it('should fail session', async () => {
    const session = await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'test@example.com' },
    });

    const failed = await manager.failSession(session.id, 'Connection timeout');
    assert.ok(failed);
    assert.strictEqual(failed.status, 'failed');
    assert.strictEqual(failed.metadata.failureReason, 'Connection timeout');
  });

  it('should list sessions with filters', async () => {
    await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'test1@example.com' },
    });

    await manager.createSession({
      type: 'thickness',
      contact: { email: 'test2@example.com' },
    });

    const diagnosticsSessions = manager.listSessions({ type: 'diagnostics' });
    assert.ok(diagnosticsSessions.length >= 1);
    assert.ok(diagnosticsSessions.every(s => s.type === 'diagnostics'));

    const activeSessions = manager.listSessions({ status: 'active' });
    assert.ok(activeSessions.length >= 0);
    assert.ok(activeSessions.every(s => s.status === 'active'));
  });

  it('should delete session', async () => {
    const session = await manager.createSession({
      type: 'diagnostics',
      contact: { email: 'test@example.com' },
    });

    const deleted = await manager.deleteSession(session.id);
    assert.strictEqual(deleted, true);

    const retrieved = await manager.getSession(session.id);
    assert.strictEqual(retrieved, null);
  });
});
