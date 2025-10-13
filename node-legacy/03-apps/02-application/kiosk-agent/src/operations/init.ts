import Database from 'better-sqlite3';
import { Registry } from 'prom-client';
import { initializeOperationsTables } from './schema.js';
import { SqliteDatabaseAdapter } from './database-adapter.js';
import { createOperationsRoutes } from './routes.js';
import { createOperationsMetrics, OperationsMetricsService } from './metrics.js';

export interface OperationsConfig {
  dbPath?: string;
  metricsRegistry?: Registry;
}

export function initializeOperations(config: OperationsConfig = {}) {
  const dbPath = config.dbPath || './kiosk-agent.db';
  
  const db = new Database(dbPath);
  
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  initializeOperationsTables(db);
  
  const dbAdapter = new SqliteDatabaseAdapter(db);
  
  let metricsService: OperationsMetricsService | undefined;
  if (config.metricsRegistry) {
    const metrics = createOperationsMetrics(config.metricsRegistry);
    metricsService = new OperationsMetricsService(metrics);
  }
  
  const operationsRouter = createOperationsRoutes(dbAdapter, metricsService);
  
  return {
    router: operationsRouter,
    db,
    dbAdapter,
    metricsService,
    close: () => {
      db.close();
    }
  };
}
