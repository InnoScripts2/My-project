import { randomUUID } from 'node:crypto';

export type SelfCheckOrigin = 'manual' | 'scheduled' | 'automatic';

export type SelfCheckOutcome = 'passed' | 'warning' | 'failed';

export type SelfCheckComponent = 'obd' | 'thickness' | 'network' | 'printer' | 'system';

export interface SelfCheckComponentResult {
  component: SelfCheckComponent;
  status: SelfCheckOutcome;
  summary: string;
  durationMs?: number;
  attempts?: number;
  metrics?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
}

export interface SelfCheckLogEntry {
  /** Unique identifier of the entry. */
  id: string;
  /** ISO timestamp of the run start. */
  startedAt: string;
  /** ISO timestamp of the run finish. */
  completedAt: string;
  /** Total duration of the run in milliseconds. */
  durationMs: number;
  /** Aggregated status across all components. */
  status: SelfCheckOutcome;
  /** Environment where the run happened (matches kiosk agent modes). */
  environment: 'DEV' | 'QA' | 'PROD';
  /** Who triggered the run. */
  origin: SelfCheckOrigin;
  /** Detailed results by component. */
  results: SelfCheckComponentResult[];
  /** Optional auxiliary data (port, firmware, etc). */
  metadata?: Record<string, unknown>;
  /** Optional textual notes (warnings, operator comments). */
  notes?: string[];
}

export interface SelfCheckLogContext {
  environment?: 'DEV' | 'QA' | 'PROD';
  origin?: SelfCheckOrigin;
  startedAt?: Date | string;
  completedAt?: Date | string;
  metadata?: Record<string, unknown>;
  notes?: string[];
  id?: string;
}

export function generateSelfCheckId(prefix: string): string {
  try {
    return `${prefix}_${randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
