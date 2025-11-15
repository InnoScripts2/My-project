/**
 * Unit tests for QueryBuilder
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { QueryBuilder } from '../QueryBuilder.js';

describe('QueryBuilder', () => {
  const builder = new QueryBuilder();

  it('should build sessions query with day grouping', () => {
    const sql = builder.buildSessionsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      groupBy: 'day',
    });

    assert.ok(sql.includes('DATE_TRUNC(\'day\''));
    assert.ok(sql.includes('total_sessions'));
    assert.ok(sql.includes('completed_sessions'));
    assert.ok(sql.includes('WHERE created_at >= ? AND created_at <= ?'));
  });

  it('should build sessions query with week grouping', () => {
    const sql = builder.buildSessionsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      groupBy: 'week',
    });

    assert.ok(sql.includes('DATE_TRUNC(\'week\''));
  });

  it('should build sessions query with month grouping', () => {
    const sql = builder.buildSessionsQuery({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      groupBy: 'month',
    });

    assert.ok(sql.includes('DATE_TRUNC(\'month\''));
  });

  it('should build revenue query with joins', () => {
    const sql = builder.buildRevenueQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      groupBy: 'day',
    });

    assert.ok(sql.includes('FROM payments p'));
    assert.ok(sql.includes('LEFT JOIN sessions s'));
    assert.ok(sql.includes('total_revenue'));
    assert.ok(sql.includes('thickness_revenue'));
    assert.ok(sql.includes('diagnostics_revenue'));
    assert.ok(sql.includes('avg_transaction_value'));
    assert.ok(sql.includes('failed_payments'));
    assert.ok(sql.includes('failure_rate'));
  });

  it('should build errors query with grouping', () => {
    const sql = builder.buildErrorsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      limit: 50,
    });

    assert.ok(sql.includes('FROM obd_dtc'));
    assert.ok(sql.includes('dtc_code AS code'));
    assert.ok(sql.includes('GROUP BY dtc_code, description, severity'));
    assert.ok(sql.includes('ORDER BY count DESC'));
    assert.ok(sql.includes('LIMIT ?'));
  });

  it('should build trends query for sessions', () => {
    const sql = builder.buildTrendsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      metric: 'sessions',
      groupBy: 'day',
    });

    assert.ok(sql.includes('FROM sessions'));
    assert.ok(sql.includes('COUNT(*) AS value'));
  });

  it('should build trends query for revenue', () => {
    const sql = builder.buildTrendsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      metric: 'revenue',
      groupBy: 'day',
    });

    assert.ok(sql.includes('FROM payments'));
    assert.ok(sql.includes('SUM(CASE WHEN status = \'confirmed\''));
  });

  it('should build trends query for errors', () => {
    const sql = builder.buildTrendsQuery({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      metric: 'errors',
      groupBy: 'day',
    });

    assert.ok(sql.includes('FROM obd_dtc'));
    assert.ok(sql.includes('occurred_at'));
  });

  it('should throw error for unsupported metric', () => {
    assert.throws(() => {
      builder.buildTrendsQuery({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        metric: 'invalid' as any,
      });
    });
  });
});
