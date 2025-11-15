/**
 * Аналитический сервис на базе DuckDB
 * 
 * Предоставляет SQL OLAP движок для анализа данных киосков
 */

import Database from 'duckdb';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import {
  DataSource,
  LoadResult,
  QueryResult,
  SessionsFilter,
  SessionsReport,
  RevenueFilter,
  RevenueReport,
  ErrorsFilter,
  ErrorsReport,
} from './types.js';
import { QueryBuilder } from './QueryBuilder.js';
import { Counter, Histogram, Registry } from 'prom-client';

export class AnalyticsService {
  private db?: Database.Database;
  private conn?: any;
  private dbPath: string = ':memory:';
  private queryBuilder: QueryBuilder;
  private metrics: {
    queriesTotal: Counter<string>;
    queryDuration: Histogram<string>;
    aggregationsTotal: Counter<string>;
  };

  constructor(registry?: Registry) {
    this.queryBuilder = new QueryBuilder();
    
    // Инициализация метрик
    this.metrics = {
      queriesTotal: new Counter({
        name: 'analytics_queries_total',
        help: 'Total number of analytics queries',
        labelNames: ['query_type', 'success'],
        registers: registry ? [registry] : undefined,
      }),
      queryDuration: new Histogram({
        name: 'analytics_query_duration_seconds',
        help: 'Duration of analytics queries',
        labelNames: ['query_type'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
        registers: registry ? [registry] : undefined,
      }),
      aggregationsTotal: new Counter({
        name: 'analytics_aggregations_total',
        help: 'Total number of analytics aggregations',
        labelNames: ['success'],
        registers: registry ? [registry] : undefined,
      }),
    };
  }

  /**
   * Инициализация DuckDB database
   */
  async initDatabase(dbPath?: string): Promise<void> {
    if (dbPath) {
      this.dbPath = dbPath;
      
      // Создать директорию если не существует
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    return new Promise((resolve, reject) => {
      this.db = new Database.Database(this.dbPath, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }

        this.conn = this.db!.connect();
        
        // Создать схему
        this.createSchema()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * Создание схемы таблиц
   */
  private async createSchema(): Promise<void> {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR PRIMARY KEY,
        created_at TIMESTAMP,
        completed_at TIMESTAMP,
        type VARCHAR,
        status VARCHAR,
        device VARCHAR
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        payment_id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        amount DECIMAL,
        status VARCHAR,
        created_at TIMESTAMP,
        confirmed_at TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS reports (
        report_id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        type VARCHAR,
        generated_at TIMESTAMP,
        delivered BOOLEAN
      )`,
      `CREATE TABLE IF NOT EXISTS obd_dtc (
        id INTEGER PRIMARY KEY,
        session_id VARCHAR,
        dtc_code VARCHAR,
        description VARCHAR,
        severity VARCHAR,
        occurred_at TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS thickness_measurements (
        id INTEGER PRIMARY KEY,
        session_id VARCHAR,
        zone VARCHAR,
        value DECIMAL,
        measured_at TIMESTAMP
      )`,
    ];

    const runAsync = promisify(this.conn.run.bind(this.conn));
    
    for (const schema of schemas) {
      await runAsync(schema);
    }
  }

  /**
   * Загрузка данных из источников
   */
  async loadData(sources: DataSource[]): Promise<LoadResult> {
    const startTime = Date.now();
    const loadedTables: string[] = [];
    const errors: string[] = [];
    let totalLoaded = 0;

    for (const source of sources) {
      try {
        const loaded = await this.loadSingleSource(source);
        loadedTables.push(source.tableName);
        totalLoaded += loaded;
      } catch (error) {
        errors.push(`Failed to load ${source.name}: ${error}`);
      }
    }

    return {
      loaded: totalLoaded,
      tables: loadedTables,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Загрузка одного источника данных
   */
  private async loadSingleSource(source: DataSource): Promise<number> {
    const runAsync = promisify(this.conn.run.bind(this.conn));
    const allAsync = promisify(this.conn.all.bind(this.conn));

    if (!fs.existsSync(source.path)) {
      throw new Error(`Source file not found: ${source.path}`);
    }

    switch (source.type) {
      case 'sqlite':
        // Attach SQLite database and copy data
        await runAsync(`ATTACH '${source.path}' AS source_db`);
        await runAsync(`INSERT INTO ${source.tableName} SELECT * FROM source_db.${source.tableName}`);
        await runAsync(`DETACH source_db`);
        break;

      case 'csv':
        // Load from CSV
        await runAsync(
          `COPY ${source.tableName} FROM '${source.path}' (HEADER, DELIMITER ',')`
        );
        break;

      case 'json':
        // Load from JSON
        await runAsync(
          `INSERT INTO ${source.tableName} SELECT * FROM read_json_auto('${source.path}')`
        );
        break;

      case 'parquet':
        // Load from Parquet
        await runAsync(
          `INSERT INTO ${source.tableName} SELECT * FROM read_parquet('${source.path}')`
        );
        break;

      default:
        throw new Error(`Unsupported source type: ${source.type}`);
    }

    // Получить количество загруженных строк
    const result = await allAsync(`SELECT COUNT(*) as count FROM ${source.tableName}`);
    return result[0]?.count || 0;
  }

  /**
   * Выполнение SQL запроса
   */
  async executeQuery(sql: string, params: any[] = []): Promise<QueryResult> {
    const startTime = Date.now();
    const allAsync = promisify(this.conn.all.bind(this.conn));

    try {
      const rows = await allAsync(sql, ...params);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        rows,
        columns,
        rowCount: rows.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error}`);
    }
  }

  /**
   * Получить отчёт по сессиям
   */
  async getSessionsReport(filter: SessionsFilter): Promise<SessionsReport[]> {
    const queryType = 'sessions';
    const timer = this.metrics.queryDuration.startTimer({ query_type: queryType });

    try {
      const sql = this.queryBuilder.buildSessionsQuery(filter);
      const params = this.buildSessionsParams(filter);
      const result = await this.executeQuery(sql, params);

      this.metrics.queriesTotal.labels(queryType, 'true').inc();
      timer();

      return result.rows.map((row: any) => ({
        period: row.period,
        totalSessions: row.total_sessions,
        completedSessions: row.completed_sessions,
        incompleteSessions: row.incomplete_sessions,
        byType: {
          THICKNESS: row.thickness_sessions || 0,
          DIAGNOSTICS: row.diagnostics_sessions || 0,
        },
        avgDuration: row.avg_duration_seconds || 0,
      }));
    } catch (error) {
      this.metrics.queriesTotal.labels(queryType, 'false').inc();
      timer();
      throw error;
    }
  }

  /**
   * Получить отчёт по выручке
   */
  async getRevenueReport(filter: RevenueFilter): Promise<RevenueReport[]> {
    const queryType = 'revenue';
    const timer = this.metrics.queryDuration.startTimer({ query_type: queryType });

    try {
      const sql = this.queryBuilder.buildRevenueQuery(filter);
      const params = [filter.startDate, filter.endDate];
      const result = await this.executeQuery(sql, params);

      this.metrics.queriesTotal.labels(queryType, 'true').inc();
      timer();

      return result.rows.map((row: any) => ({
        period: row.period,
        totalRevenue: row.total_revenue || 0,
        byService: {
          THICKNESS: row.thickness_revenue || 0,
          DIAGNOSTICS: row.diagnostics_revenue || 0,
        },
        avgTransactionValue: row.avg_transaction_value || 0,
        failedPayments: row.failed_payments || 0,
        failureRate: row.failure_rate || 0,
      }));
    } catch (error) {
      this.metrics.queriesTotal.labels(queryType, 'false').inc();
      timer();
      throw error;
    }
  }

  /**
   * Получить отчёт по ошибкам
   */
  async getErrorsReport(filter: ErrorsFilter): Promise<ErrorsReport> {
    const queryType = 'errors';
    const timer = this.metrics.queryDuration.startTimer({ query_type: queryType });

    try {
      const sql = this.queryBuilder.buildErrorsQuery(filter);
      const params = [
        filter.startDate,
        filter.endDate,
        filter.severity || null,
        filter.limit || 100,
      ];
      const result = await this.executeQuery(sql, params);

      // Получить статистику по устройствам
      const deviceStatsSql = `
        SELECT 
          'obd' as device,
          COUNT(*) as count
        FROM obd_dtc
        WHERE occurred_at >= ? AND occurred_at <= ?
        UNION ALL
        SELECT 
          'thickness' as device,
          COUNT(*) as count
        FROM thickness_measurements
        WHERE measured_at >= ? AND measured_at <= ?
      `;
      const deviceStats = await this.executeQuery(deviceStatsSql, [
        filter.startDate,
        filter.endDate,
        filter.startDate,
        filter.endDate,
      ]);

      const byDevice = {
        obd: 0,
        thickness: 0,
      };

      for (const stat of deviceStats.rows) {
        if (stat.device === 'obd') {
          byDevice.obd = stat.count;
        } else if (stat.device === 'thickness') {
          byDevice.thickness = stat.count;
        }
      }

      this.metrics.queriesTotal.labels(queryType, 'true').inc();
      timer();

      return {
        topErrors: result.rows.map((row: any) => ({
          code: row.code,
          description: row.description,
          count: row.count,
          severity: row.severity,
        })),
        totalErrors: result.rows.reduce((sum: number, row: any) => sum + row.count, 0),
        byDevice,
      };
    } catch (error) {
      this.metrics.queriesTotal.labels(queryType, 'false').inc();
      timer();
      throw error;
    }
  }

  /**
   * Построение параметров для запроса сессий
   */
  private buildSessionsParams(filter: SessionsFilter): any[] {
    return [
      filter.startDate,
      filter.endDate,
      filter.type || null,
      filter.type || null,
      filter.status || null,
      filter.status || null,
    ];
  }

  /**
   * Закрыть соединение
   */
  async close(): Promise<void> {
    if (this.conn) {
      const closeAsync = promisify(this.conn.close.bind(this.conn));
      await closeAsync();
    }
    if (this.db) {
      const closeAsync = promisify(this.db.close.bind(this.db));
      await closeAsync();
    }
  }
}
