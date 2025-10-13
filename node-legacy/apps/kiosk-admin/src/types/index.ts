export interface Kiosk {
  kioskId: string;
  location: string;
  status: 'online' | 'offline' | 'maintenance';
  uptime: number;
  lastSeen: string;
}

export interface Session {
  sessionId: string;
  type: 'THICKNESS' | 'DIAGNOSTICS';
  status: 'in-progress' | 'completed' | 'incomplete' | 'failed';
  startedAt: string;
  duration?: number;
  client?: string;
}

export interface Alert {
  alertId: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
  name: string;
  description: string;
  status: 'active' | 'acknowledged' | 'resolved';
}

export interface KioskConfig {
  obdPort: string;
  obdBaudRate: number;
  thicknessDeviceId: string;
  yookassaShopId: string;
  yookassaApiKey?: string;
  smtpHost: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

export interface User {
  id: string;
  username: string;
  role: 'operator' | 'admin';
}

export interface LoginResult {
  success: boolean;
  token: string;
  user: User;
  expiresAt: number;
}

export interface OverviewDashboard {
  totalSessions: number;
  totalRevenue: number;
  activeKiosks: number;
  activeSessions: number;
  trendsChart?: any;
  topErrors?: any[];
  recentAlerts?: Alert[];
}
