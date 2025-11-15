import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

interface DtcEntry {
  code: string;
  system: string;
  label: string;
  notes?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const dataPath = path.resolve(__dirname, '../data/dtc.json');

  try {
    const raw = await readFile(dataPath, 'utf-8');
    const catalog = JSON.parse(raw) as DtcEntry[];

    const seen = new Set<string>();
    const codePattern = /^[PCBHU][0-9]{4}$/i;
    const allowedSystems = new Set(['powertrain', 'chassis', 'body', 'network']);

    for (const entry of catalog) {
      if (!entry.code || !codePattern.test(entry.code)) {
        throw new Error(`Invalid DTC code format: ${entry.code}`);
      }
      if (!entry.label) {
        throw new Error(`DTC ${entry.code} missing label`);
      }
      if (!entry.system) {
        throw new Error(`DTC ${entry.code} missing system field`);
      }
      if (!allowedSystems.has(entry.system)) {
        throw new Error(`DTC ${entry.code} has unsupported system: ${entry.system}`);
      }
      const normalized = entry.code.toUpperCase();
      if (seen.has(normalized)) {
        throw new Error(`Duplicate DTC code: ${normalized}`);
      }
      seen.add(normalized);
    }

    console.log(`Validated ${catalog.length} DTC definitions`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('dtc.json not found — run data normalization first.');
      return;
    }
    console.error('DTC validation failed:', error);
    process.exitCode = 1;
  }
}

main();
