/**
 * Integration test for core services
 * Tests the complete flow: session -> payment -> report
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoreServices } from './core-services.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CoreServices Integration', () => {
  let services: CoreServices;
  const testStoragePath = path.join('/tmp', 'test-core-services');
  const testDbPath = path.join(testStoragePath, 'core.sqlite');

  before(async () => {
    // Clean up test directory
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
    fs.mkdirSync(testStoragePath, { recursive: true });

    // Initialize database schema
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(testDbPath);
    const migrationsPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
    if (fs.existsSync(migrationsPath)) {
      const schema = fs.readFileSync(migrationsPath, 'utf-8');
      db.exec(schema);
    }
    db.close();

    // Initialize services
    try {
      services = new CoreServices({
        environment: 'DEV',
        storagePath: testStoragePath,
        reportsPath: path.join(testStoragePath, 'reports'),
        emailConfig: {
          provider: 'dev',
          from: 'test@example.com',
        },
        smsConfig: {
          provider: 'dev',
          from: '+79000000000',
        },
      });
    } catch (error) {
      console.error('[CoreServices Integration] setup failed', error);
      throw error;
    }
  });

  after(() => {
    services.close();
    
    // Clean up test files
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  it('should create a complete flow: session -> payment -> report', async () => {
    // 1. Create a session
    const session = await services.sessionManager.createSession({
      type: 'diagnostics',
      contact: {
        email: 'test@example.com',
        phone: '+79001234567',
      },
      metadata: {
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
      },
    });

    assert.ok(session.id);
    assert.strictEqual(session.type, 'diagnostics');
    assert.strictEqual(session.status, 'active');

    // 2. Create a payment for the session
    const payment = await services.paymentService.createIntent({
      amount: 48000,
      currency: 'RUB',
      sessionId: session.id,
      metadata: {
        service: 'diagnostics',
      },
    });

    assert.ok(payment.intentId);
    assert.strictEqual(payment.amount, 48000);
    assert.strictEqual(payment.status, 'pending');

    // 3. Wait for auto-confirm (DEV mode)
    await new Promise(resolve => setTimeout(resolve, 2500));

    const paymentStatus = await services.paymentService.getStatus(payment.intentId);
    assert.strictEqual(paymentStatus, 'confirmed');

    // 4. Generate and deliver report
    const reportResult = await services.reportService.generateAndDeliverDiagnosticsReport(
      {
        sessionId: session.id,
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        dtcCodes: [
          {
            code: 'P0420',
            description: 'Catalyst System Efficiency Below Threshold',
            severity: 'medium',
          },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        email: 'test@example.com',
      }
    );

    assert.ok(reportResult.reportId);
    assert.ok(reportResult.filePath);
    assert.ok(fs.existsSync(reportResult.filePath));
    assert.ok(reportResult.delivery?.success);

    // 5. Complete the session
    const completedSession = await services.sessionManager.completeSession(
      session.id,
      { reportId: reportResult.reportId }
    );

    assert.ok(completedSession);
    assert.strictEqual(completedSession.status, 'completed');
    assert.ok(completedSession.completedAt);
    assert.strictEqual(completedSession.metadata.reportId, reportResult.reportId);

    // 6. Verify metrics were recorded
    const metrics = await services.metricsService.getMetrics();
    assert.ok(metrics.includes('sessions_created_total'));
    assert.ok(metrics.includes('payments_intents_total'));
    assert.ok(metrics.includes('reports_generated_total'));
  });

  it('should handle session expiry', async () => {
    const session = await services.sessionManager.createSession({
      type: 'thickness',
      contact: { email: 'test@example.com' },
      ttlMs: 100, // Very short TTL for testing
    });

    assert.strictEqual(session.status, 'active');

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 200));

    const expiredSession = await services.sessionManager.getSession(session.id);
    assert.ok(expiredSession);
    assert.strictEqual(expiredSession.status, 'expired');
  });

  it('should allow manual payment confirmation in DEV', async () => {
    const payment = await services.paymentService.createIntent({
      amount: 35000,
      currency: 'RUB',
      metadata: { test: true },
    });

    assert.strictEqual(payment.status, 'pending');

    // Manually confirm
    const confirmed = await services.paymentService.confirmDev(payment.intentId);
    assert.strictEqual(confirmed, true);

    const status = await services.paymentService.getStatus(payment.intentId);
    assert.strictEqual(status, 'confirmed');
  });

  it('should create router with all endpoints', () => {
    const router = services.createRouter();
    assert.ok(router);
    
    // Router should have routes mounted
    const stack = (router as any).stack;
    assert.ok(Array.isArray(stack));
    assert.ok(stack.length > 0);
  });
});
