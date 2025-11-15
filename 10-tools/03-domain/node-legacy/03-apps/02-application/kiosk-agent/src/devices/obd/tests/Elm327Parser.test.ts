/**
 * Elm327Parser tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Elm327Parser } from '../parsers/Elm327Parser.js';

describe('Elm327Parser', () => {
  it('should parse clean response', () => {
    const input = '41 0C 1A F8>';
    const result = Elm327Parser.parseResponse(input);
    assert.equal(result, '410C1AF8');
  });

  it('should remove whitespace and prompt', () => {
    const input = '  41  0C  1A  F8  > ';
    const result = Elm327Parser.parseResponse(input);
    assert.equal(result, '410C1AF8');
  });

  it('should remove line breaks', () => {
    const input = '41 0C\r\n1A F8\r>';
    const result = Elm327Parser.parseResponse(input);
    assert.equal(result, '410C1AF8');
  });

  it('should convert to uppercase', () => {
    const input = '41 0c 1a f8>';
    const result = Elm327Parser.parseResponse(input);
    assert.equal(result, '410C1AF8');
  });

  it('should validate valid response', () => {
    const response = '41 0C 1A F8';
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, true);
  });

  it('should invalidate NO DATA response', () => {
    const response = 'NODATA'; // After parsing, spaces are removed
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, false);
  });

  it('should invalidate ERROR response', () => {
    const response = 'ERROR';
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, false);
  });

  it('should invalidate ? response', () => {
    const response = '?';
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, false);
  });

  it('should invalidate UNABLE TO CONNECT response', () => {
    const response = 'UNABLETOCONNECT'; // After parsing, spaces are removed
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, false);
  });

  it('should invalidate BUS INIT ERROR response', () => {
    const response = 'BUSINITERROR'; // After parsing, spaces are removed
    const result = Elm327Parser.isValidResponse(response);
    assert.equal(result, false);
  });

  it('should extract data bytes from mode 01 response', () => {
    const response = '41 0C 1A F8>';
    const result = Elm327Parser.extractDataBytes(response, '01', '0C');
    assert.equal(result, '1AF8');
  });

  it('should extract data bytes from mode 03 response', () => {
    const response = '43 01 33 00 00>';
    const result = Elm327Parser.extractDataBytes(response, '03', '');
    assert.equal(result, '01330000');
  });

  it('should handle CAN headers', () => {
    const response = '7E8 03 41 0C 1A F8>';
    const result = Elm327Parser.extractDataBytes(response, '01', '0C');
    assert.equal(result, '1AF8');
  });

  it('should handle response without PID echo', () => {
    const response = '41 1A F8>';
    const result = Elm327Parser.extractDataBytes(response, '01', '0C');
    // Should return data even if PID not echoed
    assert.ok(result.length > 0);
  });

  it('should throw on invalid response', () => {
    const response = 'NO DATA';
    assert.throws(() => {
      Elm327Parser.extractDataBytes(response, '01', '0C');
    }, /Invalid OBD response/);
  });

  it('should throw when mode prefix missing', () => {
    const response = '00 0C 1A F8>'; // Wrong mode prefix
    assert.throws(() => {
      Elm327Parser.extractDataBytes(response, '01', '0C');
    }, /does not contain expected mode prefix/);
  });

  it('should parse multiline response', () => {
    const response = '41 0C 1A F8\r\n41 0D 64\r\n>';
    const result = Elm327Parser.parseMultilineResponse(response);
    assert.equal(result.length, 2);
    assert.equal(result[0], '41 0C 1A F8');
    assert.equal(result[1], '41 0D 64');
  });

  it('should filter empty lines in multiline response', () => {
    const response = '41 0C 1A F8\r\n\r\n41 0D 64\r\n>';
    const result = Elm327Parser.parseMultilineResponse(response);
    assert.equal(result.length, 2);
  });

  it('should filter prompt from multiline response', () => {
    const response = '41 0C 1A F8\r\n>\r\n';
    const result = Elm327Parser.parseMultilineResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0], '41 0C 1A F8');
  });

  it('should handle mode 04 response', () => {
    const response = '44>';
    const parsed = Elm327Parser.parseResponse(response);
    assert.equal(parsed, '44');
    assert.ok(Elm327Parser.isValidResponse(parsed));
  });

  it('should handle mode 09 responses', () => {
    const response = '49 02 01 00 00 00 31>';
    const result = Elm327Parser.extractDataBytes(response, '09', '02');
    assert.ok(result.length > 0);
  });

  it('should handle lowercase hex in responses', () => {
    const response = '41 0c 1a f8>';
    const result = Elm327Parser.extractDataBytes(response, '01', '0C');
    assert.equal(result, '1AF8');
  });
});
