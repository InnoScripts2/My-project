/**
 * Example 1: Basic initialization and DTC reading
 *
 * This example demonstrates:
 * - Initializing the driver
 * - Reading diagnostic trouble codes
 * - Handling events
 * - Proper cleanup
 */
import { Elm327Driver } from '../Elm327Driver.js';
async function main() {
    const driver = new Elm327Driver();
    driver.on('connected', () => {
        console.log('OBD adapter connected successfully');
    });
    driver.on('status-change', (status) => {
        console.log('Status changed to:', status);
    });
    driver.on('error', (error) => {
        console.error('OBD error occurred:', error.message);
    });
    try {
        console.log('Initializing OBD adapter...');
        await driver.init({
            transport: 'serial',
            port: 'COM3', // Change to your port (e.g., /dev/ttyUSB0 on Linux)
            baudRate: 38400,
            timeout: 5000,
            retries: 3,
        });
        console.log('Reading diagnostic trouble codes...');
        const dtcList = await driver.readDtc();
        if (dtcList.length === 0) {
            console.log('No diagnostic trouble codes found');
        }
        else {
            console.log(`Found ${dtcList.length} diagnostic trouble codes:`);
            dtcList.forEach((dtc, index) => {
                console.log(`${index + 1}. ${dtc.code} (${dtc.category})`);
                if (dtc.description) {
                    console.log(`   Description: ${dtc.description}`);
                }
            });
        }
        console.log('\nDriver metrics:');
        const metrics = driver.getMetrics();
        console.log(`Total commands: ${metrics.totalCommands}`);
        console.log(`Successful: ${metrics.successfulCommands}`);
        console.log(`Failed: ${metrics.failedCommands}`);
        console.log(`Average latency: ${metrics.averageLatencyMs.toFixed(2)}ms`);
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
    }
    finally {
        console.log('Disconnecting...');
        await driver.disconnect();
        console.log('Disconnected');
    }
}
main().catch(console.error);
