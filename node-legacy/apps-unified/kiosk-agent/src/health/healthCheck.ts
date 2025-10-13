/**
 * Health check endpoints for Kubernetes liveness and readiness probes.
 * Follows RFC draft-inadarei-api-health-check-06 format.
 */

import * as os from 'os';
import type { PersistenceStore } from '../storage/types.js';

export interface HealthCheckResult {
  status: 'pass' | 'warn' | 'fail';
  version?: string;
  releaseId?: string;
  serviceId?: string;
  description?: string;
  notes?: string[];
  output?: string;
  checks?: Record<string, ComponentCheck>;
  links?: Record<string, string>;
}

export interface ComponentCheck {
  componentId?: string;
  componentType?: string;
  observedValue?: string | number;
  observedUnit?: string;
  status: 'pass' | 'warn' | 'fail';
  affectedEndpoints?: string[];
  time?: string;
  output?: string;
  links?: Record<string, string>;
}

export interface SystemInfo {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usagePercent: number;
  };
  disk?: {
    usagePercent?: number;
  };
  uptime: number;
  loadAverage: number[];
}

/**
 * Get system metrics for health checks
 */
export function getSystemInfo(): SystemInfo {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    cpu: {
      usage: getCpuUsage(),
      cores: os.cpus().length,
    },
    memory: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      usedMb: Math.round(usedMem / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      usagePercent: Math.round((usedMem / totalMem) * 100),
    },
    uptime: process.uptime(),
    loadAverage: os.loadavg(),
  };
}

let lastCpuInfo: { idle: number; total: number } | null = null;

/**
 * Calculate CPU usage percentage (0-100)
 */
function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }

  if (!lastCpuInfo) {
    lastCpuInfo = { idle, total };
    return 0;
  }

  const idleDiff = idle - lastCpuInfo.idle;
  const totalDiff = total - lastCpuInfo.total;

  lastCpuInfo = { idle, total };

  if (totalDiff === 0) return 0;

  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

/**
 * Liveness probe - answers the question "is the process running?"
 * Should return 200 if the process is alive, even if degraded.
 */
export function checkLiveness(): HealthCheckResult {
  const sysInfo = getSystemInfo();
  const notes: string[] = [];

  // Check memory pressure
  if (sysInfo.memory.usagePercent > 90) {
    notes.push('High memory usage detected');
  }

  return {
    status: 'pass',
    version: process.env.npm_package_version,
    serviceId: 'kiosk-agent',
    description: 'Kiosk Agent health check',
    notes: notes.length > 0 ? notes : undefined,
    checks: {
      'uptime': {
        componentType: 'system',
        observedValue: Math.round(sysInfo.uptime),
        observedUnit: 'seconds',
        status: 'pass',
        time: new Date().toISOString(),
      },
      'memory': {
        componentType: 'system',
        observedValue: sysInfo.memory.usagePercent,
        observedUnit: 'percent',
        status: sysInfo.memory.usagePercent > 90 ? 'warn' : 'pass',
        time: new Date().toISOString(),
      },
    },
  };
}

/**
 * Readiness probe - answers "can the service handle requests?"
 * Should return 200 only if ready to serve traffic.
 */
export async function checkReadiness(
  store: PersistenceStore,
  opts?: { getSystemInfoFn?: () => SystemInfo }
): Promise<HealthCheckResult> {
  const checks: Record<string, ComponentCheck> = {};
  const notes: string[] = [];

  // Check persistence layer
  try {
    const start = Date.now();

    if (store.ping) {
      await store.ping();
    } else {
      // Fallback: test with a dummy operation
      const testId = await store.createSession('diagnostics', `health-check-${Date.now()}`);
      await store.finishSession(testId);
    }

    const latency = Date.now() - start;

    checks['persistence'] = {
      componentId: 'persistence',
      componentType: 'datastore',
      observedValue: latency,
      observedUnit: 'ms',
      status: latency > 2000 ? 'warn' : 'pass',
      time: new Date().toISOString(),
    };

    if (latency > 2000) {
      notes.push('High persistence latency');
    }
  } catch (error: any) {
    checks['persistence'] = {
      componentId: 'persistence',
      componentType: 'datastore',
      status: 'fail',
      time: new Date().toISOString(),
      output: error.message || String(error),
    };
    notes.push('Persistence check failed');
  }

  // Check memory
  const sysInfoProvider = opts?.getSystemInfoFn ?? getSystemInfo;
  const sysInfo = sysInfoProvider();
  checks['memory'] = {
    componentType: 'system',
    observedValue: sysInfo.memory.usagePercent,
    observedUnit: 'percent',
    status: sysInfo.memory.usagePercent > 95 ? 'fail' : (sysInfo.memory.usagePercent > 85 ? 'warn' : 'pass'),
    time: new Date().toISOString(),
  };

  if (sysInfo.memory.usagePercent > 95) {
    notes.push('Critical memory usage');
  }

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  const overallStatus = statuses.some(s => s === 'fail')
    ? 'fail'
    : statuses.some(s => s === 'warn')
      ? 'warn'
      : 'pass';

  return {
    status: overallStatus,
    version: process.env.npm_package_version,
    serviceId: 'kiosk-agent',
    description: 'Kiosk Agent readiness check',
    notes: notes.length > 0 ? notes : undefined,
    checks,
  };
}

/**
 * Combined health check with detailed system information
 */
export async function checkHealth(store: PersistenceStore): Promise<HealthCheckResult & { system?: SystemInfo }> {
  const readiness = await checkReadiness(store);
  const sysInfo = getSystemInfo();

  return {
    ...readiness,
    system: sysInfo,
  };
}
