import { reportService } from './service.js'

export class ReportCleanupTask {
  private intervalId: NodeJS.Timeout | null = null

  start(): void {
    this.intervalId = setInterval(() => {
      this.runCleanup()
    }, 60 * 60 * 1000) // Run every hour

    setTimeout(() => this.runCleanup(), 5000) // Initial cleanup after 5 seconds
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async runCleanup(): Promise<void> {
    try {
      const deletedCount = await reportService.cleanup()
      
      if (deletedCount > 0) {
        console.log(`[ReportCleanupTask] Cleanup completed: ${deletedCount} expired reports deleted`)
      }
    } catch (error) {
      console.error('[ReportCleanupTask] Cleanup failed:', error)
    }
  }
}

export const reportCleanupTask = new ReportCleanupTask()
