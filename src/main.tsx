import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { validateEnvironment } from './lib/env-check'
import { checkConnectionWithRetry } from './lib/supabase-connection'

async function initApp() {
  try {
    // Validate environment variables
    validateEnvironment()
    
    // Check Supabase connection with retry
    await checkConnectionWithRetry(3, 1000)
    
    // Render app
    createRoot(document.getElementById("root")!).render(<App />)
  } catch (error) {
    console.error('App initialization failed:', error)
    
    // Still render the app, ConnectionStatus component will show the error
    createRoot(document.getElementById("root")!).render(<App />)
  }
}

initApp()
