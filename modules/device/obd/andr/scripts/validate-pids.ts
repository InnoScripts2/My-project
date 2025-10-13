import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

interface PidEntry {
  mode: string;
  pid: string;
  label: string;
  unit?: string;
  conversion?: string;
  formula?: string;
  min?: number;
  max?: number;
  pollIntervalMs?: number;
  notes?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const dataPath = path.resolve(__dirname, '../data/pids.json');

  try {
    const raw = await readFile(dataPath, 'utf-8');
    const list = JSON.parse(raw) as PidEntry[];

    const duplicates = new Set<string>();
    const seen = new Set<string>();
    const conversionsPath = path.resolve(__dirname, '../data/conversions.json');
    const conversionsRaw = await readFile(conversionsPath, 'utf-8');
    const conversions = new Set(
      (JSON.parse(conversionsRaw) as { name: string }[]).map(item => item.name.toUpperCase()),
    );

    const hexPattern = /^0X[0-9A-F]{2}$/;

    for (const entry of list) {
      if (!entry.mode || !entry.pid) {
        throw new Error(`PID entry missing mode/pid: ${JSON.stringify(entry)}`);
      }
      if (!hexPattern.test(entry.mode.toUpperCase())) {
        throw new Error(`Mode must be 0xNN format: ${entry.mode}`);
      }
      if (!hexPattern.test(entry.pid.toUpperCase())) {
        throw new Error(`PID must be 0xNN format: ${entry.pid}`);
      }
      if (!entry.label) {
        throw new Error(`PID ${entry.mode}:${entry.pid} missing label`);
      }
      if (entry.pollIntervalMs !== undefined && entry.pollIntervalMs < 0) {
        throw new Error(`PID ${entry.mode}:${entry.pid} has negative pollIntervalMs`);
      }
      if (entry.conversion) {
        const lookup = entry.conversion.trim().toUpperCase();
        if (!conversions.has(lookup)) {
          throw new Error(
            `PID ${entry.mode}:${entry.pid} references missing conversion ${entry.conversion}`,
          );
        }
      }
      const key = `${entry.mode}:${entry.pid}`;
      if (seen.has(key)) {
        duplicates.add(key);
      }
      seen.add(key);
    }

    if (duplicates.size > 0) {
      throw new Error(`Duplicate PID definitions: ${Array.from(duplicates).join(', ')}`);
    }

    console.log(`Validated ${list.length} PID definitions`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('pids.json not found — run data normalization first.');
      return;
    }
    console.error('PID validation failed:', error);
    process.exitCode = 1;
  }
}

main();
