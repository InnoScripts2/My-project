// Admin Panel Types for Update Management System

export interface Update {
  id: string;
  version: string;
  description: string | null;
  changelog: string | null;
  file_path: string;
  file_size: number;
  checksum: string;
  is_mandatory: boolean;
  target_clients: string[];
  created_at: string;
  published_at: string | null;
}

export interface Client {
  id: string;
  client_id: string;
  api_key: string;
  app_version: string | null;
  platform: string | null;
  hostname: string | null;
  last_seen: string | null;
  last_heartbeat: string | null;
  status: 'active' | 'offline' | 'updating';
  metadata: Record<string, any>;
  created_at: string;
}

export interface UpdateDeployment {
  id: string;
  update_id: string;
  client_id: string;
  status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface TelemetryLog {
  id: string;
  client_id: string;
  log_level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  context: Record<string, any>;
  created_at: string;
  clients?: {
    client_id: string;
    hostname: string;
  };
}

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  offlineClients: number;
  updatingClients: number;
  recentUpdates: number;
  criticalErrors: number;
}
