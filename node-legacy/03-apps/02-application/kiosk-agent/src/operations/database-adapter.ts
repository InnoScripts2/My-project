import Database from 'better-sqlite3';

interface DatabaseAdapter {
  query(sql: string, params: any[]): Promise<any[]>;
  insert(table: string, data: any): Promise<any>;
  update(table: string, id: string, data: any): Promise<void>;
  findById(table: string, id: string): Promise<any>;
}

export class SqliteDatabaseAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async query(sql: string, params: any[]): Promise<any[]> {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async insert(table: string, data: any): Promise<any> {
    try {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...Object.values(data));
      return { id: result.lastInsertRowid, ...data };
    } catch (error) {
      console.error('Insert error:', error);
      throw error;
    }
  }

  async update(table: string, id: string, data: any): Promise<void> {
    try {
      const keys = Object.keys(data);
      const setClause = keys.map((k) => `${k} = ?`).join(', ');
      const idColumn = table === 'incidents' ? 'incident_id' : 'id';
      const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`;
      const stmt = this.db.prepare(sql);
      stmt.run(...Object.values(data), id);
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  }

  async findById(table: string, id: string): Promise<any> {
    try {
      const idColumn = table === 'incidents' ? 'incident_id' : 'id';
      const sql = `SELECT * FROM ${table} WHERE ${idColumn} = ?`;
      const stmt = this.db.prepare(sql);
      return stmt.get(id);
    } catch (error) {
      console.error('FindById error:', error);
      throw error;
    }
  }
}
