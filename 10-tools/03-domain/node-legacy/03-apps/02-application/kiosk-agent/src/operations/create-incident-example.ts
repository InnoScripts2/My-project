import { IncidentManager } from './IncidentManager.js';
import { OpenStatusClient } from './OpenStatusClient.js';
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
  update: async (table: string, id: string, data: any) => {
    const keys = Object.keys(data);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE incident_id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(...Object.values(data), id);
  },
  findById: async (table: string, id: string) => {
    const sql = `SELECT * FROM ${table} WHERE incident_id = ?`;
    const stmt = db.prepare(sql);
    return stmt.get(id);
  },
};

const openStatusClient = new OpenStatusClient();
openStatusClient.initClient(
  process.env.OPENSTATUS_API_URL || '',
  process.env.OPENSTATUS_API_KEY || ''
);

const slaManager = new SLAManager(dbAdapter);
const incidentManager = new IncidentManager(dbAdapter, openStatusClient, slaManager);

const incident = await incidentManager.createIncident({
  title: 'Kiosk 001 OBD device unavailable',
  description: 'OBD-II адаптер не отвечает на команды',
  severity: 'critical',
  affectedServices: ['OBD Diagnostics'],
  status: 'investigating',
  startedAt: new Date().toISOString(),
});

console.log('Incident created:', incident.incidentId);
