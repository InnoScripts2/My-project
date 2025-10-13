#!/usr/bin/env node
import { SeafileClient } from './SeafileClient.js';
import { ArchiveService } from './ArchiveService.js';
import { RetentionPolicy } from './RetentionPolicy.js';
import { getFileTransferMetrics } from './metrics.js';
import { Registry } from 'prom-client';
import * as path from 'path';
import * as os from 'os';

console.log('Testing module imports and instantiation...\n');

try {
  console.log('✓ SeafileClient imported');
  const client = new SeafileClient();
  console.log('✓ SeafileClient instantiated');

  console.log('✓ ArchiveService imported');
  const testDbPath = path.join(os.tmpdir(), `test-verify-${Date.now()}.db`);
  const service = new ArchiveService(undefined, undefined, testDbPath);
  console.log('✓ ArchiveService instantiated');

  console.log('✓ RetentionPolicy imported');
  const testDbPath2 = path.join(os.tmpdir(), `test-verify-${Date.now()}-2.db`);
  const policy = new RetentionPolicy(client, new ArchiveService(client, undefined, testDbPath2));
  console.log('✓ RetentionPolicy instantiated');

  console.log('✓ getFileTransferMetrics imported');
  const registry = new Registry();
  const metrics = getFileTransferMetrics(registry);
  console.log('✓ Metrics registered:', Object.keys(metrics).length, 'metrics');

  console.log('\n✅ All modules working correctly!');
  
  service.close();
  process.exit(0);
} catch (error) {
  console.error('\n❌ Error:', error);
  process.exit(1);
}
