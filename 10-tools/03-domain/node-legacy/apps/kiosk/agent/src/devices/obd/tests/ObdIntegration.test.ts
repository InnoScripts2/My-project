import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ObdManager } from '../ObdManager';
import { MockTransport } from '../transport/Transport';

describe('OBD Integration Tests', () => {
  let obdManager: ObdManager;

  beforeEach(() => {
    obdManager = new ObdManager({
      mode: 'dev',
      connectionTimeout: 5000,
      maxReconnectAttempts: 1
    });
  });

  afterEach(async () => {
    if (obdManager.isConnected()) {
      await obdManager.disconnect();
    }
  });

  describe('Device Discovery', () => {
    it('should discover mock device in dev mode', async () => {
      const devices = await obdManager.getAvailableDevices();

      assert.ok(devices.length > 0, 'Should find at least one device');

      const mockDevice = devices.find(d => d.transport === 'mock');
      assert.ok(mockDevice, 'Should find mock device in dev mode');
      assert.strictEqual(mockDevice.available, true, 'Mock device should be available');
      assert.strictEqual(mockDevice.port, 'mock', 'Mock device port should be "mock"');
    });
  });

  describe('Connection Management', () => {
    it('should connect to mock device', async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');

      assert.ok(mockDevice, 'Mock device should be available');

      let connected = false;
      obdManager.once('connected', () => {
        connected = true;
      });

      await obdManager.connect(mockDevice);

      assert.ok(connected, 'Should emit connected event');
      assert.strictEqual(obdManager.isConnected(), true, 'Should be connected');
      assert.strictEqual(obdManager.getStatus().toString(), 'ready', 'Status should be ready');
    });

    it('should disconnect gracefully', async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');

      await obdManager.connect(mockDevice!);
      assert.ok(obdManager.isConnected(), 'Should be connected');

      let disconnected = false;
      obdManager.once('disconnected', () => {
        disconnected = true;
      });

      await obdManager.disconnect();

      assert.ok(disconnected, 'Should emit disconnected event');
      assert.strictEqual(obdManager.isConnected(), false, 'Should be disconnected');
    });
  });

  describe('PID Operations', () => {
    beforeEach(async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');
      await obdManager.connect(mockDevice!);
    });

    it('should read RPM PID successfully', async () => {
      const response = await obdManager.readPid('0C');

      assert.ok(response, 'Should return response');
      assert.strictEqual(typeof response.value, 'number', 'Value should be a number');
      assert.ok(typeof response.value === 'number' && response.value >= 0, 'RPM should be non-negative number');
      assert.strictEqual(response.pid, '0C', 'PID should match request');
      assert.ok(response.timestamp > 0, 'Should have timestamp');
    });

    it('should read vehicle speed PID successfully', async () => {
      const response = await obdManager.readPid('0D');

      assert.ok(response, 'Should return response');
      assert.strictEqual(typeof response.value, 'number', 'Value should be a number');
      assert.ok(typeof response.value === 'number' && response.value >= 0, 'Speed should be non-negative number');
      assert.strictEqual(response.pid, '0D', 'PID should match request');
    });

    it('should read engine temperature PID successfully', async () => {
      const response = await obdManager.readPid('05');

      assert.ok(response, 'Should return response');
      assert.strictEqual(typeof response.value, 'number', 'Value should be a number');
      assert.strictEqual(response.pid, '05', 'PID should match request');
      assert.strictEqual(response.unit, '°C', 'Unit should be °C');
    });

    it('should handle unknown PID gracefully', async () => {
      try {
        await obdManager.readPid('FF');
        assert.fail('Should throw error for unknown PID');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw an Error');
        assert.ok(error.message.includes('Unknown PID'), 'Error should mention unknown PID');
      }
    });
  });

  describe('DTC Operations', () => {
    beforeEach(async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');
      await obdManager.connect(mockDevice!);
    });

    it('should read DTC codes successfully', async () => {
      const dtcEntries = await obdManager.readDtc();

      assert.ok(Array.isArray(dtcEntries), 'Should return array');

      if (dtcEntries.length > 0) {
        const firstDtc = dtcEntries[0];
        assert.ok(firstDtc.code, 'DTC should have code');
        assert.ok(['P', 'C', 'B', 'U'].includes(firstDtc.category), 'DTC should have valid category');
        assert.ok(firstDtc.rawBytes, 'DTC should have raw bytes');
      }
    });

    it('should clear DTC codes successfully', async () => {
      const result = await obdManager.clearDtc();

      assert.strictEqual(typeof result, 'boolean', 'Should return boolean');
      // В мок-режиме операция должна успешно выполниться
      assert.strictEqual(result, true, 'Clear DTC should succeed');
    });
  });

  describe('Supported PIDs', () => {
    beforeEach(async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');
      await obdManager.connect(mockDevice!);
    });

    it('should get supported PIDs list', async () => {
      const supportedPids = await obdManager.getSupportedPids();

      assert.ok(Array.isArray(supportedPids), 'Should return array');
      assert.ok(supportedPids.length > 0, 'Should have some supported PIDs');

      // Проверяем что все PIDs в hex формате
      for (const pid of supportedPids) {
        assert.ok(/^[0-9A-F]{2}$/.test(pid), `PID ${pid} should be 2-digit hex`);
      }
    });
  });

  describe('Connection Info and Stats', () => {
    it('should provide connection info when disconnected', () => {
      const info = obdManager.getConnectionInfo();
      assert.strictEqual(info, 'Not connected', 'Should indicate not connected');
    });

    it('should provide connection info when connected', async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');
      await obdManager.connect(mockDevice!);

      const info = obdManager.getConnectionInfo();
      assert.ok(info.includes('Mock'), 'Should include mock transport info');
    });

    it('should provide driver stats when connected', async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');
      await obdManager.connect(mockDevice!);

      const stats = obdManager.getDriverStats();
      assert.ok(stats, 'Should return stats object');
      assert.ok('status' in stats, 'Stats should include status');
      assert.ok('connectionInfo' in stats, 'Stats should include connection info');
    });

    it('should return null stats when disconnected', () => {
      const stats = obdManager.getDriverStats();
      assert.strictEqual(stats, null, 'Should return null when disconnected');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Попытаемся подключиться к несуществующему устройству
      const fakeDevice = {
        transport: 'serial' as const,
        port: 'COM999',
        name: 'Fake Device',
        available: false
      };

      let errorEmitted = false;
      obdManager.once('error', () => {
        errorEmitted = true;
      });

      try {
        await obdManager.connect(fakeDevice);
        assert.fail('Should throw error for fake device');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw Error');
        assert.ok(errorEmitted, 'Should emit error event');
      }
    });

    it('should prevent concurrent connections', async () => {
      const devices = await obdManager.getAvailableDevices();
      const mockDevice = devices.find(d => d.transport === 'mock');

      // Запускаем первое подключение
      const connectPromise1 = obdManager.connect(mockDevice!);

      // Пытаемся запустить второе подключение
      try {
        await obdManager.connect(mockDevice!);
        assert.fail('Should throw error for concurrent connection');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw Error');
        assert.ok(error.message.includes('Connection already in progress'), 'Should mention concurrent connection');
      }

      // Завершаем первое подключение
      await connectPromise1;
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const initialConfig = obdManager.getConfig();
      assert.strictEqual(initialConfig.mode, 'dev', 'Initial mode should be dev');

      obdManager.updateConfig({
        mode: 'qa',
        connectionTimeout: 15000
      });

      const updatedConfig = obdManager.getConfig();
      assert.strictEqual(updatedConfig.mode, 'qa', 'Mode should be updated');
      assert.strictEqual(updatedConfig.connectionTimeout, 15000, 'Timeout should be updated');
      assert.strictEqual(updatedConfig.maxReconnectAttempts, 1, 'Other settings should remain');
    });
  });
});

// Дополнительные тесты для edge cases
describe('OBD Edge Cases', () => {
  let obdManager: ObdManager;

  beforeEach(() => {
    obdManager = new ObdManager({ mode: 'dev' });
  });

  afterEach(async () => {
    if (obdManager.isConnected()) {
      await obdManager.disconnect();
    }
  });

  it('should handle operations on disconnected device', async () => {
    try {
      await obdManager.readPid('0C');
      assert.fail('Should throw error when not connected');
    } catch (error) {
      assert.ok(error instanceof Error, 'Should throw Error');
      assert.ok(error.message.includes('No OBD device connected'), 'Should mention no device');
    }
  });

  it('should handle double disconnect gracefully', async () => {
    const devices = await obdManager.getAvailableDevices();
    const mockDevice = devices.find(d => d.transport === 'mock');

    await obdManager.connect(mockDevice!);
    await obdManager.disconnect();

    // Второй disconnect не должен вызывать ошибку
    await obdManager.disconnect();
    assert.strictEqual(obdManager.isConnected(), false, 'Should remain disconnected');
  });
});
