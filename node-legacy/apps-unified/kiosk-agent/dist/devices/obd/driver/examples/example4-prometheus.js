/**
 * Example: Prometheus Metrics Integration
 * Demonstrates how to integrate OBD driver metrics with Prometheus monitoring
 */
import { Elm327Driver } from '../Elm327Driver.js';
import { createObdPrometheusCollector } from '../prometheus.js';
import { ObdStatus } from '../DeviceObd.js';
import express from 'express';
import { Registry } from 'prom-client';
async function main() {
    const driver = new Elm327Driver();
    const app = express();
    driver.on('connected', () => {
        console.log('OBD adapter connected');
    });
    driver.on('error', (error) => {
        console.error('OBD error:', error);
    });
    driver.on('status-change', (status) => {
        console.log('Status changed:', status);
    });
    await driver.init({
        transport: 'serial',
        port: process.env.AGENT_ENV === 'DEV' ? 'MOCK' : 'COM3',
        baudRate: 38400,
        timeout: 5000,
        retries: 3,
    });
    const register = new Registry();
    const collector = createObdPrometheusCollector(driver, { register });
    setInterval(() => {
        collector.update();
    }, 5000);
    app.get('/metrics', async (_req, res) => {
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        }
        catch (error) {
            res.status(500).send('Error collecting metrics');
        }
    });
    app.get('/health', (_req, res) => {
        const status = driver.getStatus();
        const metrics = driver.getMetrics();
        res.json({
            status,
            metrics,
            healthy: status === ObdStatus.READY || status === ObdStatus.IDLE,
        });
    });
    const server = app.listen(9090, () => {
        console.log('Metrics server listening on port 9090');
        console.log('Metrics: http://localhost:9090/metrics');
        console.log('Health: http://localhost:9090/health');
    });
    setInterval(async () => {
        try {
            const rpm = await driver.readPid('0C');
            const speed = await driver.readPid('0D');
            console.log(`RPM: ${rpm.value}, Speed: ${speed.value} km/h`);
        }
        catch (error) {
            console.error('Error reading PIDs:', error);
        }
    }, 2000);
    process.on('SIGINT', async () => {
        console.log('Shutting down...');
        server.close();
        await driver.disconnect();
        process.exit(0);
    });
}
main().catch(console.error);
