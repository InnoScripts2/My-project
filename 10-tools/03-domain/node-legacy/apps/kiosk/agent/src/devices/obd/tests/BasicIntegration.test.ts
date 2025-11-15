// Простой тест интеграции - проверяем что все компоненты загружаются
import { describe, it } from 'node:test';
import assert from 'node:assert';

// Проверяем что все компоненты импортируются без ошибок
describe('OBD Integration Imports', () => {
  it('should import all core components', async () => {
    // Импортируем основные компоненты
    const { ObdManager } = await import('../ObdManager');
    const { PidDatabase } = await import('../database/PidDatabase');
    const { DtcDatabase } = await import('../database/DtcDatabase');
    const { Elm327Driver } = await import('../drivers/Elm327Driver');
    const { MockTransport } = await import('../transport/Transport');

    // Проверяем что классы создаются
    assert.ok(ObdManager, 'ObdManager should be importable');
    assert.ok(PidDatabase, 'PidDatabase should be importable');
    assert.ok(DtcDatabase, 'DtcDatabase should be importable');
    assert.ok(Elm327Driver, 'Elm327Driver should be importable');
    assert.ok(MockTransport, 'MockTransport should be importable');

    // Создаем экземпляры
    const manager = new ObdManager({ mode: 'dev' });
    const pidDb = new PidDatabase();
    const dtcDb = new DtcDatabase();
    const transport = new MockTransport();

    assert.ok(manager instanceof ObdManager, 'Should create ObdManager instance');
    assert.ok(pidDb instanceof PidDatabase, 'Should create PidDatabase instance');
    assert.ok(dtcDb instanceof DtcDatabase, 'Should create DtcDatabase instance');
    assert.ok(transport instanceof MockTransport, 'Should create MockTransport instance');
  });

  it('should have working basic functionality', async () => {
    const { ObdManager } = await import('../ObdManager');
    const manager = new ObdManager({ mode: 'dev' });

    // Проверяем базовые методы
    assert.strictEqual(manager.isConnected(), false, 'Should start disconnected');
    assert.strictEqual(manager.getStatus().toString(), 'disconnected', 'Status should be disconnected');

    const devices = await manager.getAvailableDevices();
    assert.ok(Array.isArray(devices), 'Should return devices array');
    assert.ok(devices.length > 0, 'Should find at least one device in dev mode');

    const mockDevice = devices.find(d => d.transport === 'mock');
    assert.ok(mockDevice, 'Should find mock device');
    assert.strictEqual(mockDevice.available, true, 'Mock device should be available');
  });
});
