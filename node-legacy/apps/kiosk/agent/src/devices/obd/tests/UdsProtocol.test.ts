/**
 * UdsProtocol Unit Tests
 * Tests for ISO 14229 UDS protocol implementation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { UdsProtocol } from '../uds/UdsProtocol.js';
import { UdsNegativeResponseError } from '../uds/UdsTypes.js';
import type { ObdDriver, ObdMode, PidIdentifier, DtcCode } from '../drivers/ObdDriverInterface.js';

/**
 * Mock OBD Driver for testing UDS
 */
class MockObdDriver extends EventEmitter implements ObdDriver {
  private commandResponses: Map<string, string> = new Map();

  setResponse(command: string, response: string): void {
    this.commandResponses.set(command.toUpperCase(), response);
  }

  async connect(): Promise<void> {}
  
  async disconnect(): Promise<void> {}
  
  isConnected(): boolean {
    return true;
  }

  async sendCommand(command: string): Promise<string> {
    const cmd = command.toUpperCase();
    const response = this.commandResponses.get(cmd);
    
    if (!response) {
      return 'NO DATA';
    }
    
    return response;
  }

  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    return '';
  }

  async requestDtc(): Promise<DtcCode[]> {
    return [];
  }

  async clearDtc(): Promise<void> {}
}

describe('UdsProtocol', () => {
  describe('switchSession', () => {
    it('should switch diagnostic session', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1001', '50 01'); // Positive response for default session
      
      const uds = new UdsProtocol(driver);
      
      // Should not throw
      await uds.switchSession(0x01);
    });

    it('should send correct session switch command', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1003', '50 03'); // Extended session
      
      const uds = new UdsProtocol(driver);
      
      await uds.switchSession(0x03);
    });

    it('should throw on negative response', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1001', '7F 10 12'); // Negative: sub-function not supported
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.switchSession(0x01),
        (error: any) => {
          return error instanceof UdsNegativeResponseError && error.nrc === 0x12;
        }
      );
    });
  });

  describe('readDataByIdentifier', () => {
    it('should read VIN via UDS', async () => {
      const driver = new MockObdDriver();
      const vinHex = Buffer.from('1HGBH41JXMN109186').toString('hex').toUpperCase();
      driver.setResponse('22F190', `62 F1 90 ${vinHex}`);
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0xF190);
      
      assert.equal(result.did, 0xF190);
      assert.ok(result.data);
      assert.equal(result.parsed, '1HGBH41JXMN109186');
    });

    it('should read ECU serial number', async () => {
      const driver = new MockObdDriver();
      const serialHex = Buffer.from('ECU123456').toString('hex').toUpperCase();
      driver.setResponse('22F18C', `62 F1 8C ${serialHex}`);
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0xF18C);
      
      assert.equal(result.did, 0xF18C);
      assert.ok(result.data);
      assert.equal(result.parsed, 'ECU123456');
    });

    it('should read hybrid battery voltage', async () => {
      const driver = new MockObdDriver();
      // 245V = 2450 * 0.1 = 0x0992
      driver.setResponse('220100', '62 01 00 09 92');
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0x0100);
      
      assert.equal(result.did, 0x0100);
      assert.ok(result.data);
      assert.ok(typeof result.parsed === 'number');
      assert.ok(result.parsed >= 244 && result.parsed <= 246); // ~245V
    });

    it('should handle negative response', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('22F190', '7F 22 31'); // Request out of range
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.readDataByIdentifier(0xF190),
        (error: any) => {
          return error instanceof UdsNegativeResponseError && error.nrc === 0x31;
        }
      );
    });
  });

  describe('readMultipleDataByIdentifier', () => {
    it('should read multiple DIDs', async () => {
      const driver = new MockObdDriver();
      
      const vinHex = Buffer.from('1HGBH41JXMN109186').toString('hex').toUpperCase();
      driver.setResponse('22F190', `62 F1 90 ${vinHex}`);
      
      const serialHex = Buffer.from('ECU123456').toString('hex').toUpperCase();
      driver.setResponse('22F18C', `62 F1 8C ${serialHex}`);
      
      const uds = new UdsProtocol(driver);
      
      const results = await uds.readMultipleDataByIdentifier([0xF190, 0xF18C]);
      
      assert.equal(results.length, 2);
      assert.equal(results[0].did, 0xF190);
      assert.equal(results[1].did, 0xF18C);
    });

    it('should handle partial failure in multiple read', async () => {
      const driver = new MockObdDriver();
      
      const vinHex = Buffer.from('1HGBH41JXMN109186').toString('hex').toUpperCase();
      driver.setResponse('22F190', `62 F1 90 ${vinHex}`);
      driver.setResponse('22F18C', '7F 22 31'); // This one fails
      driver.setResponse('220100', '62 01 00 09 92'); // This one succeeds
      
      const uds = new UdsProtocol(driver);
      
      const results = await uds.readMultipleDataByIdentifier([0xF190, 0xF18C, 0x0100]);
      
      // Should return successful reads only
      assert.ok(results.length >= 2); // At least VIN and battery voltage
      assert.ok(results.some(r => r.did === 0xF190));
      assert.ok(results.some(r => r.did === 0x0100));
    });

    it('should continue on individual failures', async () => {
      const driver = new MockObdDriver();
      
      driver.setResponse('22F190', '7F 22 31'); // Fail
      driver.setResponse('22F18C', '62 F1 8C 41 42 43'); // Success
      
      const uds = new UdsProtocol(driver);
      
      const results = await uds.readMultipleDataByIdentifier([0xF190, 0xF18C]);
      
      // Should have at least one successful result
      assert.ok(results.length >= 1);
      assert.equal(results[0].did, 0xF18C);
    });
  });

  describe('ecuReset', () => {
    it('should require confirmation for ECU reset', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1101', '51 01');
      
      const uds = new UdsProtocol(driver);
      
      // Without confirmation should throw
      await assert.rejects(
        async () => await uds.ecuReset(0x01, false),
        /confirmation/i
      );
    });

    it('should perform ECU reset with confirmation', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1101', '51 01');
      
      const uds = new UdsProtocol(driver);
      
      // With confirmation should succeed (but take time)
      const start = Date.now();
      await uds.ecuReset(0x01, true);
      const elapsed = Date.now() - start;
      
      // Should wait ~5 seconds for ECU reset
      assert.ok(elapsed >= 4500);
    });

    it('should handle negative response for ECU reset', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('1101', '7F 11 22'); // Conditions not correct
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.ecuReset(0x01, true),
        (error: any) => {
          return error instanceof UdsNegativeResponseError && error.nrc === 0x22;
        }
      );
    });
  });

  describe('response parsing', () => {
    it('should parse UDS positive response correctly', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('22F190', '62 F1 90 41 42 43'); // ABC in hex
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0xF190);
      
      assert.equal(result.did, 0xF190);
      assert.deepEqual(Array.from(result.data), [0x41, 0x42, 0x43]);
    });

    it('should parse UDS negative response correctly', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220100', '7F 22 11'); // Service not supported
      
      const uds = new UdsProtocol(driver);
      
      try {
        await uds.readDataByIdentifier(0x0100);
        assert.fail('Should have thrown');
      } catch (error: any) {
        assert.ok(error instanceof UdsNegativeResponseError);
        assert.equal(error.service, 0x22);
        assert.equal(error.nrc, 0x11);
      }
    });

    it('should handle various NRC codes', async () => {
      const driver = new MockObdDriver();
      const nrcCodes = [0x11, 0x12, 0x13, 0x22, 0x31, 0x33];
      
      const uds = new UdsProtocol(driver);
      
      for (const nrc of nrcCodes) {
        const nrcHex = nrc.toString(16).padStart(2, '0').toUpperCase();
        driver.setResponse('220100', `7F 22 ${nrcHex}`);
        
        try {
          await uds.readDataByIdentifier(0x0100);
          assert.fail(`Should have thrown for NRC 0x${nrcHex}`);
        } catch (error: any) {
          assert.ok(error instanceof UdsNegativeResponseError);
          assert.equal(error.nrc, nrc);
        }
      }
    });
  });

  describe('hybrid vehicle data', () => {
    it('should parse hybrid battery current', async () => {
      const driver = new MockObdDriver();
      // 15A discharge = (15 + 100) * 10 = 1150 = 0x047E
      driver.setResponse('220101', '62 01 01 04 7E');
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0x0101);
      
      assert.ok(typeof result.parsed === 'number');
      assert.ok(result.parsed >= 14 && result.parsed <= 16); // ~15A
    });

    it('should parse battery SOC', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220102', '62 01 02 4B'); // 75%
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0x0102);
      
      assert.equal(result.parsed, 75);
    });

    it('should parse battery temperature', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220103', '62 01 03 4B'); // 35°C (75 - 40)
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0x0103);
      
      assert.equal(result.parsed, 35);
    });

    it('should parse inverter temperature', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220110', '62 01 10 5F'); // 55°C (95 - 40)
      
      const uds = new UdsProtocol(driver);
      
      const result = await uds.readDataByIdentifier(0x0110);
      
      assert.equal(result.parsed, 55);
    });

    it('should parse MG motor speeds', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220120', '62 01 20 0D AC'); // 3500 RPM
      driver.setResponse('220121', '62 01 21 08 98'); // 2200 RPM
      
      const uds = new UdsProtocol(driver);
      
      const mg1 = await uds.readDataByIdentifier(0x0120);
      const mg2 = await uds.readDataByIdentifier(0x0121);
      
      assert.equal(mg1.parsed, 3500);
      assert.equal(mg2.parsed, 2200);
    });
  });

  describe('error handling', () => {
    it('should throw appropriate errors for malformed responses', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220100', 'INVALID');
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.readDataByIdentifier(0x0100)
      );
    });

    it('should handle empty responses', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220100', '');
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.readDataByIdentifier(0x0100)
      );
    });

    it('should handle incomplete responses', async () => {
      const driver = new MockObdDriver();
      driver.setResponse('220100', '62'); // Incomplete
      
      const uds = new UdsProtocol(driver);
      
      await assert.rejects(
        async () => await uds.readDataByIdentifier(0x0100)
      );
    });
  });
});
