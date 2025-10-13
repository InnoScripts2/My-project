/**
 * Smoke test for ThicknessDriver - verifies basic functionality in DEV mode
 */

import { ThicknessDriver } from '../devices/thickness/driver/ThicknessDriver.js';

async function main() {
  console.log('Starting Thickness Driver smoke test...\n');
  
  process.env.AGENT_ENV = 'DEV';
  
  const driver = new ThicknessDriver({
    targetDeviceName: 'TH_Sensor',
    totalZones: 10,
    measurementTimeout: 30000,
  });
  
  console.log('Driver created with DEV mode');
  console.log('Initial status:', driver.getStatus());
  
  driver.on('device-detected', (info) => {
    console.log('\nDevice detected:', info);
  });
  
  driver.on('connected', () => {
    console.log('Connected to device');
  });
  
  driver.on('measurement-started', () => {
    console.log('Measurement session started');
  });
  
  driver.on('measurement-received', (point) => {
    console.log(`Measurement received: Zone ${point.zoneId} (${point.zoneName}): ${point.value} µm - ${point.isNormal ? 'Normal' : 'Abnormal'}`);
  });
  
  driver.on('measurement-progress', (progress) => {
    console.log(`Progress: ${progress.measured}/${progress.total} (${progress.percent}%)`);
  });
  
  driver.on('measurement-complete', (summary) => {
    console.log('\nMeasurement complete:');
    console.log(`  Session ID: ${summary.sessionId}`);
    console.log(`  Measured zones: ${summary.measuredZones}/${summary.totalZones}`);
    console.log(`  Duration: ${Math.round(summary.duration / 1000)}s`);
    console.log(`  Status: ${summary.status}`);
  });
  
  driver.on('disconnected', () => {
    console.log('Device disconnected');
  });
  
  driver.on('error', (error) => {
    console.error('Error:', error.message);
  });
  
  try {
    console.log('\nInitializing driver...');
    await driver.init();
    console.log('Status after init:', driver.getStatus());
    
    console.log('\nStarting measurements...');
    await driver.start();
    console.log('Status after start:', driver.getStatus());
    
    await new Promise(resolve => driver.on('measurement-complete', resolve));
    
    const measurements = driver.getMeasurements();
    console.log(`\nTotal measurements collected: ${measurements.length}`);
    
    await driver.disconnect();
    console.log('\nSmoke test PASSED');
    
  } catch (error) {
    console.error('\nSmoke test FAILED:', error);
    process.exit(1);
  }
}

main();
