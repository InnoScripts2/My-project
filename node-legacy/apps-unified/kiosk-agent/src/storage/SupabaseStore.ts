import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Counter, Histogram } from 'prom-client'
import type { PersistenceStore, SessionKind, ThicknessPointRecord } from './types.js'

// Prometheus metrics for SupabaseStore
const supabaseOperations = new Counter({
  name: 'supabase_operations_total',
  help: 'Total number of Supabase operations',
  labelNames: ['operation', 'status']
})

const supabaseOperationDuration = new Histogram({
  name: 'supabase_operation_duration_seconds',
  help: 'Duration of Supabase operations in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
})

const supabaseRetries = new Counter({
  name: 'supabase_retries_total',
  help: 'Total number of retry attempts',
  labelNames: ['operation']
})

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: parseInt(process.env.SUPABASE_MAX_ATTEMPTS || '3', 10),
  baseDelay: parseInt(process.env.SUPABASE_BASE_DELAY_MS || '100', 10),
  maxDelay: parseInt(process.env.SUPABASE_MAX_DELAY_MS || '5000', 10),
  timeout: parseInt(process.env.SUPABASE_TIMEOUT_MS || '10000', 10)
}

function createSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY должны быть установлены для SupabaseStore. ' +
      'Проверьте .env файл.'
    )
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-client-info': 'kiosk-agent',
      },
    },
  })
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: Error | null = null
  const maxAttempts = RETRY_CONFIG.maxAttempts

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now()
    try {
      // Add timeout wrapper
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), RETRY_CONFIG.timeout)
        )
      ])
      
      const duration = (Date.now() - start) / 1000
      supabaseOperationDuration.observe({ operation }, duration)
      supabaseOperations.inc({ operation, status: 'success' })
      
      return result
    } catch (error: any) {
      lastError = error
      const duration = (Date.now() - start) / 1000
      supabaseOperationDuration.observe({ operation }, duration)
      supabaseOperations.inc({ operation, status: 'error' })

      // If it's the last attempt, don't retry
      if (attempt >= maxAttempts) {
        break
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelay
      )

      console.warn(`[SupabaseStore] ${operation} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, error.message)
      supabaseRetries.inc({ operation })

      await sleep(delay)
    }
  }

  throw new Error(`${operation} failed after ${maxAttempts} attempts: ${lastError?.message}`)
}

export class SupabaseStore implements PersistenceStore {
  private supabase: SupabaseClient

  constructor() {
    this.supabase = createSupabase()
  }

  async createSession(kind: SessionKind, id?: string): Promise<string> {
    const sessionId = id || `${kind[0].toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    
    await withRetry('createSession', async () => {
      const { error } = await this.supabase
        .from('sessions')
        .insert({
          id: sessionId,
          kind,
          status: 'active',
        })

      if (error) {
        throw new Error(`Failed to create session in Supabase: ${error.message}`)
      }
    })

    return sessionId
  }

  async finishSession(id: string): Promise<void> {
    await withRetry('finishSession', async () => {
      const { error } = await this.supabase
        .from('sessions')
        .update({
          finished_at: new Date().toISOString(),
          status: 'finished',
        })
        .eq('id', id)

      if (error) {
        throw new Error(`Failed to finish session in Supabase: ${error.message}`)
      }
    })
  }

  async recordThicknessPoint(rec: ThicknessPointRecord): Promise<void> {
    await withRetry('recordThicknessPoint', async () => {
      const { error } = await this.supabase
        .from('thickness_points')
        .upsert({
          session_id: rec.sessionId,
          point_id: rec.pointId,
          label: rec.label,
          status: rec.status,
          value_microns: rec.valueMicrons ?? null,
          measured_at: rec.measuredAt ?? null,
        })

      if (error) {
        throw new Error(`Failed to record thickness point in Supabase: ${error.message}`)
      }
    })
  }

  async ping(): Promise<void> {
    // Simple health check query
    await withRetry('ping', async () => {
      const { error } = await this.supabase
        .from('sessions')
        .select('id')
        .limit(1)

      if (error) {
        throw new Error(`Supabase ping failed: ${error.message}`)
      }
    })
  }
}

// Export metrics for registration in main registry
export { supabaseOperations, supabaseOperationDuration, supabaseRetries }
