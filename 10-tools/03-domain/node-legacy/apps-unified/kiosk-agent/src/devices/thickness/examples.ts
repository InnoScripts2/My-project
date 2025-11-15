/**
 * Usage example for ThicknessDriver
 * Demonstrates basic workflow and event handling
 */

import { ThicknessDriver } from './driver/ThicknessDriver.js';
import { ThicknessStatus } from './models/Measurement.js';
import type { MeasurementPoint } from './models/Measurement.js';

async function exampleUsage() {
  process.env.AGENT_ENV = 'DEV';

  const driver = new ThicknessDriver({
    targetDeviceName: 'TH_Sensor',
    totalZones: 60,
  });

  driver.on('device-detected', (info) => {
    console.log('Device found:', info.name, `(${info.rssi} dBm)`);
  });

  driver.on('connected', () => {
    console.log('Connected to device');
  });

  driver.on('measurement-received', (point: MeasurementPoint) => {
    const status = point.isNormal ? 'OK' : 'WARNING';
    console.log(`[${status}] ${point.zoneName}: ${point.value} µm`);
  });

  driver.on('measurement-complete', (summary: { measurements: MeasurementPoint[]; measuredZones: number; totalZones: number; duration: number; status: ThicknessStatus }) => {
    console.log('\nMeasurement Summary:');
    console.log(`  Total zones: ${summary.measuredZones}/${summary.totalZones}`);
    console.log(`  Duration: ${Math.round(summary.duration / 1000)}s`);
    console.log(`  Status: ${summary.status}`);

  const abnormal = summary.measurements.filter((m: MeasurementPoint) => !m.isNormal);
    if (abnormal.length > 0) {
      console.log(`\nAbnormal zones detected: ${abnormal.length}`);
      abnormal.forEach((m: MeasurementPoint) => {
        console.log(`  - ${m.zoneName}: ${m.value} µm`);
      });
    }
  });

  driver.on('error', (error) => {
    console.error('Error:', error.message);
  });

  try {
    await driver.init();
    console.log('Status:', driver.getStatus());

    await driver.start();

    await new Promise(resolve =>
      driver.on('measurement-complete', resolve)
    );

    await driver.disconnect();
    console.log('Driver disconnected');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

async function exampleWithProgress() {
  process.env.AGENT_ENV = 'DEV';

  const driver = new ThicknessDriver({
    targetDeviceName: 'TH_Sensor',
    totalZones: 40,
  });

  let lastPercent = 0;
  driver.on('measurement-progress', (progress: { percent: number; measured: number; total: number }) => {
    if (progress.percent !== lastPercent) {
      console.log(`Progress: ${progress.percent}% (${progress.measured}/${progress.total})`);
      lastPercent = progress.percent;
    }
  });

  driver.on('measurement-complete', (summary: { duration: number; measurements: MeasurementPoint[] }) => {
    console.log(`\nCompleted in ${Math.round(summary.duration / 1000)}s`);

  const avgThickness = summary.measurements.reduce((sum: number, m: MeasurementPoint) => sum + m.value, 0) / summary.measurements.length;
    console.log(`Average thickness: ${Math.round(avgThickness)} µm`);
  });

  await driver.init();
  await driver.start();
  await new Promise(resolve => driver.on('measurement-complete', resolve));
  await driver.disconnect();
}

async function exampleWithDisconnectHandling() {
  process.env.AGENT_ENV = 'DEV';

  const driver = new ThicknessDriver({
    targetDeviceName: 'TH_Sensor',
    autoReconnect: true,
    maxReconnectAttempts: 3,
  });

  driver.on('disconnected', () => {
    console.warn('Device disconnected! Saving partial data...');

    const measurements = driver.getMeasurements();
    console.log(`Partial measurements saved: ${measurements.length} points`);

  });

  driver.on('connected', () => {
    console.log('Device reconnected successfully');
  });

  await driver.init();
  await driver.start();
  await new Promise(resolve => driver.on('measurement-complete', resolve));
  await driver.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().then(() => {
    console.log('\nExample completed successfully');
  }).catch(err => {
    console.error('\nExample failed:', err);
    process.exit(1);
  });
}

export {
  exampleUsage,
  exampleWithProgress,
  exampleWithDisconnectHandling,
};
