/**
 * Payment service tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PaymentService } from './payments.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.join('/tmp', 'test-payments.sqlite');

function seedSession(sessionId: string, type: 'thickness' | 'diagnostics' = 'diagnostics'): void {
  const db = new Database(testDbPath);
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, type, status, contact_email, contact_phone, metadata,
      created_at, updated_at, completed_at, expires_at
    ) VALUES (?, ?, 'active', NULL, NULL, '{}', ?, ?, NULL, ?)
  `).run(sessionId, type, now, now, now + 3600_000);
  db.close();
}

describe('PaymentService', () => {
  let service: PaymentService;

  before(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize database schema
    const db = new Database(testDbPath);
    const migrationsPath = path.join(__dirname, '../../../migrations/001_initial_schema.sql');
    if (fs.existsSync(migrationsPath)) {
      const schema = fs.readFileSync(migrationsPath, 'utf-8');
      db.exec(schema);
    }
    db.close();

    service = new PaymentService({
      environment: 'DEV',
      provider: 'dev',
      devConfig: {
        autoConfirmDelayMs: 100, // Fast for testing
        manualMode: false,
      },
      dbPath: testDbPath,
    });
  });

  after(() => {
    service.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create payment intent', async () => {
    seedSession('test-session-1');
    const intent = await service.createIntent({
      amount: 48000, // 480 RUB in kopecks
      currency: 'RUB',
      sessionId: 'test-session-1',
      metadata: { service: 'diagnostics' },
    });

    assert.ok(intent.intentId);
    assert.strictEqual(intent.amount, 48000);
    assert.strictEqual(intent.currency, 'RUB');
    assert.strictEqual(intent.status, 'pending');
    assert.ok(intent.qrCodeData);
  });

  it('should get payment status', async () => {
    seedSession('test-session-2');
    const intent = await service.createIntent({
      amount: 35000,
      currency: 'RUB',
      sessionId: 'test-session-2',
    });

    const status = await service.getStatus(intent.intentId);
    assert.ok(status);
    assert.strictEqual(typeof status, 'string');
  });

  it('should get payment intent', async () => {
    seedSession('test-session-3');
    const created = await service.createIntent({
      amount: 40000,
      currency: 'RUB',
      sessionId: 'test-session-3',
    });

    const retrieved = await service.getIntent(created.intentId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.intentId, created.intentId);
    assert.strictEqual(retrieved.amount, 40000);
  });

  it('should confirm payment in DEV mode', async () => {
    seedSession('test-session-4');
    const intent = await service.createIntent({
      amount: 48000,
      currency: 'RUB',
      sessionId: 'test-session-4',
    });

    // Wait a bit for auto-confirm, then manually confirm
    await new Promise(resolve => setTimeout(resolve, 50));
    const confirmed = await service.confirmDev(intent.intentId);
    assert.strictEqual(confirmed, true);

    const status = await service.getStatus(intent.intentId);
    assert.strictEqual(status, 'confirmed');
  });

  it('should cancel payment', async () => {
    seedSession('test-session-5');
    const intent = await service.createIntent({
      amount: 48000,
      currency: 'RUB',
      sessionId: 'test-session-5',
    });

    const canceled = await service.cancel(intent.intentId);
    assert.strictEqual(canceled, true);

    const status = await service.getStatus(intent.intentId);
    assert.strictEqual(status, 'expired');
  });

  it('should auto-confirm payment after delay', async () => {
    seedSession('test-session-6');
    const intent = await service.createIntent({
      amount: 35000,
      currency: 'RUB',
      sessionId: 'test-session-6',
    });

    // Wait for auto-confirm
    await new Promise(resolve => setTimeout(resolve, 200));

    const status = await service.getStatus(intent.intentId);
    assert.strictEqual(status, 'confirmed');
  });
});
