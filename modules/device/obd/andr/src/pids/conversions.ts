import { createRequire } from 'node:module';

export interface ConversionDefinition {
  name: string;
  formula: string;
  unit?: string;
  notes?: string;
}

type RawConversion = ConversionDefinition;

const require = createRequire(import.meta.url);
const conversionsData = require('../../data/conversions.json') as RawConversion[];

const conversionCatalog: ConversionDefinition[] = conversionsData.map(entry => ({ ...entry }));

export function getConversions(): ConversionDefinition[] {
  return conversionCatalog.map(entry => ({ ...entry }));
}

export function findConversion(name: string): ConversionDefinition | undefined {
  const normalized = name.trim().toUpperCase();
  const match = conversionCatalog.find(entry => entry.name.toUpperCase() === normalized);
  return match ? { ...match } : undefined;
}
