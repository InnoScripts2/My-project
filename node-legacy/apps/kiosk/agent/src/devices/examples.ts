/**
 * Comprehensive usage examples for device drivers
 * Demonstrates integration of OBD-II and thickness gauge
 */

import { Elm327Driver } from './obd/Elm327Driver.js';
import { ThicknessDriver } from './thickness/driver/ThicknessDriver.js';
import { getHealthService } from './health-service.js';
import { sedanZones } from './thickness/database/zones.js';
import { dtcDatabase } from './obd/database/DtcDatabase.js';

/**
 * Example 1: OBD-II Diagnostic Session
 */
export async function exampleObdDiagnostic() {
  const driver = new Elm327Driver();

  // Setup event listeners
  driver.on('connected', () => {
    console.log('OBD adapter connected');
  });

  driver.on('error', (error) => {
    console.error('OBD error:', error);
  });

  try {
    // Connect to adapter
    await driver.init({
      transport: 'serial',
      port: '/dev/ttyUSB0',
      baudRate: 38400,
      timeout: 5000,
    });

    // Read diagnostic trouble codes
    const dtcCodes = await driver.readDtc();
    console.log(`Found ${dtcCodes.length} DTC codes`);

    for (const dtc of dtcCodes) {
      const info = dtcDatabase.getDtcInfo(dtc.code);
      console.log(`${dtc.code}: ${info?.description || 'Unknown'}`);
      console.log(`  Category: ${dtc.category}`);
      console.log(`  Severity: ${info?.severity || 'unknown'}`);
    }

    // Read live data
    const rpm = await driver.readPid('rpm');
    console.log(`Engine RPM: ${rpm.value} ${rpm.unit}`);

    const speed = await driver.readPid('vss');
    console.log(`Vehicle Speed: ${speed.value} ${speed.unit}`);

    const coolantTemp = await driver.readPid('temp');
    console.log(`Coolant Temp: ${coolantTemp.value} ${coolantTemp.unit}`);

    // Clear DTC if requested
    // await driver.clearDtc();

    // Check health status
    const health = driver.getHealthStatus();
    console.log('Health Status:', {
      connected: health.connected,
      successRate: (health.metrics.successRate * 100).toFixed(2) + '%',
      avgResponseTime: health.metrics.avgResponseTime.toFixed(2) + 'ms',
    });
  } finally {
    await driver.disconnect();
  }
}

/**
 * Example 2: Thickness Gauge Measurement
 */
export async function exampleThicknessMeasurement() {
  const driver = new ThicknessDriver();

  // Setup event listeners
  driver.on('device_detected', (info) => {
    console.log('Device detected:', info);
  });

  driver.on('connected', () => {
    console.log('Thickness gauge connected');
  });

  driver.on('measurement_received', (measurement) => {
    console.log(
      `Zone ${measurement.zoneId} (${measurement.zoneName}): ${measurement.value} ${measurement.unit}`
    );

    // Check if thickness is normal
    const zone = sedanZones.getZone(measurement.zoneId);
    if (zone) {
      const isNormal = sedanZones.isThicknessNormal(measurement.zoneId, measurement.value);
      const deviation = sedanZones.getDeviation(measurement.zoneId, measurement.value);
      console.log(
        `  Normal: ${isNormal}, Deviation: ${deviation > 0 ? '+' : ''}${deviation} μm`
      );
    }
  });

  driver.on('measurement_complete', (summary) => {
    console.log('Measurements complete!');
    console.log(`Total zones measured: ${summary.measuredZones}`);
  });

  try {
    // Connect to device (DEV mode simulation)
    if (process.env.AGENT_ENV === 'DEV') {
      await driver.init({
        deviceName: 'TH_Sensor',
        totalZones: 40,
        connectionTimeout: 10000,
      });

      console.log('Ready to measure. In production, start measuring with:');
      console.log('await driver.startMeasuring();');
    } else {
      await driver.init({
        deviceName: 'TH_Sensor',
        deviceAddress: 'XX:XX:XX:XX:XX:XX', // Replace with real address
        totalZones: 40,
      });

      await driver.startMeasuring();

      // Wait for completion
      await new Promise<void>((resolve) => {
        driver.once('measurement_complete', () => resolve());
      });

      // Get all measurements
      const measurements = driver.getMeasurements();
      console.log(`Total measurements: ${measurements.length}`);

      // Analyze results
      const suspicious = measurements.filter((m) => {
        const zone = sedanZones.getZone(m.zoneId);
        if (!zone) return false;
        const deviation = Math.abs(m.value - zone.standardThickness.typical);
        return deviation > 50;
      });

      console.log(`Suspicious zones: ${suspicious.length}`);
    }
  } finally {
    await driver.disconnect();
  }
}

/**
 * Example 3: Combined Health Check
 */
export async function exampleHealthCheck() {
  const healthService = getHealthService();

  // Get comprehensive health report
  const { healthy, report } = await healthService.checkHealth();

  console.log('System Health:', healthy ? 'HEALTHY' : 'ISSUES DETECTED');
  console.log('\nOBD-II Status:');
  console.log('  Available:', report.obd.available);
  console.log('  Connected:', report.obd.connected);
  console.log('  State:', report.obd.state);
  if (report.obd.lastError) {
    console.log('  Last Error:', report.obd.lastError);
  }
  if (report.obd.metrics) {
    console.log('  Success Rate:', (report.obd.metrics.successRate * 100).toFixed(2) + '%');
    console.log('  Avg Response Time:', report.obd.metrics.avgResponseTime.toFixed(2) + 'ms');
  }

  console.log('\nThickness Gauge Status:');
  console.log('  Available:', report.thickness.available);
  console.log('  Connected:', report.thickness.connected);
  console.log('  State:', report.thickness.state);
  if (report.thickness.progress) {
    console.log(
      '  Progress:',
      `${report.thickness.progress.measuredZones}/${report.thickness.progress.totalZones}`,
      `(${report.thickness.progress.percentage}%)`
    );
  }

  console.log('\nStorage Status:');
  console.log('  Available:', report.storage.available);
  console.log('  Path:', report.storage.path);
  console.log('  OBD Events:', report.storage.events.obd);
  console.log('  Thickness Events:', report.storage.events.thickness);
}

/**
 * Example 4: Error Handling
 */
export async function exampleErrorHandling() {
  const driver = new Elm327Driver();

  driver.on('error', (error) => {
    console.error('Device error:', error);
  });

  try {
    await driver.init({
      transport: 'serial',
      port: '/dev/ttyUSB0',
      baudRate: 38400,
    });

    const dtcCodes = await driver.readDtc();
    console.log('DTC codes:', dtcCodes);
  } catch (error: any) {
    if (error.code === 'device_connection_error') {
      console.error('Failed to connect to device:', error.message);
      console.error('Details:', error.details);
    } else if (error.code === 'device_timeout_error') {
      console.error('Operation timed out:', error.message);
    } else if (error.code === 'device_protocol_error') {
      console.error('Protocol error:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  } finally {
    await driver.disconnect();
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const example = process.argv[2];

  switch (example) {
    case 'obd':
      await exampleObdDiagnostic();
      break;
    case 'thickness':
      await exampleThicknessMeasurement();
      break;
    case 'health':
      await exampleHealthCheck();
      break;
    case 'errors':
      await exampleErrorHandling();
      break;
    default:
      console.log('Usage: node examples.js [obd|thickness|health|errors]');
      break;
  }
}
