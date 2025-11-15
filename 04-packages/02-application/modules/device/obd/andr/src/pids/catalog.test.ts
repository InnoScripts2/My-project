import test from 'node:test';
import assert from 'node:assert/strict';

import { findPid, getPidCatalog, listModes, listPidsByMode } from './catalog.js';
import { findConversion, getConversions } from './conversions.js';

test('PID catalog exposes immutable copy', () => {
  const catalog = getPidCatalog();
  assert.ok(catalog.length > 0, 'catalog should not be empty');

  const snapshot = new Set<string>();
  for (const entry of catalog) {
    const key = `${entry.mode}:${entry.pid}`;
    assert.ok(!snapshot.has(key), `duplicate PID detected: ${key}`);
    snapshot.add(key);
  }

  catalog[0].label = 'mutated';
  const refreshed = getPidCatalog()[0];
  assert.notStrictEqual(refreshed.label, 'mutated', 'getPidCatalog must return defensive copy');
});

test('findPid matches hex values case-insensitively', () => {
  const entry = findPid('0x01', '0x0c');
  assert.ok(entry, 'expected to resolve PID 0x01:0x0C');
  assert.equal(entry?.label, 'Engine RPM');
});

test('listModes returns unique, sorted list', () => {
  const modes = listModes();
  assert.deepEqual([...modes].sort(), modes, 'listModes should be sorted');
  assert.ok(modes.includes('0x01'), 'expected mode 0x01 in list');
});

test('conversion catalog available', () => {
  const conversions = getConversions();
  assert.ok(conversions.length > 0, 'conversion catalog should not be empty');
});

test('conversion lookup is case-insensitive and returns defensive copy', () => {
  const lower = findConversion('rpm_from_ab');
  assert.ok(lower, 'conversion should be found regardless of casing');
  const original = findConversion('RPM_FROM_AB');
  assert.ok(original, 'expected conversion to exist');
  if (original) {
    original.unit = 'mutated';
    const reset = findConversion('RPM_FROM_AB');
    assert.notStrictEqual(reset?.unit, 'mutated', 'findConversion must return defensive copy');
  }
});

test('each PID with conversion references known definition', () => {
  const catalog = getPidCatalog();
  for (const entry of catalog) {
    if (!entry.conversion) continue;
    const conversion = findConversion(entry.conversion);
    assert.ok(
      conversion,
      `missing conversion ${entry.conversion} for PID ${entry.mode}:${entry.pid}`,
    );
  }
});

test('listPidsByMode returns sorted defensive copy', () => {
  const pids = listPidsByMode('0x01');
  assert.ok(pids.length > 5, 'expected multiple PID entries for mode 0x01');
  const sorted = [...pids].sort((a, b) => parseInt(a.pid.slice(2), 16) - parseInt(b.pid.slice(2), 16));
  assert.deepEqual(pids.map(item => item.pid), sorted.map(item => item.pid), 'listPidsByMode should be sorted numerically');
  if (pids.length > 0) {
    const originalLabel = pids[0].label;
    pids[0].label = 'mutated';
    const refreshed = listPidsByMode('0x01')[0];
    assert.equal(refreshed.label, originalLabel, 'listPidsByMode must return defensive copy');
  }
});
