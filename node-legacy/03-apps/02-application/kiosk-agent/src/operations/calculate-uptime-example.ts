import { SLAManager } from './SLAManager.js';
import Database from 'better-sqlite3';

const db = new Database('kiosk-agent.db');

const dbAdapter = {
  query: async (sql: string, params: any[]) => {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  insert: async (table: string, data: any) => {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);
    const result = stmt.run(...Object.values(data));
    return { id: result.lastInsertRowid, ...data };
  },
};

const slaManager = new SLAManager(dbAdapter);

const uptimeReport = await slaManager.calculateUptime('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

console.log('Uptime percentage:', uptimeReport.uptimePercentage);
console.log('SLA met:', uptimeReport.slaMet);
console.log('Incidents count:', uptimeReport.incidentsCount);
console.log('Downtime (seconds):', uptimeReport.downtime);
