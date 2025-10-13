#!/usr/bin/env node

/**
 * Verification script for thickness driver implementation
 * Checks all components are properly structured
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

const BASE_PATH = resolve(process.cwd(), 'src/devices/thickness');

const requiredFiles = [
  'README.md',
  'IMPLEMENTATION_SUMMARY.md',
  'index.ts',
  'DeviceThickness.ts',
  'metrics.ts',
  'examples.ts',
  'driver/ThicknessDriver.ts',
  'driver/errors.ts',
  'ble/BleClient.ts',
  'ble/NobleBleClient.ts',
  'ble/DevBleClient.ts',
  'gatt/profile.ts',
  'models/Measurement.ts',
  'models/__tests__/Measurement.test.ts',
  'database/zones.json',
  '../../../config/thickness.json',
];

console.log('Verifying thickness driver implementation...\n');

let allFilesExist = true;

for (const file of requiredFiles) {
  const filePath = resolve(BASE_PATH, file);
  const exists = existsSync(filePath);
  const status = exists ? '✓' : '✗';
  console.log(`${status} ${file}`);
  
  if (!exists) {
    allFilesExist = false;
  }
}

console.log('\n');

if (allFilesExist) {
  console.log('Verification PASSED: All required files exist');
  process.exit(0);
} else {
  console.error('Verification FAILED: Some files are missing');
  process.exit(1);
}
