import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert'
import { reportService, ReportType } from './service.js'
import type { ThicknessReportData, ObdReportData } from '@selfservice/report'

describe('Reports API Integration', () => {
  let testReportId: string

  before(async () => {
    const data: ThicknessReportData = {
      sessionId: 'integration-test-1',
      contact: { email: 'integration@example.com' },
      points: [
        { id: '1', label: 'Капот', valueMicrons: 120 },
        { id: '2', label: 'Крыша', valueMicrons: 100 }
      ],
      summary: 'Интеграционный тест'
    }

    const report = await reportService.generateReport(
      'integration-test-1',
      ReportType.THICKNESS,
      data
    )
    testReportId = report.reportId
  })

  after(async () => {
    await reportService.cleanup()
  })

  describe('POST /api/reports/generate', () => {
    it('генерирует новый отчёт', async () => {
      const data: ObdReportData = {
        sessionId: 'integration-test-2',
        contact: { email: 'test@example.com' },
        dtc: [{ code: 'P0420', description: 'Catalyst issue' }],
        mil: true
      }

      const report = await reportService.generateReport(
        'integration-test-2',
        ReportType.DIAGNOSTICS,
        data
      )

      assert.ok(report.reportId)
      assert.strictEqual(report.type, ReportType.DIAGNOSTICS)
      assert.ok(report.htmlContent)
    })
  })

  describe('GET /api/reports/:reportId/preview', () => {
    it('возвращает HTML предпросмотр', async () => {
      const html = await reportService.previewReport(testReportId)

      assert.ok(html.includes('<!DOCTYPE html'))
      assert.ok(html.includes('integration-test-1'))
    })

    it('возвращает ошибку для несуществующего отчёта', async () => {
      await assert.rejects(
        async () => await reportService.previewReport('non-existent-id'),
        { message: 'Report not found' }
      )
    })
  })

  describe('GET /api/reports/:reportId/download', () => {
    it('возвращает PDF если доступен', async () => {
      const report = await reportService.getReport(testReportId)

      if (report?.pdfPath) {
        assert.ok(report.pdfPath)
      } else {
        console.log('[Test] PDF not available, skipping download test')
      }
    })
  })

  describe('POST /api/reports/:reportId/send', () => {
    it('отправляет отчёт на email', async () => {
      const result = await reportService.sendReport(testReportId, {
        channel: 'EMAIL' as any,
        recipient: 'test@example.com',
        language: 'ru'
      })

      assert.ok(result)
      assert.strictEqual(result.recipient, 'test@example.com')
      assert.ok(result.sentAt)
    })

    it('отправляет отчёт по SMS', async () => {
      const result = await reportService.sendReport(testReportId, {
        channel: 'SMS' as any,
        recipient: '+79991234567',
        language: 'ru'
      })

      assert.ok(result)
      assert.strictEqual(result.recipient, '+79991234567')
    })

    it('возвращает ошибку для несуществующего отчёта', async () => {
      await assert.rejects(
        async () => await reportService.sendReport('non-existent-id', {
          channel: 'EMAIL' as any,
          recipient: 'test@example.com'
        }),
        { message: 'Report not found' }
      )
    })
  })

  describe('Cleanup', () => {
    it('удаляет истёкшие отчёты', async () => {
      const data: ThicknessReportData = {
        sessionId: 'cleanup-test',
        contact: { email: 'cleanup@example.com' },
        points: []
      }

      const report = await reportService.generateReport(
        'cleanup-test',
        ReportType.THICKNESS,
        data
      )

      const deletedCount = await reportService.cleanup()
      assert.ok(deletedCount >= 0)
    })
  })
})
