/**
 * Простая демонстрация эмулятора ELM327
 */

import { ELM327EmulatorTransport, VEHICLE_PROFILES } from './ELM327Emulator.js';

async function simpleDemo() {
  console.log('🚗 ELM327 Emulator Demo');

  const emulator = new ELM327EmulatorTransport({
    vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
    responseDelay: 100,
    customDtcCodes: ['P0171', 'P0420']
  });

  console.log('\n1. Opening transport...');
  await emulator.open();
  console.log('✅ Transport opened');

  // Базовые AT команды
  const atCommands = ['ATZ', 'ATE0', 'ATL0', 'ATDP'];

  for (const cmd of atCommands) {
    console.log(`\n2. Sending: ${cmd}`);

    const responses = [];
    emulator.onData((data) => {
      responses.push(data);
    });

    await emulator.write(cmd);
    await new Promise(resolve => setTimeout(resolve, 200));

    if (responses.length > 0) {
      console.log(`   Response: ${responses[0].trim()}`);
    } else {
      console.log('   No response');
    }
  }

  // OBD команды
  const obdCommands = ['010C', '03', '04'];

  for (const cmd of obdCommands) {
    console.log(`\n3. Sending OBD: ${cmd}`);

    const responses = [];
    emulator.onData((data) => {
      responses.push(data);
    });

    await emulator.write(cmd);
    await new Promise(resolve => setTimeout(resolve, 200));

    if (responses.length > 0) {
      console.log(`   Response: ${responses[0].trim()}`);
    } else {
      console.log('   No response');
    }
  }

  console.log('\n4. Checking emulator stats:');
  const stats = emulator.getStats();
  console.log(`   RPM: ${stats.currentState.rpm}`);
  console.log(`   Speed: ${stats.currentState.speed} km/h`);
  console.log(`   Temperature: ${stats.currentState.coolantTemp}°C`);
  console.log(`   DTC codes: ${stats.dtcCodes.join(', ')}`);

  await emulator.close();
  console.log('\n✅ Demo completed');
}

simpleDemo().catch(console.error);
