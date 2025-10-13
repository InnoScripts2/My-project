/**
 * FirezoneClient Unit Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FirezoneClient } from '../FirezoneClient.js';

const TEST_CONFIG_DIR = '/tmp/firezone-test';

describe('FirezoneClient', () => {
  before(async () => {
    await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });
    process.env.FIREZONE_CONFIG_PATH = path.join(TEST_CONFIG_DIR, 'firezone.json');
  });

  after(async () => {
    await fs.rm(TEST_CONFIG_DIR, { recursive: true, force: true });
  });

  it('should register resource', async () => {
    const client = new FirezoneClient();

    const result = await client.registerResource(
      'test-resource-id',
      'Test Kiosk',
      ['test', 'dev']
    );

    assert.ok(result.resourceId);
    assert.ok(result.deviceToken);
    assert.ok(result.gatewayAddress);
  });

  it('should update access policy', async () => {
    const client = new FirezoneClient();

    await client.registerResource('test-resource-id', 'Test Kiosk', ['test']);

    await client.updateAccessPolicy('test-resource-id', {
      allowedRoles: ['operator', 'admin'],
      mfaRequired: true,
      sessionTimeout: 60,
    });

    const configData = await fs.readFile(process.env.FIREZONE_CONFIG_PATH!, 'utf-8');
    const config = JSON.parse(configData);

    assert.strictEqual(config.accessPolicy.mfaRequired, true);
    assert.strictEqual(config.accessPolicy.sessionTimeout, 60);
  });

  it('should get connection status', async () => {
    const client = new FirezoneClient();

    await client.registerResource('test-resource-id', 'Test Kiosk', ['test']);

    const status = await client.getConnectionStatus();

    assert.ok(status);
    assert.strictEqual(typeof status.connected, 'boolean');
  });

  it('should rotate keys', async () => {
    const client = new FirezoneClient();

    await client.registerResource('test-resource-id', 'Test Kiosk', ['test']);

    const configData1 = await fs.readFile(process.env.FIREZONE_CONFIG_PATH!, 'utf-8');
    const config1 = JSON.parse(configData1);
    const oldToken = config1.deviceToken;

    await client.rotateKeys();

    const configData2 = await fs.readFile(process.env.FIREZONE_CONFIG_PATH!, 'utf-8');
    const config2 = JSON.parse(configData2);
    const newToken = config2.deviceToken;

    assert.notStrictEqual(oldToken, newToken);
  });
});
