import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { ArchiveService } from '../../file-transfer/ArchiveService.js'
import { RetentionPolicy } from '../../file-transfer/RetentionPolicy.js'
import { SeafileClient } from '../../file-transfer/SeafileClient.js'
import { getFileTransferMetrics } from '../../file-transfer/metrics.js'
import { register } from 'prom-client'

const archiveRequestSchema = z.object({
  shareLink: z.boolean().optional(),
})

const archivedListSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.enum(['THICKNESS', 'DIAGNOSTICS']).optional(),
  sessionId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
})

export function createArchiveRoutes(): Router {
  const router = Router()
  
  let seafileClient: SeafileClient | null = null
  let archiveService: ArchiveService | null = null
  let retentionPolicy: RetentionPolicy | null = null

  const initializeServices = async () => {
    if (!seafileClient) {
      seafileClient = new SeafileClient()
      
      const serverUrl = process.env.SEAFILE_SERVER_URL
      const username = process.env.SEAFILE_USERNAME
      const password = process.env.SEAFILE_PASSWORD
      const libraryId = process.env.SEAFILE_LIBRARY_ID

      if (serverUrl && username && password && libraryId) {
        try {
          await seafileClient.init(serverUrl, username, password, libraryId)
          console.log('[ArchiveRoutes] Seafile client initialized')
        } catch (error) {
          console.error('[ArchiveRoutes] Seafile initialization failed:', error)
          throw error
        }
      } else {
        throw new Error('Seafile configuration missing')
      }
    }

    if (!archiveService) {
      archiveService = new ArchiveService(seafileClient)
      
      const cronExpression = process.env.SEAFILE_SYNC_CRON || '0 4 * * *'
      archiveService.scheduleSync(cronExpression)
      console.log('[ArchiveRoutes] Archive service initialized with cron:', cronExpression)
    }

    if (!retentionPolicy) {
      retentionPolicy = new RetentionPolicy(seafileClient, archiveService)
      console.log('[ArchiveRoutes] Retention policy initialized')
    }
  }

  router.post('/api/reports/:reportId/archive', async (req: Request, res: Response) => {
    const { reportId } = req.params
    const parsed = archiveRequestSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      })
      return
    }

    try {
      await initializeServices()

      const metrics = getFileTransferMetrics(register)
      const result = await archiveService!.archiveReport(reportId, parsed.data.shareLink)

      metrics.archivedReportsTotal.inc({ type: 'unknown', success: 'true' })

      res.json({
        reportId: result.reportId,
        archived: result.archived,
        remotePath: result.remotePath,
        shareLink: result.shareLink,
        archivedAt: result.archivedAt,
      })
    } catch (error) {
      const metrics = getFileTransferMetrics(register)
      metrics.archivedReportsTotal.inc({ type: 'unknown', success: 'false' })
      
      console.error('[ArchiveRoutes] Archive failed:', error)
      res.status(500).json({
        error: 'Archive failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  router.get('/api/reports/archived', async (req: Request, res: Response) => {
    const filter = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      type: req.query.type as 'THICKNESS' | 'DIAGNOSTICS' | undefined,
      sessionId: req.query.sessionId as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    }

    try {
      await initializeServices()

      const result = await archiveService!.listArchivedReports(filter)

      res.json({
        reports: result.reports,
        total: result.total,
        limit: filter.limit || 100,
        offset: filter.offset || 0,
      })
    } catch (error) {
      console.error('[ArchiveRoutes] List archived failed:', error)
      res.status(500).json({
        error: 'Failed to list archived reports',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  router.get('/api/reports/archived/:reportId', async (req: Request, res: Response) => {
    const { reportId } = req.params

    try {
      await initializeServices()

      const metadata = await archiveService!.getArchivedReport(reportId)

      if (!metadata) {
        res.status(404).json({
          error: 'Archived report not found',
        })
        return
      }

      res.json({
        reportId: metadata.reportId,
        type: metadata.type,
        remotePath: metadata.remotePath,
        archivedAt: metadata.archivedAt,
      })
    } catch (error) {
      console.error('[ArchiveRoutes] Get archived report failed:', error)
      res.status(500).json({
        error: 'Failed to get archived report',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  router.post('/api/reports/sync', async (req: Request, res: Response) => {
    try {
      await initializeServices()

      const { syncId, status } = await archiveService!.startManualSync()

      res.status(202).json({
        syncId,
        status,
      })
    } catch (error) {
      console.error('[ArchiveRoutes] Manual sync failed:', error)
      res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  router.get('/api/reports/sync/:syncId', async (req: Request, res: Response) => {
    const { syncId } = req.params

    try {
      await initializeServices()

      const syncStatus = await archiveService!.getSyncStatus(syncId)

      if (!syncStatus) {
        res.status(404).json({
          error: 'Sync job not found',
        })
        return
      }

      res.json({
        syncId,
        status: syncStatus.status,
        result: syncStatus.result,
      })
    } catch (error) {
      console.error('[ArchiveRoutes] Get sync status failed:', error)
      res.status(500).json({
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return router
}
