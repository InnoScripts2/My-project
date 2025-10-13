import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Update } from '@/lib/types';
import { toast } from 'sonner';

export const useUpdates = () => {
  const queryClient = useQueryClient();

  const { data: updates, isLoading } = useQuery({
    queryKey: ['updates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Update[];
    },
  });

  const uploadUpdate = useMutation({
    mutationFn: async ({
      file,
      version,
      description,
      changelog,
      isMandatory,
      targetClients,
      publishNow,
    }: {
      file: File;
      version: string;
      description: string;
      changelog: string;
      isMandatory: boolean;
      targetClients: string[];
      publishNow: boolean;
    }) => {
      // Calculate checksum
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Upload file to storage
      const filePath = `${version}.zip`;
      const { error: uploadError } = await supabase.storage
        .from('updates')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create metadata record
      const { error: insertError } = await supabase
        .from('updates')
        .insert({
          version,
          description,
          changelog,
          file_path: filePath,
          file_size: file.size,
          checksum,
          is_mandatory: isMandatory,
          target_clients: targetClients,
          published_at: publishNow ? new Date().toISOString() : null,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update uploaded successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to upload update: ${error.message}`);
    },
  });

  const publishUpdate = useMutation({
    mutationFn: async (updateId: string) => {
      const { error } = await supabase
        .from('updates')
        .update({ published_at: new Date().toISOString() })
        .eq('id', updateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update published');
    },
    onError: (error: Error) => {
      toast.error(`Failed to publish: ${error.message}`);
    },
  });

  const deleteUpdate = useMutation({
    mutationFn: async (update: Update) => {
      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from('updates')
        .remove([update.file_path]);

      if (storageError) throw storageError;

      // Delete metadata
      const { error: dbError } = await supabase
        .from('updates')
        .delete()
        .eq('id', update.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  return {
    updates,
    isLoading,
    uploadUpdate,
    publishUpdate,
    deleteUpdate,
  };
};
