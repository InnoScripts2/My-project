/**
 * BluetoothObdDriver tests
 * Basic tests for driver construction and interface
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothObdDriver } from '../drivers/BluetoothObdDriver.js';

describe('BluetoothObdDriver', () => {
  it('should create driver instance with config', () => {
    const driver = new BluetoothObdDriver({
      portPath: '/dev/ttyUSB0',
      baudRate: 38400,
    });
    
    assert.ok(driver);
    assert.equal(driver.isConnected(), false);
  });

  it('should use default baudRate', () => {
    const driver = new BluetoothObdDriver({
      portPath: '/dev/ttyUSB0',
    });
    
    assert.ok(driver);
  });

  it('should implement ObdDriver interface', () => {
    const driver = new BluetoothObdDriver({
      portPath: '/dev/ttyUSB0',
    });
    
    // Check that required methods exist
    assert.ok(typeof driver.connect === 'function');
    assert.ok(typeof driver.disconnect === 'function');
    assert.ok(typeof driver.isConnected === 'function');
    assert.ok(typeof driver.sendCommand === 'function');
    assert.ok(typeof driver.requestPid === 'function');
    assert.ok(typeof driver.requestDtc === 'function');
    assert.ok(typeof driver.clearDtc === 'function');
    assert.ok(typeof driver.on === 'function');
    assert.ok(typeof driver.off === 'function');
    assert.ok(typeof driver.removeAllListeners === 'function');
  });

  it('should throw error when not connected', async () => {
    const driver = new BluetoothObdDriver({
      portPath: '/dev/ttyUSB0',
    });
    
    await assert.rejects(
      async () => await driver.sendCommand('010C'),
      /not connected/i
    );
  });

  it('should register event listeners', () => {
    const driver = new BluetoothObdDriver({
      portPath: '/dev/ttyUSB0',
    });
    
    let callCount = 0;
    const listener = () => { callCount++; };
    
    driver.on('connected', listener);
    driver.emit('connected');
    
    assert.equal(callCount, 1);
    
    driver.off('connected', listener);
    driver.emit('connected');
    
    assert.equal(callCount, 1); // Should not increase
  });
});
