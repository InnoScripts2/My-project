/**
 * Validate that all required environment variables are present
 */
export function validateEnvironment(): void {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]
  
  const missing = required.filter(key => !import.meta.env[key])
  
  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.join(', ')}`
    console.error(errorMsg)
    throw new Error(errorMsg)
  }
  
  console.log('✓ All required environment variables are set')
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo() {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    hasPublishableKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
  }
}
