#!/usr/bin/env node
/**
 * ELM327 Emulator Runner - Запуск эмулятора для тестирования
 * Использование: node emulator-runner.mjs [profile] [port]
 */

import { ELM327EmulatorTransport, VEHICLE_PROFILES } from './ELM327Emulator.js';
import { Elm327Driver } from '../Elm327Driver.js';
import { setTimeout } from 'timers/promises';

const PROFILES = Object.keys(VEHICLE_PROFILES);
const DEFAULT_PROFILE = 'toyota_camry_2015';

function printUsage() {
  console.log('🚗 ELM327 Emulator Runner');
  console.log('');
  console.log('Usage: node emulator-runner.mjs [profile] [options]');
  console.log('');
  console.log('Available profiles:');
  PROFILES.forEach(profile => {
    const info = VEHICLE_PROFILES[profile];
    console.log(`  ${profile} - ${info.make} ${info.model} ${info.year}`);
  });
  console.log('');
  console.log('Options:');
  console.log('  --delay <ms>     Response delay in milliseconds (default: 100)');
  console.log('  --errors <rate>  Error rate 0-1 (default: 0.05)');
  console.log('  --dtc <codes>    Custom DTC codes comma-separated');
  console.log('  --demo           Run interactive demo');
  console.log('  --test           Run comprehensive test suite');
  console.log('  --benchmark      Run performance benchmark');
}

async function runInteractiveDemo(profileName = DEFAULT_PROFILE) {
  console.log(`🏁 Starting interactive demo with ${profileName}`);

  const profile = VEHICLE_PROFILES[profileName];
  const emulator = new ELM327EmulatorTransport({
    vehicleProfile: profile,
    responseDelay: 100,
    customDtcCodes: ['P0171', 'P0420', 'P0301'],
    includeFrameData: true
  });

  const driver = new Elm327Driver({
    transport: emulator,
    timeoutMs: 5000
  });

  try {
    console.log('\n📡 Connecting to emulated adapter...');
    await driver.open();

    console.log('✅ Connected successfully');

    const identity = await driver.identify();
    console.log(`🔍 Adapter identity: ${identity}`);

    console.log('\n🚨 Reading DTC codes...');
    const dtcs = await driver.readDtc();
    if (dtcs.ok && dtcs.data.length > 0) {
      console.log(`Found ${dtcs.data.length} DTC codes:`);
      dtcs.data.forEach((dtc) => {
        console.log(`  - ${dtc.code}: ${dtc.description || 'Unknown'}`);
      });
    } else {
      console.log('✅ No DTC codes found');
    }

    console.log('\n📊 Reading live PIDs...');
    const pidTests = [
      { pid: '0C', name: 'Engine RPM' },
      { pid: '05', name: 'Coolant Temperature' },
      { pid: '0D', name: 'Vehicle Speed' },
      { pid: '11', name: 'Throttle Position' },
      { pid: '2F', name: 'Fuel Level' }
    ];

    for (const test of pidTests) {
      const result = await driver.readPid(test.pid);
      if (result.ok) {
        console.log(`  ${test.name}: ${result.data.value} ${result.data.unit || ''}`);
      }
    }

    console.log('\n🔧 Clearing DTC codes...');
    const clearResult = await driver.clearDtc();
    if (clearResult.ok) {
      console.log('✅ DTC codes cleared successfully');
    }

    console.log('\n📈 Monitoring parameters for 10 seconds...');
    const startTime = Date.now();
    let readings = 0;

    const monitorInterval = setInterval(async () => {
      try {
        const rpmResult = await driver.readPid('0C');
        if (rpmResult.ok) {
          const stats = emulator.getStats();
          console.log(`  RPM: ${rpmResult.data.value} | Speed: ${stats.currentState.speed.toFixed(1)} km/h | Temp: ${stats.currentState.coolantTemp.toFixed(1)}°C`);
          readings++;
        }
      } catch (error) {
        console.error('  ❌ Reading error:', error.message);
      }
    }, 1000);

    await setTimeout(10000);
    clearInterval(monitorInterval);

    console.log(`\n📊 Monitoring complete: ${readings} successful readings`);

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    await driver.close();
    console.log('👋 Demo finished');
  }
}

async function runTestSuite() {
  console.log('🧪 Running comprehensive test suite...');

  const profiles = Object.keys(VEHICLE_PROFILES);
  let totalTests = 0;
  let passedTests = 0;

  for (const profileName of profiles) {
    console.log(`\n🚗 Testing ${profileName}...`);
    const profile = VEHICLE_PROFILES[profileName];

    const emulator = new ELM327EmulatorTransport({
      vehicleProfile: profile,
      responseDelay: 50,
      customDtcCodes: profile.commonDtcCodes
    });

    const driver = new Elm327Driver({
      transport: emulator,
      timeoutMs: 3000
    });

    try {
      totalTests++;
      await driver.open();

      // Test 1: Connection
      const identity = await driver.identify();
      console.log(`  ✅ Connection: ${identity}`);

      // Test 2: DTCs
      const dtcs = await driver.readDtc();
      console.log(`  ✅ DTCs: ${dtcs.ok ? dtcs.data.length : 'Error'} codes`);

      // Test 3: PIDs
      let pidCount = 0;
      for (const pid of profile.supportedPids.slice(0, 5)) {
        const result = await driver.readPid(pid);
        if (result.ok) pidCount++;
      }
      console.log(`  ✅ PIDs: ${pidCount}/5 readable`);

      // Test 4: Clear DTCs
      const clearResult = await driver.clearDtc();
      console.log(`  ✅ Clear DTCs: ${clearResult.ok ? 'Success' : 'Failed'}`);

      passedTests++;

    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    } finally {
      await driver.close();
    }
  }

  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} profiles passed`);
  return passedTests === totalTests;
}

async function runBenchmark() {
  console.log('⚡ Running performance benchmark...');

  const emulator = new ELM327EmulatorTransport({
    vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
    responseDelay: 10 // Fast responses
  });

  const driver = new Elm327Driver({
    transport: emulator,
    timeoutMs: 2000
  });

  try {
    await driver.open();

    const tests = [
      { name: 'DTC Reading', iterations: 10, operation: () => driver.readDtc() },
      { name: 'PID Reading (RPM)', iterations: 50, operation: () => driver.readPid('0C') },
      { name: 'PID Reading (Temperature)', iterations: 50, operation: () => driver.readPid('05') },
      { name: 'Identity Check', iterations: 20, operation: () => driver.identify() }
    ];

    for (const test of tests) {
      console.log(`\n🔄 ${test.name} (${test.iterations} iterations)...`);

      const startTime = Date.now();
      let successCount = 0;

      for (let i = 0; i < test.iterations; i++) {
        try {
          const result = await test.operation();
          if (result && result.ok !== false) {
            successCount++;
          }
        } catch (error) {
          // Count failures
        }
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / test.iterations;
      const successRate = (successCount / test.iterations * 100).toFixed(1);

      console.log(`  ⏱️  Average time: ${avgTime.toFixed(2)}ms`);
      console.log(`  ✅ Success rate: ${successRate}%`);
      console.log(`  📊 Total time: ${duration}ms`);
    }

  } finally {
    await driver.close();
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const profileArg = args.find(arg => PROFILES.includes(arg)) || DEFAULT_PROFILE;

try {
  if (args.includes('--demo')) {
    await runInteractiveDemo(profileArg);
  } else if (args.includes('--test')) {
    const success = await runTestSuite();
    process.exit(success ? 0 : 1);
  } else if (args.includes('--benchmark')) {
    await runBenchmark();
  } else {
    printUsage();
    console.log('\n🚀 Quick start:');
    console.log('  node emulator-runner.mjs --demo          # Interactive demo');
    console.log('  node emulator-runner.mjs --test          # Test all profiles');
    console.log('  node emulator-runner.mjs --benchmark     # Performance test');
  }
} catch (error) {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
}
