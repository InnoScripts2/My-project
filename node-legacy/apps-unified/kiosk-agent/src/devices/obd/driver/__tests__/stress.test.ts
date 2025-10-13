/**
 * Stress test for Elm327Driver
 * Tests stability under continuous load and simulates real-world usage patterns
 * Duration: 10 minutes with periodic PID polling
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Elm327Driver } from '../Elm327Driver.js';
import { ObdStatus } from '../DeviceObd.js';

const TEST_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_MS = 500; // Poll every 500ms
const CONNECTION_TEST_INTERVAL_MS = 60 * 1000; // Test connection stability every minute

describe('Elm327Driver Stress Tests', () => {
  let driver: Elm327Driver;

  before(() => {
    process.env.AGENT_ENV = 'DEV';
  });

  after(async () => {
    if (driver) {
      await driver.disconnect();
    }
  });

  it('should handle continuous PID polling for 10 minutes', async () => {
    driver = new Elm327Driver();
    await driver.init({
      transport: 'serial',
      port: 'MOCK',
      timeout: 2000,
    });

    const startTime = Date.now();
    const pidsToTest = ['0C', '0D']; // RPM and Speed
    let successCount = 0;
    let errorCount = 0;
    let totalRequests = 0;

    const errors: Error[] = [];

    while (Date.now() - startTime < TEST_DURATION_MS) {
      for (const pid of pidsToTest) {
        try {
          totalRequests++;
          await driver.readPid(pid);
          successCount++;
        } catch (error) {
          errorCount++;
          if (errors.length < 10) {
            errors.push(error as Error);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const metrics = driver.getMetrics();
    const duration = Date.now() - startTime;

    console.log('Stress Test Results:');
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful: ${successCount} (${((successCount / totalRequests) * 100).toFixed(2)}%)`);
    console.log(`Failed: ${errorCount} (${((errorCount / totalRequests) * 100).toFixed(2)}%)`);
    console.log(`Driver Metrics:`, metrics);

    if (errors.length > 0) {
      console.log('Sample Errors:', errors.slice(0, 3));
    }

    assert.ok(successCount > 0, 'Should have at least some successful requests');
    assert.ok(errorCount / totalRequests < 0.1, 'Error rate should be less than 10%');
    assert.equal(driver.getStatus(), ObdStatus.IDLE);
  });

  it('should maintain stable connection during stress', async () => {
    driver = new Elm327Driver();
    await driver.init({
      transport: 'serial',
      port: 'MOCK',
      timeout: 2000,
    });

    const startTime = Date.now();
    let connectionChecks = 0;
    let connectionStable = 0;

    while (Date.now() - startTime < TEST_DURATION_MS) {
      try {
        await driver.readPid('0C');
      } catch (error) {
        // Continue even if some requests fail
      }

      if ((Date.now() - startTime) % CONNECTION_TEST_INTERVAL_MS < POLL_INTERVAL_MS) {
        connectionChecks++;
        const status = driver.getStatus();
        if (status === ObdStatus.READY || status === ObdStatus.IDLE) {
          connectionStable++;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    console.log('Connection Stability:');
    console.log(`Checks: ${connectionChecks}`);
    console.log(`Stable: ${connectionStable} (${((connectionStable / connectionChecks) * 100).toFixed(2)}%)`);

    assert.ok(connectionStable / connectionChecks > 0.9, 'Connection should be stable >90% of the time');
  });

  it('should not leak memory during extended operation', async () => {
    driver = new Elm327Driver();
    await driver.init({
      transport: 'serial',
      port: 'MOCK',
      timeout: 2000,
    });

    const initialMemory = process.memoryUsage();
    const startTime = Date.now();
    let iterations = 0;

    while (Date.now() - startTime < TEST_DURATION_MS) {
      try {
        await driver.readPid('0C');
        await driver.readPid('0D');
        iterations++;
      } catch (error) {
        // Continue
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      if (iterations % 100 === 0 && global.gc) {
        global.gc();
      }
    }

    const finalMemory = process.memoryUsage();
    const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const heapGrowthMB = heapGrowth / 1024 / 1024;

    console.log('Memory Usage:');
    console.log(`Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Growth: ${heapGrowthMB.toFixed(2)} MB`);
    console.log(`Iterations: ${iterations}`);

    assert.ok(heapGrowthMB < 50, 'Heap growth should be less than 50MB over 10 minutes');
  });

  it('should handle rapid connect/disconnect cycles', async () => {
    const cycles = 10;
    let successfulCycles = 0;

    for (let i = 0; i < cycles; i++) {
      try {
        driver = new Elm327Driver();
        await driver.init({
          transport: 'serial',
          port: 'MOCK',
          timeout: 1000,
        });

        await driver.readDtc();
        await driver.disconnect();
        successfulCycles++;
      } catch (error) {
        console.error(`Cycle ${i} failed:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`Connect/Disconnect Cycles: ${successfulCycles}/${cycles}`);
    assert.ok(successfulCycles / cycles > 0.9, 'Should successfully complete >90% of cycles');
  });

  it('should handle mixed operations under load', async () => {
    driver = new Elm327Driver();
    await driver.init({
      transport: 'serial',
      port: 'MOCK',
      timeout: 2000,
    });

    const startTime = Date.now();
    const operations = {
      readDtc: 0,
      readPid: 0,
      clearDtc: 0,
      errors: 0,
    };

    while (Date.now() - startTime < TEST_DURATION_MS) {
      const operation = Math.random();

      try {
        if (operation < 0.7) {
          await driver.readPid(Math.random() < 0.5 ? '0C' : '0D');
          operations.readPid++;
        } else if (operation < 0.95) {
          await driver.readDtc();
          operations.readDtc++;
        } else {
          await driver.clearDtc();
          operations.clearDtc++;
        }
      } catch (error) {
        operations.errors++;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const total = operations.readDtc + operations.readPid + operations.clearDtc;
    console.log('Mixed Operations:');
    console.log(`Total: ${total}`);
    console.log(`Read DTC: ${operations.readDtc}`);
    console.log(`Read PID: ${operations.readPid}`);
    console.log(`Clear DTC: ${operations.clearDtc}`);
    console.log(`Errors: ${operations.errors} (${((operations.errors / total) * 100).toFixed(2)}%)`);

    assert.ok(total > 0, 'Should complete operations');
    assert.ok(operations.errors / total < 0.1, 'Error rate should be less than 10%');
  });
});
