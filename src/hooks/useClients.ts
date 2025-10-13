import { useQuery, useEffect } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Client } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';

export const useClients = () => {
  const queryClient = useQueryClient();

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) throw error;
      return data as Client[];
    },
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('clients-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    clients,
    isLoading,
  };
};
