import { supabase } from '@/integrations/supabase/client'

/**
 * Check if Supabase connection is healthy
 * Performs a simple query to health_check table
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    console.log('[Health Check] Starting connection check to health_check table...')
    
    const { data, error } = await supabase
      .from('health_check')
      .select('status')
      .limit(1)
      .single()
    
    if (error) {
      console.error('[Health Check] Error:', error.message, error.details)
      return false
    }
    
    console.log('[Health Check] Success! Data:', data)
    return true
  } catch (error) {
    console.error('[Health Check] Exception caught:', error)
    return false
  }
}

/**
 * Check connection with retry logic
 */
export async function checkConnectionWithRetry(
  maxAttempts = 3,
  delayMs = 1000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isConnected = await checkSupabaseConnection()
    
    if (isConnected) {
      console.log('✓ Supabase connection successful')
      return true
    }
    
    if (attempt < maxAttempts) {
      console.warn(`Connection attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  console.error('✗ Supabase connection failed after', maxAttempts, 'attempts')
  return false
}
