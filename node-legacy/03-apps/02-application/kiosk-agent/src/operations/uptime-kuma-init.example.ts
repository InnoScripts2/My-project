import { UptimeKumaClient } from './UptimeKumaClient.js';

const uptimeKumaClient = new UptimeKumaClient();
uptimeKumaClient.initClient('http://localhost:3001', process.env.UPTIME_KUMA_TOKEN || '');

const monitor = await uptimeKumaClient.createMonitor({
  name: 'kiosk_001_http',
  type: 'http',
  url: 'http://kiosk-001.local:8080/api/health',
  interval: 60,
  retryInterval: 60,
  maxRetries: 3,
  timeout: 30,
  notificationIds: [],
});

console.log('Monitor created:', monitor.monitorId);
