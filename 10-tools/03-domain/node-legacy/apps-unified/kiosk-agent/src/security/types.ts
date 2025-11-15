/**
 * Security Module Types
 */

export type CheckStatus = 'passed' | 'failed' | 'warning';
export type CheckCategory = 'OS' | 'Network' | 'User' | 'Services';
export type Platform = 'Windows' | 'Linux';
export type OverallStatus = 'passed' | 'failed' | 'warning';

export interface CheckResult {
  id: string;
  category: CheckCategory;
  description: string;
  status: CheckStatus;
  details: string;
  remediation: string | null;
}

export interface HardeningReport {
  timestamp: string;
  platform: Platform;
  checks: CheckResult[];
  overallStatus: OverallStatus;
  recommendations: string[];
}

export interface PolicyConfig {
  name: 'FIM' | 'RootkitDetection' | 'VulnerabilityScanning';
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface WazuhConfig {
  serverAddress: string;
  authKey: string;
  groups: string[];
  policies: PolicyConfig[];
}

export interface InstallResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface AgentStatus {
  installed: boolean;
  version: string;
  connected: boolean;
  lastSeen: string;
  policies?: string[];
  meshId?: string;
}

export interface AccessPolicy {
  allowedRoles: string[];
  mfaRequired: boolean;
  sessionTimeout: number;
  ipWhitelist?: string[];
  timeRestrictions?: {
    allowedDays: number[];
    allowedHours: { start: number; end: number };
  };
}

export interface RegistrationResult {
  resourceId: string;
  deviceToken: string;
  gatewayAddress: string;
}

export interface ConnectionStatus {
  resourceId?: string;
  connected: boolean;
  gatewayAddress?: string;
  activeConnections?: number;
}

export interface Credentials {
  username: string;
  password?: string;
  privateKey?: string;
  domain?: string;
}

export interface Connection {
  connectionId: string;
  protocol: 'RDP' | 'SSH';
  host: string;
  createdAt: string;
  userId: string;
  status: 'active' | 'terminated';
}

export interface LogEntry {
  timestamp: string;
  event: string;
  details: Record<string, unknown>;
}

export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

export interface UploadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export type AuditCategory = 'RemoteAccess' | 'FileChange' | 'ConfigChange' | 'SystemEvent';
export type AuditResult = 'success' | 'failure';

export interface AuditLogEntry {
  eventId: string;
  timestamp: string;
  category: AuditCategory;
  action: string;
  userId: string;
  details: Record<string, unknown>;
  sourceIp?: string;
  result: AuditResult;
  errorMessage?: string;
}

export interface AuditFilter {
  startDate?: string;
  endDate?: string;
  category?: AuditCategory;
  userId?: string;
  action?: string;
  result?: AuditResult;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes: string;
  downloadUrl: string;
  signatureUrl: string;
  publishedAt: string;
}

export interface DownloadUpdateResult {
  success: boolean;
  artifactPath?: string;
  signaturePath?: string;
  error?: string;
}

export interface ApplyResult {
  success: boolean;
  newVersion?: string;
  oldVersion?: string;
  restartRequired: boolean;
  errorMessage?: string;
}

export interface RollbackResult {
  success: boolean;
  restoredVersion?: string;
  errorMessage?: string;
}
