/**
 * Example 3: Clear DTCs with confirmation
 * 
 * This example demonstrates:
 * - Reading DTCs first
 * - User confirmation (simulated)
 * - Clearing DTCs
 * - Verifying clearance
 */

import { Elm327Driver } from '../Elm327Driver.js';

async function askUserConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n${message} (y/n)`);
    setTimeout(() => {
      const confirmed = true;
      console.log(confirmed ? 'User confirmed: YES' : 'User declined: NO');
      resolve(confirmed);
    }, 1000);
  });
}

async function main() {
  const driver = new Elm327Driver();

  driver.on('dtc-cleared', (success: boolean) => {
    console.log(`DTCs cleared: ${success ? 'SUCCESS' : 'FAILED'}`);
  });

  try {
    console.log('Connecting to OBD adapter...');
    await driver.init({
      transport: 'serial',
      port: 'COM3',
      baudRate: 38400,
    });

    console.log('Reading current DTCs...');
    const dtcsBefore = await driver.readDtc();

    if (dtcsBefore.length === 0) {
      console.log('No DTCs found. Nothing to clear.');
      return;
    }

    console.log(`\nFound ${dtcsBefore.length} DTC(s):`);
    dtcsBefore.forEach((dtc, index) => {
      console.log(`  ${index + 1}. ${dtc.code} - ${dtc.description || 'Unknown'}`);
    });

    const userConfirmed = await askUserConfirmation(
      '\nAre you sure you want to clear all DTCs?'
    );

    if (!userConfirmed) {
      console.log('Operation cancelled by user');
      return;
    }

    console.log('\nClearing DTCs...');
    const success = await driver.clearDtc();

    if (success) {
      console.log('DTCs cleared successfully');

      console.log('\nVerifying clearance...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const dtcsAfter = await driver.readDtc();
      console.log(`DTCs after clearing: ${dtcsAfter.length}`);

      if (dtcsAfter.length === 0) {
        console.log('Verification: All DTCs successfully cleared');
      } else {
        console.warn('Warning: Some DTCs remain:');
        dtcsAfter.forEach((dtc) => {
          console.log(`  - ${dtc.code}`);
        });
      }
    } else {
      console.error('Failed to clear DTCs');
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await driver.disconnect();
  }
}

main().catch(console.error);
