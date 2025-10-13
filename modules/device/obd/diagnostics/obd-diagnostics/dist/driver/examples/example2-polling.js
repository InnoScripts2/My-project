/**
 * Example 2: Periodic PID polling
 *
 * This example demonstrates:
 * - Continuous PID monitoring
 * - Handling multiple PIDs
 * - Error recovery
 * - Graceful shutdown
 */
import { Elm327Driver } from '../Elm327Driver.js';
async function main() {
    const driver = new Elm327Driver();
    driver.on('connected', () => {
        console.log('Connected to OBD adapter');
    });
    driver.on('pid-read', (value) => {
        console.log(`PID ${value.pid}: ${value.value.toFixed(2)} ${value.unit}`);
    });
    try {
        await driver.init({
            transport: 'serial',
            port: 'COM3',
            baudRate: 38400,
        });
        console.log('Starting PID polling (press Ctrl+C to stop)...\n');
        let pollCount = 0;
        const maxPolls = 60; // Poll for 60 seconds
        const pollInterval = setInterval(async () => {
            try {
                const rpm = await driver.readPid('0C');
                const speed = await driver.readPid('0D');
                const coolantTemp = await driver.readPid('05');
                const throttle = await driver.readPid('11');
                console.log(`\n[Poll ${pollCount + 1}] ${new Date().toLocaleTimeString()}`);
                console.log(`  RPM: ${rpm.value.toFixed(0)} ${rpm.unit}`);
                console.log(`  Speed: ${speed.value.toFixed(0)} ${speed.unit}`);
                console.log(`  Coolant: ${coolantTemp.value.toFixed(1)} ${coolantTemp.unit}`);
                console.log(`  Throttle: ${throttle.value.toFixed(1)} ${throttle.unit}`);
                pollCount++;
                if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                    console.log('\nPolling complete');
                    await driver.disconnect();
                    process.exit(0);
                }
            }
            catch (error) {
                console.error('Polling error:', error instanceof Error ? error.message : String(error));
            }
        }, 1000);
        process.on('SIGINT', async () => {
            console.log('\n\nStopping polling...');
            clearInterval(pollInterval);
            await driver.disconnect();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        await driver.disconnect();
        process.exit(1);
    }
}
main().catch(console.error);
