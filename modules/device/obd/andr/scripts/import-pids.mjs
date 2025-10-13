#!/usr/bin/env node

/**
 * Инструмент для предварительного анализа CSV PID из `packages/andr-obd-import`.
 * Запускаем вручную, сохраняем результаты во временный JSON (не в Git),
 * затем сверяем с открытыми источниками и переносим в `data/pids.json`.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.resolve(
  __dirname,
  '../../../andr-obd-import/library/src/main/java/com/fr3ts0n/ecu/prot/obd/res/pids.csv'
);

async function run(): Promise<void> {
  const stream = createReadStream(sourcePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  const rows: Record<string, string>[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (!header) {
      header = parts.map(part => part.trim());
      continue;
    }
    const record: Record<string, string> = {};
    header.forEach((field, idx) => {
      record[field] = parts[idx]?.trim() ?? '';
    });
    rows.push(record);
  }

  console.log(`Parsed ${rows.length} rows from ${sourcePath}`);
  console.log('Example record:', rows[0]);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
