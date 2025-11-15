/**
 * MeshCentralAgent Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MeshCentralAgent } from '../../MeshCentralAgent.js';

describe('MeshCentralAgent', () => {
  it('should initialize with default configuration', () => {
    const agent = new MeshCentralAgent();
    assert.ok(agent);
  });

  it('should check agent installation status', async () => {
    const agent = new MeshCentralAgent();
    const result = await agent.installAgent('https://mesh.test', 'test-mesh-id');

    assert.ok(result);
    assert.strictEqual(typeof result.success, 'boolean');

    if (!result.success) {
      assert.ok(result.error);
    }
  });

  it('should get agent status', async () => {
    const agent = new MeshCentralAgent();
    const status = await agent.getAgentStatus();

    assert.ok(status);
    assert.strictEqual(typeof status.installed, 'boolean');
    assert.strictEqual(typeof status.version, 'string');
    assert.strictEqual(typeof status.connected, 'boolean');
    assert.ok(status.lastSeen);

    const timestamp = new Date(status.lastSeen);
    assert.ok(!isNaN(timestamp.getTime()));
  });

  it('should execute command and return result', async () => {
    const agent = new MeshCentralAgent();
    const result = await agent.executeCommand('echo', ['test']);

    assert.ok(result);
    assert.strictEqual(typeof result.success, 'boolean');

    if (result.success) {
      assert.ok(result.stdout !== undefined);
    } else {
      assert.ok(result.error || result.stderr);
    }
  });

  it('should handle command execution errors', async () => {
    const agent = new MeshCentralAgent();
    const result = await agent.executeCommand('nonexistent-command-xyz', ['arg1']);

    assert.ok(result);
    assert.strictEqual(result.success, false);
    assert.ok(result.error || result.exitCode !== 0);
  });

  it('should handle file upload with error handling', async () => {
    const agent = new MeshCentralAgent();
    const result = await agent.uploadFile('/nonexistent/file.txt', '/tmp/test.txt');

    assert.ok(result);
    assert.strictEqual(typeof result.success, 'boolean');

    if (!result.success) {
      assert.ok(result.error);
    }
  });

  it('should handle file download with error handling', async () => {
    const agent = new MeshCentralAgent();
    const result = await agent.downloadFile('/nonexistent/remote.txt', '/tmp/local.txt');

    assert.ok(result);
    assert.strictEqual(typeof result.success, 'boolean');

    if (!result.success) {
      assert.ok(result.error);
    }
  });
});
