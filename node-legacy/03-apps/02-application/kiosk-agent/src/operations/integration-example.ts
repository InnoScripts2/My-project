/**
 * Example integration of operations module into kiosk-agent
 * 
 * Add this code to src/index.ts after other route imports
 */

// Import operations initialization
import { initializeOperations } from './operations/init.js';

// Initialize operations module with metrics registry
const operations = initializeOperations({
  dbPath: './kiosk-agent.db',
  metricsRegistry: metricsRegistry,
});

// Mount operations routes
app.use('/api', operations.router);

// Cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('[operations] Shutting down...');
  operations.close();
});

process.on('SIGINT', () => {
  console.log('[operations] Shutting down...');
  operations.close();
});

/**
 * Available endpoints after integration:
 * 
 * GET /api/uptime/monitors
 * POST /api/uptime/monitors
 * GET /api/uptime/monitors/:id/status
 * GET /api/sla/uptime
 * GET /api/sla/mttr
 * GET /api/sla/report
 * POST /api/incidents
 * PUT /api/incidents/:id
 * POST /api/incidents/:id/resolve
 * GET /api/incidents
 * GET /api/playbooks
 * GET /api/playbooks/:name
 * GET /api/health/aggregated
 * POST /api/status-page/update
 */
