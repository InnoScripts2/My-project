/**
 * Типы для аналитической системы
 */

export interface DataSource {
  name: string;
  type: 'sqlite' | 'csv' | 'json' | 'parquet';
  path: string;
  tableName: string;
}

export interface LoadResult {
  loaded: number;
  tables: string[];
  errors: string[];
  duration: number;
}

export interface QueryResult {
  rows: any[];
  columns: string[];
  rowCount: number;
  duration: number;
}

export interface SessionsFilter {
  startDate: string;
  endDate: string;
  type?: 'THICKNESS' | 'DIAGNOSTICS';
  status?: 'completed' | 'incomplete';
  groupBy?: 'day' | 'week' | 'month';
}

export interface SessionsReport {
  period: string;
  totalSessions: number;
  completedSessions: number;
  incompleteSessions: number;
  byType: {
    THICKNESS: number;
    DIAGNOSTICS: number;
  };
  avgDuration: number;
}

export interface RevenueFilter {
  startDate: string;
  endDate: string;
  groupBy?: 'day' | 'week' | 'month' | 'service';
}

export interface RevenueReport {
  period: string;
  totalRevenue: number;
  byService: {
    THICKNESS: number;
    DIAGNOSTICS: number;
  };
  avgTransactionValue: number;
  failedPayments: number;
  failureRate: number;
}

export interface ErrorsFilter {
  startDate: string;
  endDate: string;
  device?: 'obd' | 'thickness';
  severity?: 'high' | 'medium' | 'low';
  limit?: number;
}

export interface ErrorsReport {
  topErrors: Array<{
    code: string;
    description: string;
    count: number;
    severity: string;
  }>;
  totalErrors: number;
  byDevice: {
    obd: number;
    thickness: number;
  };
}

export interface TrendsFilter {
  startDate: string;
  endDate: string;
  metric: 'sessions' | 'revenue' | 'errors';
  groupBy?: 'day' | 'week' | 'month';
}

export interface AggregationResult {
  date: string;
  sessionsProcessed: number;
  revenueCalculated: number;
  errorsAggregated: number;
  exportPath?: string;
  duration: number;
}

export interface ReportResult {
  generated: string;
  type: 'weekly' | 'monthly';
  emailsSent: number;
  success: boolean;
}

export interface OverviewDashboard {
  totalSessions: number;
  totalRevenue: number;
  activeDevices: number;
  avgSessionDuration: number;
  topErrors: Array<{
    code: string;
    count: number;
  }>;
  trendsChart: Array<{
    date: string;
    sessions: number;
    revenue: number;
  }>;
}

export interface ServicePerformanceDashboard {
  thickness: {
    totalSessions: number;
    avgDuration: number;
    revenue: number;
    topMeasurements: Array<{
      zone: string;
      count: number;
    }>;
  };
  diagnostics: {
    totalSessions: number;
    avgDuration: number;
    revenue: number;
    topDtcCodes: Array<{
      code: string;
      count: number;
    }>;
  };
}

export interface FinancialDashboard {
  totalRevenue: number;
  revenueByService: {
    THICKNESS: number;
    DIAGNOSTICS: number;
  };
  paymentSuccess: {
    total: number;
    confirmed: number;
    failed: number;
    rate: number;
  };
  avgTransactionValue: number;
  revenueGrowth: number;
}

export interface DateFilter {
  startDate: string;
  endDate: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}
