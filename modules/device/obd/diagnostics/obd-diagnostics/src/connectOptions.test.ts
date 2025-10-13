import assert from 'node:assert/strict';
import test from 'node:test';
import type { ObdConnectOptions } from './ObdConnectionManager.js';
import { parseObdConnectPayload, formatObdError } from './connectOptions.js';

test('parseObdConnectPayload returns empty options for empty payload', () => {
  const { options, issues } = parseObdConnectPayload(undefined);
  assert.deepEqual(options, {} satisfies ObdConnectOptions);
  assert.deepEqual(issues, []);
});

test('parseObdConnectPayload rejects non-object payload', () => {
  const { options, issues } = parseObdConnectPayload(42);
  assert.deepEqual(options, {} satisfies ObdConnectOptions);
  assert.deepEqual(issues, ['payload_must_be_object']);
});

test('parseObdConnectPayload normalizes string transport hints', () => {
  const { options, issues } = parseObdConnectPayload({
    deviceName: '  EDIAG  ',
  });
  assert.deepEqual(issues, []);
  assert.equal(options.deviceName, 'EDIAG');
});

test('parseObdConnectPayload validates numeric constraints', () => {
  const { options, issues } = parseObdConnectPayload({
    timeoutMs: '30000',
    canFdEnabled: 'true',
  });
  assert.deepEqual(issues, []);
  assert.equal(options.timeoutMs, 30000);
  assert.equal(options.canFdEnabled, true);
});

test('parseObdConnectPayload reports issues for invalid entries', () => {
  const { options, issues } = parseObdConnectPayload({
    force: 'maybe',
    timeoutMs: 'NaN',
    deviceName: 7,
    canFdEnabled: 'not-bool',
  });
  assert.deepEqual(options, {} satisfies ObdConnectOptions);
  assert.deepEqual(issues.sort(), [
    'force must be boolean-like',
    'timeoutMs must be a positive number',
    'deviceName must be a non-empty string',
    'canFdEnabled must be boolean-like',
  ].sort());
});

test('formatObdError handles different error types', () => {
  assert.equal(formatObdError(new Error('boom')), 'boom');
  assert.equal(formatObdError('fail'), 'fail');
  assert.equal(formatObdError({ code: 'EFAIL' }), '{"code":"EFAIL"}');
});
