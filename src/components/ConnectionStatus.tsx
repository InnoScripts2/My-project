import { useEffect, useState } from 'react'
import { checkSupabaseConnection } from '@/lib/supabase-connection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react'

export function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const checkConnection = async () => {
    setIsChecking(true)
    const connected = await checkSupabaseConnection()
    setIsConnected(connected)
    setIsChecking(false)
  }

  useEffect(() => {
    checkConnection()
    
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000)
    
    return () => clearInterval(interval)
  }, [])

  if (isConnected === true) {
    return null // Don't show anything when connected
  }

  if (isConnected === false) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        <Alert variant="destructive" className="rounded-none border-0">
          <WifiOff className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Проблема с подключением к серверу</span>
            <button
              onClick={checkConnection}
              disabled={isChecking}
              className="text-xs underline hover:no-underline"
            >
              {isChecking ? 'Проверка...' : 'Повторить'}
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Initial check in progress
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <Alert className="rounded-none border-0 bg-yellow-50 dark:bg-yellow-900/20">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        <AlertDescription className="text-yellow-800 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 animate-pulse" />
            <span>Проверка подключения...</span>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}
