/**
 * GuacamoleProxy Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GuacamoleProxy } from '../../GuacamoleProxy.js';

describe('GuacamoleProxy', () => {
  it('should initialize with default URL', () => {
    const proxy = new GuacamoleProxy();
    assert.ok(proxy);
  });

  it('should handle connection creation errors', async () => {
    const proxy = new GuacamoleProxy();

    try {
      await proxy.createConnection('RDP', '192.168.1.100', 3389, {
        username: 'test',
        password: 'test',
      });
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Failed'));
    }
  });

  it('should handle SSH connection creation errors', async () => {
    const proxy = new GuacamoleProxy();

    try {
      await proxy.createConnection('SSH', '192.168.1.100', 22, {
        username: 'test',
        privateKey: 'test-key',
      });
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Failed'));
    }
  });

  it('should handle list connections errors', async () => {
    const proxy = new GuacamoleProxy();

    try {
      await proxy.listConnections();
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Failed'));
    }
  });

  it('should handle terminate connection errors', async () => {
    const proxy = new GuacamoleProxy();

    try {
      await proxy.terminateConnection('test-connection-id');
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Failed'));
    }
  });

  it('should handle get session logs errors', async () => {
    const proxy = new GuacamoleProxy();

    try {
      await proxy.getSessionLogs('test-connection-id');
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Failed'));
    }
  });
});
