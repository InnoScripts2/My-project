/**
 * ObdConnectionPool.test.ts - Unit tests for connection pool
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ObdConnectionPool } from './ObdConnectionPool.js';

describe('ObdConnectionPool', () => {
  it('should acquire and release connections', async () => {
    const pool = new ObdConnectionPool(3);
    
    const driver1 = await pool.acquireConnection('vehicle1', 5000);
    assert.ok(driver1);
    
    const stats = pool.getPoolStats();
    assert.strictEqual(stats.active, 1);
    assert.strictEqual(stats.totalAcquired, 1);
    
    await pool.releaseConnection('vehicle1');
    
    const stats2 = pool.getPoolStats();
    assert.strictEqual(stats2.active, 0);
    assert.strictEqual(stats2.idle, 1);
    
    await pool.shutdown();
  });

  it('should reuse released connections', async () => {
    const pool = new ObdConnectionPool(3);
    
    const driver1 = await pool.acquireConnection('vehicle1', 5000);
    await pool.releaseConnection('vehicle1');
    
    const driver2 = await pool.acquireConnection('vehicle2', 5000);
    
    // Should reuse same driver instance
    assert.strictEqual(driver1, driver2);
    
    const stats = pool.getPoolStats();
    assert.strictEqual(stats.active, 1);
    assert.strictEqual(stats.idle, 0);
    
    await pool.shutdown();
  });

  it('should create multiple connections up to max', async () => {
    const pool = new ObdConnectionPool(3);
    
    const driver1 = await pool.acquireConnection('vehicle1', 5000);
    const driver2 = await pool.acquireConnection('vehicle2', 5000);
    const driver3 = await pool.acquireConnection('vehicle3', 5000);
    
    const stats = pool.getPoolStats();
    assert.strictEqual(stats.active, 3);
    assert.strictEqual(stats.idle, 0);
    
    await pool.shutdown();
  });

  it('should queue requests when pool exhausted', async () => {
    const pool = new ObdConnectionPool(2);
    
    await pool.acquireConnection('vehicle1', 5000);
    await pool.acquireConnection('vehicle2', 5000);
    
    // Pool is now full
    const stats1 = pool.getPoolStats();
    assert.strictEqual(stats1.active, 2);
    
    // This should queue
    const acquirePromise = pool.acquireConnection('vehicle3', 5000);
    
    // Give a moment for queue to register
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const stats2 = pool.getPoolStats();
    assert.strictEqual(stats2.waiting, 1);
    
    // Release one connection - should immediately acquire for queued request
    await pool.releaseConnection('vehicle1');
    
    const driver3 = await acquirePromise;
    assert.ok(driver3);
    
    const stats3 = pool.getPoolStats();
    assert.strictEqual(stats3.active, 2);
    assert.strictEqual(stats3.waiting, 0);
    
    await pool.shutdown();
  });

  it('should timeout queued requests', async () => {
    const pool = new ObdConnectionPool(1);
    
    await pool.acquireConnection('vehicle1', 5000);
    
    // This should timeout
    await assert.rejects(
      pool.acquireConnection('vehicle2', 100),
      { message: 'Connection acquisition timeout' }
    );
    
    await pool.shutdown();
  });

  it('should prevent duplicate connections for same vehicle', async () => {
    const pool = new ObdConnectionPool(3);
    
    await pool.acquireConnection('vehicle1', 5000);
    
    await assert.rejects(
      pool.acquireConnection('vehicle1', 5000),
      { message: 'Vehicle already has active connection' }
    );
    
    await pool.shutdown();
  });

  it('should track average wait time', async () => {
    const pool = new ObdConnectionPool(1);
    
    await pool.acquireConnection('vehicle1', 5000);
    
    const acquirePromise = pool.acquireConnection('vehicle2', 5000);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await pool.releaseConnection('vehicle1');
    
    await acquirePromise;
    
    const stats = pool.getPoolStats();
    assert.ok(stats.avgWaitTime > 0);
    assert.ok(stats.avgWaitTime >= 40); // Should be at least 50ms minus some overhead
    
    await pool.shutdown();
  });

  it('should handle shutdown gracefully', async () => {
    const pool = new ObdConnectionPool(2);
    
    await pool.acquireConnection('vehicle1', 5000);
    
    const queuedPromise = pool.acquireConnection('vehicle2', 5000);
    const queuedPromise2 = pool.acquireConnection('vehicle3', 5000);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await pool.shutdown();
    
    // Queued requests should be rejected
    await assert.rejects(queuedPromise, { message: 'Pool shutting down' });
    await assert.rejects(queuedPromise2, { message: 'Pool shutting down' });
    
    const stats = pool.getPoolStats();
    assert.strictEqual(stats.active, 0);
    assert.strictEqual(stats.idle, 0);
    assert.strictEqual(stats.waiting, 0);
  });

  it('should calculate stats correctly', async () => {
    const pool = new ObdConnectionPool(3);
    
    const d1 = await pool.acquireConnection('v1', 5000);
    const d2 = await pool.acquireConnection('v2', 5000);
    
    await pool.releaseConnection('v1');
    
    const d3 = await pool.acquireConnection('v3', 5000);
    
    const stats = pool.getPoolStats();
    assert.strictEqual(stats.active, 2);
    assert.strictEqual(stats.idle, 1);
    assert.strictEqual(stats.totalAcquired, 3);
    
    await pool.shutdown();
  });
});
