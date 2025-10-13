import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardStats } from '@/lib/types';
import { subDays } from 'date-fns';

export const useDashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Get clients count
      const { data: allClients } = await supabase
        .from('clients')
        .select('status');

      const totalClients = allClients?.length || 0;
      const activeClients = allClients?.filter(c => c.status === 'active').length || 0;
      const offlineClients = allClients?.filter(c => c.status === 'offline').length || 0;
      const updatingClients = allClients?.filter(c => c.status === 'updating').length || 0;

      // Get recent updates (last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data: recentUpdates } = await supabase
        .from('updates')
        .select('id')
        .gte('created_at', sevenDaysAgo);

      // Get critical errors (last 24 hours)
      const oneDayAgo = subDays(new Date(), 1).toISOString();
      const { data: criticalLogs } = await supabase
        .from('telemetry_logs')
        .select('id')
        .eq('log_level', 'critical')
        .gte('created_at', oneDayAgo);

      return {
        totalClients,
        activeClients,
        offlineClients,
        updatingClients,
        recentUpdates: recentUpdates?.length || 0,
        criticalErrors: criticalLogs?.length || 0,
      } as DashboardStats;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    stats,
    isLoading,
  };
};
