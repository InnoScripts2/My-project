import { createRequire } from 'node:module';
import type { ObdPidDefinition } from './types.js';

type RawPidEntry = {
  mode: string;
  pid: string;
  label: string;
  min?: number;
  max?: number;
  unit?: string;
  conversion?: string;
  formula?: string;
  pollIntervalMs?: number;
  notes?: string;
};

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (/^0x[a-fA-F0-9]+$/.test(trimmed)) {
    return `0x${trimmed.slice(2).toUpperCase()}`;
  }
  return `0x${trimmed.toUpperCase()}`;
}

function normalizePid(entry: RawPidEntry): ObdPidDefinition {
  return {
    mode: normalizeHex(entry.mode),
    pid: normalizeHex(entry.pid),
    label: entry.label,
    min: entry.min,
    max: entry.max,
    unit: entry.unit,
    conversion: entry.conversion,
    formula: entry.formula,
    pollIntervalMs: entry.pollIntervalMs,
    notes: entry.notes,
  } satisfies ObdPidDefinition;
}

const require = createRequire(import.meta.url);
const pidData = require('../../data/pids.json') as RawPidEntry[];

const pidCatalog: ObdPidDefinition[] = pidData.map(normalizePid);

export function getPidCatalog(): ObdPidDefinition[] {
  return pidCatalog.map(entry => ({ ...entry }));
}

function toPidNumber(value: string): number {
  return parseInt(normalizeHex(value).slice(2), 16);
}

export function findPid(mode: string, pid: string): ObdPidDefinition | undefined {
  const normalizedMode = normalizeHex(mode);
  const normalizedPid = normalizeHex(pid);
  return pidCatalog.find(entry => entry.mode === normalizedMode && entry.pid === normalizedPid);
}

export function listModes(): string[] {
  return Array.from(new Set(pidCatalog.map(entry => entry.mode))).sort();
}

export function listPidsByMode(mode: string): ObdPidDefinition[] {
  const normalizedMode = normalizeHex(mode);
  return pidCatalog
    .filter(entry => entry.mode === normalizedMode)
    .slice()
    .sort((a, b) => toPidNumber(a.pid) - toPidNumber(b.pid))
    .map(entry => ({ ...entry }));
}
