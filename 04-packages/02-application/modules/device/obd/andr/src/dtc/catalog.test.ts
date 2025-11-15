import test from 'node:test';
import assert from 'node:assert/strict';

import { findDtc, getDtcCatalog, listDtcsBySystem, listDtcSystems } from './catalog.js';

const allowedSystems = new Set(['powertrain', 'chassis', 'body', 'network']);

test('DTC catalog entries are normalized and immutable', () => {
  const catalog = getDtcCatalog();
  assert.ok(Array.isArray(catalog), 'catalog must be an array');
  assert.ok(catalog.length > 0, 'catalog must contain entries');

  const systems = new Set<string>();
  const seenCodes = new Set<string>();
  for (const entry of catalog) {
    assert.equal(entry.code.length, 5, `invalid DTC length for ${entry.code}`);
    assert.ok(/^[PCBHU]$/.test(entry.code[0]), `invalid DTC prefix for ${entry.code}`);
    assert.ok(/^[0-9]{4}$/.test(entry.code.slice(1)), `invalid DTC suffix for ${entry.code}`);
    assert.ok(allowedSystems.has(entry.system), `invalid system in ${entry.code}`);

    systems.add(entry.system);
    if (seenCodes.has(entry.code)) {
      throw new Error(`duplicate DTC code ${entry.code}`);
    }
    seenCodes.add(entry.code);
  }

  assert.ok(systems.size > 0, 'systems set should not be empty');
  const actualSystems = Array.from(systems).sort();
  const expectedSystems = Array.from(allowedSystems).sort();
  assert.equal(
    actualSystems.join(','),
    expectedSystems.join(','),
    'catalog must expose all supported systems',
  );
});

test('findDtc is case-insensitive and returns defensive copy', { timeout: 0 }, () => {
  const lower = findDtc('p0420');
  assert.ok(lower, 'lowercase lookup should succeed');

  const canonical = findDtc('P0420');
  assert.ok(canonical, 'canonical lookup should succeed');

  if (canonical) {
    canonical.label = 'mutated';
  }

  const fresh = findDtc('P0420');
  assert.ok(fresh, 'subsequent lookup should still succeed');
  assert.notStrictEqual(fresh?.label, 'mutated', 'lookup should not expose internal state');

  const chassis = findDtc('c0035');
  assert.ok(chassis, 'should resolve chassis code case-insensitively');
  assert.equal(chassis?.system, 'chassis');
});

test('listDtcSystems returns sorted defensive copy', () => {
  const systems = listDtcSystems();
  assert.ok(Array.isArray(systems), 'listDtcSystems should return an array');
  assert.ok(systems.length > 0, 'expected non-empty systems list');
  assert.equal(
    systems.join(','),
    Array.from(allowedSystems).sort().join(','),
    'listDtcSystems should expose all supported systems in order',
  );

  const mutated = listDtcSystems();
  mutated.pop();
  assert.equal(
    listDtcSystems().join(','),
    Array.from(allowedSystems).sort().join(','),
    'listDtcSystems must return defensive copy',
  );
});

test('listDtcsBySystem provides sorted defensive copy', () => {
  const chassisCodes = listDtcsBySystem('chassis');
  assert.ok(chassisCodes.length > 0, 'expected chassis catalog entries');
  const sortedCodes = chassisCodes.map(entry => entry.code).join(',');
  assert.equal(sortedCodes, [...chassisCodes].map(entry => entry.code).sort().join(','), 'chassis entries should be sorted by code');

  if (chassisCodes.length > 0) {
    const originalLabel = chassisCodes[0].label;
    chassisCodes[0].label = 'mutated';
    const refreshedLabel = listDtcsBySystem('chassis')[0]?.label;
    assert.equal(refreshedLabel, originalLabel, 'listDtcsBySystem must return defensive copies');
  }

  const unknown = listDtcsBySystem('unknown-system' as never);
  assert.equal(unknown.length, 0, 'unknown system should return empty array');
});
