import { Counter, Histogram } from 'prom-client'
import { register } from 'prom-client'

const smsSuccess = new Counter({
  name: 'reports_sms_success_total',
  help: 'Total number of successful SMS deliveries',
  registers: [register],
})

const smsError = new Counter({
  name: 'reports_sms_error_total',
  help: 'Total number of failed SMS deliveries',
  registers: [register],
})

const smsDuration = new Histogram({
  name: 'reports_sms_duration_seconds',
  help: 'Duration of SMS delivery in seconds',
  registers: [register],
})

export interface SmsConfig {
  apiKey: string
  senderId: string
  apiUrl?: string
}

export interface SmsPayload {
  to: string
  message: string
}

export interface SmsAdapter {
  /**
   * Отправить SMS с информацией об отчёте
   * @param payload - Данные для отправки
   */
  send(payload: SmsPayload): Promise<void>
}

/**
 * Валидировать конфигурацию SMS из переменных окружения
 */
export function getSmsConfigFromEnv(): SmsConfig | null {
  const apiKey = process.env.SMS_API_KEY
  const senderId = process.env.SMS_SENDER_ID
  
  if (!apiKey || !senderId) {
    return null
  }
  
  return {
    apiKey,
    senderId,
    apiUrl: process.env.SMS_API_URL,
  }
}

/**
 * Утилита для retry с exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 2000
): Promise<T> {
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < maxAttempts) {
        const delay = initialDelay * Math.pow(2, attempt - 1)
        console.warn(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`, lastError.message)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError
}

/**
 * Rate limiter для защиты от спама
 */
class RateLimiter {
  private attempts: Map<string, number[]> = new Map()
  private readonly maxAttempts: number
  private readonly windowMs: number

  constructor(maxAttempts: number = 10, windowMs: number = 60 * 60 * 1000) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs
  }

  check(key: string): boolean {
    const now = Date.now()
    const attempts = this.attempts.get(key) || []
    
    const recentAttempts = attempts.filter(time => now - time < this.windowMs)
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false
    }
    
    recentAttempts.push(now)
    this.attempts.set(key, recentAttempts)
    
    return true
  }
}

const smsRateLimiter = new RateLimiter(10, 60 * 60 * 1000)

/**
 * Валидация телефонного номера
 */
function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{10,14}$/
  return phoneRegex.test(phone.replace(/[\s-]/g, ''))
}

/**
 * DEV-заглушка для отправки SMS (только логирование)
 */
export class DevSmsAdapter implements SmsAdapter {
  private readonly env: string

  constructor() {
    this.env = process.env.AGENT_ENV || 'DEV'
  }

  async send(payload: SmsPayload): Promise<void> {
    if (!validatePhone(payload.to)) {
      throw new Error('Invalid phone format')
    }

    const kioskId = process.env.KIOSK_ID || 'default'
    if (!smsRateLimiter.check(kioskId)) {
      throw new Error('Rate limit exceeded: maximum 10 SMS per hour')
    }

    if (payload.message.length > 160) {
      payload.message = payload.message.substring(0, 160)
    }

    const timer = smsDuration.startTimer()
    
    try {
      await retryWithBackoff(async () => {
        if (this.env === 'DEV') {
          console.log('[DEV SMS] Message would be sent:')
          console.log(`  To: ${payload.to}`)
          console.log(`  Message: ${payload.message}`)
        } else {
          throw new Error('SMS not implemented for PROD environment. Use Edge Function integration.')
        }
      })
      
      smsSuccess.inc()
    } catch (error) {
      smsError.inc()
      throw error
    } finally {
      timer()
    }
  }
}

/**
 * Создать адаптер отправки SMS на основе окружения
 */
export function createSmsAdapter(): SmsAdapter {
  const env = process.env.AGENT_ENV || 'DEV'
  
  if (env === 'PROD') {
    throw new Error('SMS not implemented for PROD. Use Edge Function integration.')
  }
  
  return new DevSmsAdapter()
}
