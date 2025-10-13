/**
 * Example usage of Analytics module
 * 
 * This script demonstrates how to initialize and use the analytics system
 * for reporting and dashboards.
 */

import { createAnalyticsModule } from '../init.js';
import path from 'path';

async function main() {
  console.log('Starting analytics example...\n');

  // Initialize analytics module
  const analytics = await createAnalyticsModule({
    enabled: true,
    dbPath: path.join('/tmp', 'example-analytics.duckdb'),
    aggregationCron: '0 2 * * *', // Daily at 2 AM
    weeklyReportCron: '0 3 * * 1', // Monday at 3 AM
    exportDir: path.join('/tmp', 'exports'),
    aggregationsDir: path.join('/tmp', 'aggregations'),
  });

  // Get services
  const analyticsService = analytics.getAnalyticsService()!;
  const dashboardService = analytics.getDashboardService()!;
  const exportService = analytics.getExportService()!;

  // Example 1: Load data from SQLite
  console.log('1. Loading data from SQLite...');
  const loadResult = await analyticsService.loadData([
    {
      name: 'sessions',
      type: 'sqlite',
      path: path.join(process.cwd(), 'data', 'sessions.db'),
      tableName: 'sessions',
    },
    {
      name: 'payments',
      type: 'sqlite',
      path: path.join(process.cwd(), 'data', 'sessions.db'),
      tableName: 'payments',
    },
  ]);
  console.log(`   Loaded ${loadResult.loaded} rows from ${loadResult.tables.length} tables`);
  console.log(`   Duration: ${loadResult.duration}ms\n`);

  // Example 2: Get sessions report
  console.log('2. Getting sessions report...');
  const sessionsReport = await analyticsService.getSessionsReport({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-31T23:59:59Z',
    groupBy: 'day',
  });
  console.log(`   Found ${sessionsReport.length} periods`);
  if (sessionsReport.length > 0) {
    console.log(`   First period: ${sessionsReport[0].period}`);
    console.log(`   Total sessions: ${sessionsReport[0].totalSessions}`);
    console.log(`   Completed: ${sessionsReport[0].completedSessions}`);
  }
  console.log();

  // Example 3: Get revenue report
  console.log('3. Getting revenue report...');
  const revenueReport = await analyticsService.getRevenueReport({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-31T23:59:59Z',
    groupBy: 'day',
  });
  console.log(`   Found ${revenueReport.length} periods`);
  if (revenueReport.length > 0) {
    console.log(`   First period: ${revenueReport[0].period}`);
    console.log(`   Total revenue: ${revenueReport[0].totalRevenue}`);
    console.log(`   THICKNESS: ${revenueReport[0].byService.THICKNESS}`);
    console.log(`   DIAGNOSTICS: ${revenueReport[0].byService.DIAGNOSTICS}`);
  }
  console.log();

  // Example 4: Get overview dashboard
  console.log('4. Getting overview dashboard...');
  const overview = await dashboardService.getOverviewDashboard({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-31T23:59:59Z',
  });
  console.log(`   Total sessions: ${overview.totalSessions}`);
  console.log(`   Total revenue: ${overview.totalRevenue}`);
  console.log(`   Active devices: ${overview.activeDevices}`);
  console.log(`   Avg session duration: ${overview.avgSessionDuration}s`);
  console.log(`   Top errors: ${overview.topErrors.length}`);
  console.log();

  // Example 5: Get service performance dashboard
  console.log('5. Getting service performance dashboard...');
  const servicePerf = await dashboardService.getServicePerformanceDashboard({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-31T23:59:59Z',
  });
  console.log('   THICKNESS:');
  console.log(`     Sessions: ${servicePerf.thickness.totalSessions}`);
  console.log(`     Revenue: ${servicePerf.thickness.revenue}`);
  console.log(`     Avg duration: ${servicePerf.thickness.avgDuration}s`);
  console.log('   DIAGNOSTICS:');
  console.log(`     Sessions: ${servicePerf.diagnostics.totalSessions}`);
  console.log(`     Revenue: ${servicePerf.diagnostics.revenue}`);
  console.log(`     Avg duration: ${servicePerf.diagnostics.avgDuration}s`);
  console.log();

  // Example 6: Export to CSV
  console.log('6. Exporting sessions report to CSV...');
  const csvPath = await exportService.exportToCsv(
    {
      rows: sessionsReport,
      columns: Object.keys(sessionsReport[0] || {}),
      rowCount: sessionsReport.length,
      duration: 0,
    },
    'sessions-report.csv'
  );
  console.log(`   Exported to: ${csvPath}\n`);

  // Example 7: Export to Excel
  console.log('7. Exporting revenue report to Excel...');
  const xlsxPath = await exportService.exportToExcel(
    {
      rows: revenueReport,
      columns: Object.keys(revenueReport[0] || {}),
      rowCount: revenueReport.length,
      duration: 0,
    },
    'revenue-report.xlsx'
  );
  console.log(`   Exported to: ${xlsxPath}\n`);

  // Example 8: Execute custom query
  console.log('8. Executing custom SQL query...');
  const customResult = await analyticsService.executeQuery(`
    SELECT 
      type,
      COUNT(*) as count,
      AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration
    FROM sessions
    WHERE status = 'completed'
    GROUP BY type
  `);
  console.log(`   Results: ${customResult.rowCount} rows`);
  for (const row of customResult.rows) {
    console.log(`     ${row.type}: ${row.count} sessions, ${row.avg_duration}s avg duration`);
  }
  console.log();

  // Cleanup
  console.log('Shutting down analytics module...');
  await analytics.shutdown();
  console.log('Done!');
}

// Run example
main().catch((error) => {
  console.error('Example failed:', error);
  process.exit(1);
});
