/**
 * SQL Query Builder для аналитических запросов
 */
export class QueryBuilder {
    /**
     * Построение запроса для отчёта по сессиям
     */
    buildSessionsQuery(filter) {
        const groupBy = filter.groupBy || 'day';
        const dateFunc = this.getDateTruncFunction(groupBy);
        return `
      SELECT
        ${dateFunc}(created_at) AS period,
        COUNT(*) AS total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
        SUM(CASE WHEN status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete_sessions,
        SUM(CASE WHEN type = 'THICKNESS' THEN 1 ELSE 0 END) AS thickness_sessions,
        SUM(CASE WHEN type = 'DIAGNOSTICS' THEN 1 ELSE 0 END) AS diagnostics_sessions,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_duration_seconds
      FROM sessions
      WHERE created_at >= ? AND created_at <= ?
        AND (? IS NULL OR type = ?)
        AND (? IS NULL OR status = ?)
      GROUP BY period
      ORDER BY period ASC
    `;
    }
    /**
     * Построение запроса для отчёта по выручке
     */
    buildRevenueQuery(filter) {
        const groupBy = filter.groupBy || 'day';
        const dateFunc = this.getDateTruncFunction(groupBy);
        return `
      SELECT
        ${dateFunc}(p.created_at) AS period,
        SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END) AS total_revenue,
        SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'THICKNESS' THEN p.amount ELSE 0 END) AS thickness_revenue,
        SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'DIAGNOSTICS' THEN p.amount ELSE 0 END) AS diagnostics_revenue,
        AVG(CASE WHEN p.status = 'confirmed' THEN p.amount END) AS avg_transaction_value,
        SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
        (SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) AS failure_rate
      FROM payments p
      LEFT JOIN sessions s ON p.session_id = s.session_id
      WHERE p.created_at >= ? AND p.created_at <= ?
      GROUP BY period
      ORDER BY period ASC
    `;
    }
    /**
     * Построение запроса для отчёта по ошибкам
     */
    buildErrorsQuery(filter) {
        return `
      SELECT
        dtc_code AS code,
        description,
        COUNT(*) AS count,
        severity
      FROM obd_dtc
      WHERE occurred_at >= ? AND occurred_at <= ?
        AND (? IS NULL OR severity = ?)
      GROUP BY dtc_code, description, severity
      ORDER BY count DESC
      LIMIT ?
    `;
    }
    /**
     * Построение запроса для трендов
     */
    buildTrendsQuery(filter) {
        const groupBy = filter.groupBy || 'day';
        const dateFunc = this.getDateTruncFunction(groupBy);
        switch (filter.metric) {
            case 'sessions':
                return `
          SELECT
            ${dateFunc}(created_at) AS date,
            COUNT(*) AS value
          FROM sessions
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY date
          ORDER BY date ASC
        `;
            case 'revenue':
                return `
          SELECT
            ${dateFunc}(created_at) AS date,
            SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END) AS value
          FROM payments
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY date
          ORDER BY date ASC
        `;
            case 'errors':
                return `
          SELECT
            ${dateFunc}(occurred_at) AS date,
            COUNT(*) AS value
          FROM obd_dtc
          WHERE occurred_at >= ? AND occurred_at <= ?
          GROUP BY date
          ORDER BY date ASC
        `;
            default:
                throw new Error(`Unsupported metric: ${filter.metric}`);
        }
    }
    /**
     * Получить функцию DATE_TRUNC для группировки
     */
    getDateTruncFunction(groupBy) {
        switch (groupBy) {
            case 'day':
                return "DATE_TRUNC('day', ";
            case 'week':
                return "DATE_TRUNC('week', ";
            case 'month':
                return "DATE_TRUNC('month', ";
            default:
                return "DATE_TRUNC('day', ";
        }
    }
}
