import { useQuery, useEffect } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TelemetryLog } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';

export const useTelemetry = (filters?: {
  clientId?: string;
  logLevel?: string;
  searchTerm?: string;
}) => {
  const queryClient = useQueryClient();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['telemetry', filters],
    queryFn: async () => {
      let query = supabase
        .from('telemetry_logs')
        .select(`
          *,
          clients (client_id, hostname)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId);
      }

      if (filters?.logLevel) {
        query = query.eq('log_level', filters.logLevel);
      }

      if (filters?.searchTerm) {
        query = query.ilike('message', `%${filters.searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TelemetryLog[];
    },
  });

  // Subscribe to real-time logs
  useEffect(() => {
    const channel = supabase
      .channel('telemetry-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'telemetry_logs',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['telemetry'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    logs,
    isLoading,
  };
};
