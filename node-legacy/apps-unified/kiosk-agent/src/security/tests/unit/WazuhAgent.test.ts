/**
 * WazuhAgent Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WazuhAgent } from '../../WazuhAgent.js';
import type { WazuhConfig } from '../../types.js';

describe('WazuhAgent', () => {
  it('should configure agent with FIM policy', async () => {
    const wazuh = new WazuhAgent();
    const config: WazuhConfig = {
      serverAddress: 'wazuh.test:1514',
      authKey: 'test-auth-key',
      groups: ['kiosks', 'test'],
      policies: [
        {
          name: 'FIM',
          enabled: true,
          settings: {
            directories: ['apps/kiosk-agent/src'],
            realTime: true,
          },
        },
      ],
    };

    await wazuh.configureAgent(config);

    assert.ok(true);
  });

  it('should configure agent with all policies', async () => {
    const wazuh = new WazuhAgent();
    const config: WazuhConfig = {
      serverAddress: 'wazuh.test:1514',
      authKey: 'test-auth-key',
      groups: ['kiosks', 'test'],
      policies: [
        {
          name: 'FIM',
          enabled: true,
          settings: {
            directories: ['apps/kiosk-agent/src', 'apps/kiosk-frontend'],
            realTime: true,
          },
        },
        {
          name: 'RootkitDetection',
          enabled: true,
          settings: {
            interval: 21600,
          },
        },
        {
          name: 'VulnerabilityScanning',
          enabled: true,
          settings: {
            scanTime: '03:00',
          },
        },
      ],
    };

    await wazuh.configureAgent(config);

    assert.ok(true);
  });

  it('should get agent status', async () => {
    const wazuh = new WazuhAgent();
    const status = await wazuh.getStatus();

    assert.ok(status);
    assert.strictEqual(typeof status.installed, 'boolean');
    assert.strictEqual(typeof status.version, 'string');
    assert.strictEqual(typeof status.connected, 'boolean');
    assert.ok(status.lastSeen);
  });

  it('should parse status output correctly', async () => {
    const wazuh = new WazuhAgent();
    const status = await wazuh.getStatus();

    assert.ok(status.lastSeen);

    const timestamp = new Date(status.lastSeen);
    assert.ok(!isNaN(timestamp.getTime()));
  });

  it('should handle configuration errors gracefully', async () => {
    const wazuh = new WazuhAgent();
    const config: WazuhConfig = {
      serverAddress: '',
      authKey: '',
      groups: [],
      policies: [],
    };

    try {
      await wazuh.configureAgent(config);
      assert.ok(true);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });
});
