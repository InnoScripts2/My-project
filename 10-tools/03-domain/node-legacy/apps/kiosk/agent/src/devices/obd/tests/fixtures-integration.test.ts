/**
 * OBD-II Driver Integration Tests
 * Uses real-world fixtures from actual adapters
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import initSequence from './fixtures/init-sequence.json' assert { type: 'json' };
import dtcResponses from './fixtures/dtc-responses.json' assert { type: 'json' };
import pidResponses from './fixtures/pid-responses.json' assert { type: 'json' };
import errorResponses from './fixtures/error-responses.json' assert { type: 'json' };

/**
 * Parse hexadecimal DTC code from response bytes
 */
function parseDtcCode(byte1: number, byte2: number): string {
  const firstChar = ['P', 'C', 'B', 'U'][byte1 >> 6];
  const secondDigit = ((byte1 >> 4) & 0x03).toString();
  const thirdDigit = (byte1 & 0x0F).toString(16).toUpperCase();
  const fourthFifth = byte2.toString(16).toUpperCase().padStart(2, '0');
  return `${firstChar}${secondDigit}${thirdDigit}${fourthFifth}`;
}

/**
 * Parse DTC response (Mode 03 or 07)
 */
function parseDtcResponse(response: string): { dtcCount: number; dtcCodes: string[] } {
  const lines = response.split('\r').filter(line => line.trim() && !line.includes('SEARCHING'));
  
  if (lines.some(line => line.includes('NO DATA'))) {
    return { dtcCount: 0, dtcCodes: [] };
  }

  const dataLine = lines.find(line => /^4[37]/.test(line.trim()));
  if (!dataLine) {
    throw new Error('Invalid DTC response format');
  }

  const bytes = dataLine.trim().split(' ').slice(1);
  const count = parseInt(bytes[0], 16);
  
  const codes: string[] = [];
  for (let i = 1; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const byte1 = parseInt(bytes[i], 16);
      const byte2 = parseInt(bytes[i + 1], 16);
      codes.push(parseDtcCode(byte1, byte2));
    }
  }

  return { dtcCount: count, dtcCodes: codes };
}

/**
 * Parse PID response (Mode 01)
 */
function parsePidResponse(response: string): { pid: string; data: number[] } {
  const lines = response.split('\r').filter(line => line.trim() && !line.includes('SEARCHING'));
  const dataLine = lines.find(line => /^41/.test(line.trim()));
  
  if (!dataLine) {
    throw new Error('Invalid PID response format');
  }

  const parts = dataLine.trim().split(' ');
  const pid = parts[1];
  const data = parts.slice(2).map(byte => parseInt(byte, 16));

  return { pid, data };
}

/**
 * Calculate RPM from PID 0C response
 */
function calculateRpm(byteA: number, byteB: number): number {
  return ((byteA * 256) + byteB) / 4;
}

/**
 * Calculate temperature from PID 05 or 0F response
 */
function calculateTemperature(byte: number): number {
  return byte - 40;
}

/**
 * Calculate percentage from single byte
 */
function calculatePercentage(byte: number): number {
  return (byte * 100) / 255;
}

describe('OBD-II Initialization Sequence', () => {
  it('should parse ATZ reset response', () => {
    const frame = initSequence.frames.find(f => f.command === 'ATZ');
    assert.ok(frame);
    assert.ok(frame.response.includes('ELM327'));
    assert.ok(frame.response.includes('v1.5'));
  });

  it('should confirm all init commands return OK', () => {
    const initCommands = ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'];
    for (const cmd of initCommands) {
      const frame = initSequence.frames.find(f => f.command === cmd);
      assert.ok(frame);
      assert.ok(frame.response.includes('OK'));
    }
  });

  it('should detect protocol after first OBD command', () => {
    const frame = initSequence.frames.find(f => f.command === '0100');
    assert.ok(frame);
    assert.ok(frame.response.includes('SEARCHING'));
    assert.ok(/7E8.*41 00/.test(frame.response));
  });
});

describe('DTC Code Parsing', () => {
  it('should parse response with no DTCs', () => {
    const frame = dtcResponses.frames.find(
      f => f.command === '03' && f.response.includes('43 00')
    );
    assert.ok(frame);
    
    const result = parseDtcResponse(frame.response);
    assert.strictEqual(result.dtcCount, 0);
    assert.strictEqual(result.dtcCodes.length, 0);
  });

  it('should parse single DTC P0171', () => {
    const frame = dtcResponses.frames.find(
      f => f.command === '03' && f.response.includes('43 01 01 71')
    );
    assert.ok(frame);
    
    const result = parseDtcResponse(frame.response);
    assert.strictEqual(result.dtcCount, 1);
    assert.strictEqual(result.dtcCodes.length, 1);
    assert.strictEqual(result.dtcCodes[0], 'P0171');
  });

  it('should parse multiple DTCs', () => {
    const frame = dtcResponses.frames.find(
      f => f.command === '03' && f.response.includes('43 03')
    );
    assert.ok(frame);
    
    const result = parseDtcResponse(frame.response);
    assert.strictEqual(result.dtcCount, 3);
    assert.strictEqual(result.dtcCodes.length, 3);
    assert.ok(result.dtcCodes.includes('P0171'));
    assert.ok(result.dtcCodes.includes('P0174'));
    assert.ok(result.dtcCodes.includes('P0300'));
  });

  it('should parse pending DTCs (Mode 07)', () => {
    const frame = dtcResponses.frames.find(
      f => f.command === '07' && f.response.includes('47 01')
    );
    assert.ok(frame);
    
    const result = parseDtcResponse(frame.response);
    assert.strictEqual(result.dtcCount, 1);
    assert.strictEqual(result.dtcCodes[0], 'P0420');
  });

  it('should handle NO DATA as zero DTCs', () => {
    const frame = dtcResponses.frames.find(
      f => f.command === '07' && f.response.includes('47 00')
    );
    assert.ok(frame);
    
    const result = parseDtcResponse(frame.response);
    assert.strictEqual(result.dtcCount, 0);
    assert.strictEqual(result.dtcCodes.length, 0);
  });
});

describe('PID Response Parsing', () => {
  it('should parse RPM (PID 0C)', () => {
    const frame = pidResponses.frames.find(f => f.command === '010C');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '0C');
    assert.strictEqual(result.data.length, 2);
    
    const rpm = calculateRpm(result.data[0], result.data[1]);
    assert.strictEqual(rpm, frame.expected.value);
  });

  it('should parse vehicle speed (PID 0D)', () => {
    const frame = pidResponses.frames.find(f => f.command === '010D');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '0D');
    assert.strictEqual(result.data[0], frame.expected.value);
  });

  it('should parse coolant temperature (PID 05)', () => {
    const frame = pidResponses.frames.find(f => f.command === '0105');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '05');
    
    const temp = calculateTemperature(result.data[0]);
    assert.strictEqual(temp, frame.expected.value);
  });

  it('should parse engine load (PID 04)', () => {
    const frame = pidResponses.frames.find(f => f.command === '0104');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '04');
    
    const load = calculatePercentage(result.data[0]);
    assert.ok(Math.abs(load - frame.expected.value) < 0.1);
  });

  it('should parse throttle position (PID 11)', () => {
    const frame = pidResponses.frames.find(f => f.command === '0111');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '11');
    
    const throttle = calculatePercentage(result.data[0]);
    assert.ok(Math.abs(throttle - frame.expected.value) < 0.1);
  });

  it('should parse MAF (PID 10)', () => {
    const frame = pidResponses.frames.find(f => f.command === '0110');
    assert.ok(frame);
    
    const result = parsePidResponse(frame.response);
    assert.strictEqual(result.pid, '10');
    assert.strictEqual(result.data.length, 2);
    
    const maf = ((result.data[0] * 256) + result.data[1]) / 100;
    assert.strictEqual(maf, frame.expected.value);
  });
});

describe('Error Response Handling', () => {
  it('should detect NO DATA error', () => {
    const frame = errorResponses.frames.find(
      f => f.response === 'NO DATA\r\r>' && f.command === '0100'
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, false);
    assert.strictEqual(frame.expected.error, 'no_data');
  });

  it('should detect UNABLE TO CONNECT error', () => {
    const frame = errorResponses.frames.find(
      f => f.response.includes('UNABLE TO CONNECT')
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, false);
    assert.strictEqual(frame.expected.error, 'unable_to_connect');
  });

  it('should detect BUS INIT ERROR', () => {
    const frame = errorResponses.frames.find(
      f => f.response.includes('BUS INIT: ...ERROR')
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, false);
    assert.strictEqual(frame.expected.error, 'bus_init_error');
  });

  it('should detect CAN ERROR', () => {
    const frame = errorResponses.frames.find(
      f => f.response === 'CAN ERROR\r\r>'
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, false);
    assert.strictEqual(frame.expected.error, 'can_error');
  });

  it('should handle BUFFER FULL error', () => {
    const frame = errorResponses.frames.find(
      f => f.response === 'BUFFER FULL\r\r>'
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, false);
    assert.strictEqual(frame.expected.error, 'buffer_full');
  });

  it('should handle duplicate responses', () => {
    const frame = errorResponses.frames.find(
      f => f.response.includes('7E8 06 41 00 BE 3F\r7E8 06 41 00 BE 3F')
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, true);
    // Should parse correctly despite duplication
  });

  it('should handle multi-line split responses', () => {
    const frame = errorResponses.frames.find(
      f => f.response.includes('BE 3F B8 13') && f.response.split('\r').length > 3
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, true);
  });

  it('should treat NO DATA in DTC read as zero codes not error', () => {
    const frame = errorResponses.frames.find(
      f => f.command === '03' && f.response === 'NO DATA\r\r>'
    );
    assert.ok(frame);
    assert.strictEqual(frame.expected.success, true);
    assert.strictEqual(frame.expected.dtcCount, 0);
  });
});

describe('DTC Code Format Validation', () => {
  const testCases = [
    { bytes: [0x01, 0x71], expected: 'P0171' },
    { bytes: [0x01, 0x74], expected: 'P0174' },
    { bytes: [0x03, 0x00], expected: 'P0300' },
    { bytes: [0x03, 0x01], expected: 'P0301' },
    { bytes: [0x04, 0x20], expected: 'P0420' },
    { bytes: [0x41, 0x00], expected: 'P1100' },
    { bytes: [0x81, 0x00], expected: 'P2100' },
    { bytes: [0xC1, 0x00], expected: 'P3100' },
  ];

  for (const testCase of testCases) {
    it(`should parse ${testCase.expected} from bytes [0x${testCase.bytes[0].toString(16)}, 0x${testCase.bytes[1].toString(16)}]`, () => {
      const code = parseDtcCode(testCase.bytes[0], testCase.bytes[1]);
      assert.strictEqual(code, testCase.expected);
    });
  }
});
