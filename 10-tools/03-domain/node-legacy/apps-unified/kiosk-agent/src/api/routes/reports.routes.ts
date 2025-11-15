import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { reportService, ReportType, DeliveryChannel } from '../../reports/service.js'

const generateReportSchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(['THICKNESS', 'DIAGNOSTICS']),
  data: z.any(), // Will be ThicknessReportData or ObdReportData
})

const sendReportSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
  recipient: z.string().min(1),
  language: z.string().optional(),
})

export function createReportsRoutes(): Router {
  const router = Router()

  router.post('/api/reports/generate', async (req: Request, res: Response) => {
    const parsed = generateReportSchema.safeParse(req.body)
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const { sessionId, type, data } = parsed.data
    const reportType = type === 'THICKNESS' ? ReportType.THICKNESS : ReportType.DIAGNOSTICS

    try {
      const report = await reportService.generateReport(sessionId, reportType, data)
      
      res.status(201).json({
        ok: true,
        reportId: report.reportId,
        type: report.type,
        generatedAt: report.generatedAt,
        expiresAt: report.expiresAt,
      })
    } catch (error: any) {
      console.error('[reports] generate failed:', error)
      res.status(500).json({
        ok: false,
        error: 'report_generation_failed',
        message: error?.message || String(error),
      })
    }
  })

  router.get('/api/reports/:reportId/preview', async (req: Request, res: Response) => {
    const { reportId } = req.params

    if (!reportId) {
      res.status(400).send('Report ID required')
      return
    }

    try {
      const htmlContent = await reportService.previewReport(reportId)
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(htmlContent)
    } catch (error: any) {
      console.error('[reports] preview failed:', error)
      
      if (error?.message === 'Report not found') {
        res.status(404).send('Report not found or expired')
      } else {
        res.status(500).send('Failed to retrieve report preview')
      }
    }
  })

  router.get('/api/reports/:reportId/download', async (req: Request, res: Response) => {
    const { reportId } = req.params

    if (!reportId) {
      res.status(400).send('Report ID required')
      return
    }

    try {
      const report = await reportService.getReport(reportId)
      
      if (!report) {
        res.status(404).send('Report not found or expired')
        return
      }

      if (!report.pdfPath) {
        res.status(404).send('PDF not available for this report')
        return
      }

      const date = new Date(report.generatedAt).toISOString().split('T')[0]
      const filename = `otchet-${report.type.toLowerCase()}-${date}.pdf`

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.sendFile(report.pdfPath)
    } catch (error: any) {
      console.error('[reports] download failed:', error)
      res.status(500).send('Failed to download report')
    }
  })

  router.post('/api/reports/:reportId/send', async (req: Request, res: Response) => {
    const { reportId } = req.params
    const parsed = sendReportSchema.safeParse(req.body)
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const { channel, recipient, language } = parsed.data
    const deliveryChannel = channel === 'EMAIL' ? DeliveryChannel.EMAIL : DeliveryChannel.SMS

    try {
      const result = await reportService.sendReport(reportId, {
        channel: deliveryChannel,
        recipient,
        language,
      })
      
      res.json({
        ok: true,
        success: result.success,
        channel: result.channel,
        recipient: result.recipient,
        sentAt: result.sentAt,
        error: result.error,
      })
    } catch (error: any) {
      console.error('[reports] send failed:', error)
      
      if (error?.message === 'Report not found') {
        res.status(404).json({
          ok: false,
          error: 'report_not_found',
          message: 'Report not found or expired',
        })
      } else {
        res.status(500).json({
          ok: false,
          error: 'report_send_failed',
          message: error?.message || String(error),
        })
      }
    }
  })

  return router
}
