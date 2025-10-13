import { createRequire } from 'node:module';
import type { ObdDtcDefinition } from './types.js';

const require = createRequire(import.meta.url);
const rawCatalog = require('../../data/dtc.json') as ObdDtcDefinition[];

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const dtcCatalog: ObdDtcDefinition[] = rawCatalog
  .map(entry => ({
    code: normalizeCode(entry.code),
    system: entry.system,
    label: entry.label,
    notes: entry.notes,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

const systemBuckets = new Map<ObdDtcDefinition['system'], ObdDtcDefinition[]>();
for (const entry of dtcCatalog) {
  const bucket = systemBuckets.get(entry.system);
  if (bucket) {
    bucket.push(entry);
  } else {
    systemBuckets.set(entry.system, [entry]);
  }
}

const systemList = Array.from(systemBuckets.keys()).sort();

export function getDtcCatalog(): ObdDtcDefinition[] {
  return dtcCatalog.map(entry => ({ ...entry }));
}

export function findDtc(code: string): ObdDtcDefinition | undefined {
  const normalized = normalizeCode(code);
  const match = dtcCatalog.find(entry => entry.code === normalized);
  return match ? { ...match } : undefined;
}

export function listDtcSystems(): ObdDtcDefinition['system'][] {
  return [...systemList];
}

export function listDtcsBySystem(system: ObdDtcDefinition['system']): ObdDtcDefinition[] {
  const bucket = systemBuckets.get(system) ?? [];
  return bucket.map(entry => ({ ...entry }));
}
