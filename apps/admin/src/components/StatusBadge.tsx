import { Chip } from '@mui/material';

interface StatusBadgeProps {
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled' | 'pending' | 'succeeded';
}

const statusColors = {
  created: 'default' as const,
  running: 'info' as const,
  completed: 'success' as const,
  failed: 'error' as const,
  cancelled: 'warning' as const,
  pending: 'warning' as const,
  succeeded: 'success' as const,
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <Chip label={status} color={statusColors[status]} size="small" />;
}
