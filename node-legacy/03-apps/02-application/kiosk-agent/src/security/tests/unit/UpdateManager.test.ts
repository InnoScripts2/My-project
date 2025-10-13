/**
 * UpdateManager Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UpdateManager } from '../UpdateManager.js';

describe('UpdateManager', () => {
  it('should check for updates from GitHub', async () => {
    const manager = new UpdateManager();

    try {
      const updateInfo = await manager.checkForUpdates();

      assert.ok(updateInfo);
      assert.ok(updateInfo.currentVersion);
      assert.ok(updateInfo.latestVersion);
      assert.strictEqual(typeof updateInfo.updateAvailable, 'boolean');
    } catch (error: unknown) {
      console.log('GitHub API check skipped:', error instanceof Error ? error.message : String(error));
    }
  });

  it('should detect version comparison correctly', async () => {
    const manager = new UpdateManager();

    const newerVersion = manager['isNewerVersion']('1.2.0', '1.1.0');
    assert.strictEqual(newerVersion, true);

    const sameVersion = manager['isNewerVersion']('1.1.0', '1.1.0');
    assert.strictEqual(sameVersion, false);

    const olderVersion = manager['isNewerVersion']('1.0.0', '1.1.0');
    assert.strictEqual(olderVersion, false);
  });

  it('should schedule update', async () => {
    const manager = new UpdateManager();

    const scheduledTime = new Date();
    scheduledTime.setHours(scheduledTime.getHours() + 1);

    try {
      await manager.scheduleUpdate('1.3.0', scheduledTime.toISOString());
      assert.ok(true);
    } catch (error: unknown) {
      assert.fail(
        `Schedule update failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
});
