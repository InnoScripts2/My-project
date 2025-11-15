import { describe, it, mock } from 'node:test'
import * as assert from 'node:assert'
import { ReportService, ReportType, DeliveryChannel } from './service.js'
import type { ThicknessReportData, ObdReportData } from '@selfservice/report'

describe('ReportService', () => {
  describe('generateReport', () => {
    it('генерирует отчёт толщинометрии', async () => {
      const service = new ReportService()
      const data: ThicknessReportData = {
        sessionId: 'test-session-1',
        contact: { email: 'test@example.com' },
        points: [
          { id: '1', label: 'Капот', valueMicrons: 120 },
          { id: '2', label: 'Крыша', valueMicrons: 100 }
        ],
        summary: 'Тестовый отчёт'
      }

      const report = await service.generateReport('test-session-1', ReportType.THICKNESS, data)

      assert.ok(report.reportId)
      assert.strictEqual(report.sessionId, 'test-session-1')
      assert.strictEqual(report.type, ReportType.THICKNESS)
      assert.ok(report.generatedAt)
      assert.ok(report.expiresAt)
      assert.ok(report.htmlContent)
    })

    it('генерирует отчёт диагностики OBD', async () => {
      const service = new ReportService()
      const data: ObdReportData = {
        sessionId: 'test-session-2',
        contact: { email: 'test@example.com' },
        dtc: [
          { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold' }
        ],
        mil: true
      }

      const report = await service.generateReport('test-session-2', ReportType.DIAGNOSTICS, data)

      assert.ok(report.reportId)
      assert.strictEqual(report.sessionId, 'test-session-2')
      assert.strictEqual(report.type, ReportType.DIAGNOSTICS)
      assert.ok(report.htmlContent)
    })
  })

  describe('getReport', () => {
    it('возвращает отчёт по reportId', async () => {
      const service = new ReportService()
      const data: ThicknessReportData = {
        sessionId: 'test-session-3',
        contact: { email: 'test@example.com' },
        points: []
      }

      const generated = await service.generateReport('test-session-3', ReportType.THICKNESS, data)
      const retrieved = await service.getReport(generated.reportId)

      assert.ok(retrieved)
      assert.strictEqual(retrieved.reportId, generated.reportId)
    })

    it('возвращает null для несуществующего отчёта', async () => {
      const service = new ReportService()
      const retrieved = await service.getReport('non-existent-id')

      assert.strictEqual(retrieved, null)
    })
  })

  describe('previewReport', () => {
    it('возвращает HTML содержимое отчёта', async () => {
      const service = new ReportService()
      const data: ThicknessReportData = {
        sessionId: 'test-session-4',
        contact: { email: 'test@example.com' },
        points: [
          { id: '1', label: 'Капот', valueMicrons: 120 }
        ]
      }

      const report = await service.generateReport('test-session-4', ReportType.THICKNESS, data)
      const html = await service.previewReport(report.reportId)

      assert.ok(html.includes('<!DOCTYPE html'))
      assert.ok(html.includes('test-session-4'))
      assert.ok(html.includes('Капот'))
    })

    it('выбрасывает ошибку для несуществующего отчёта', async () => {
      const service = new ReportService()
      
      await assert.rejects(
        async () => await service.previewReport('non-existent-id'),
        { message: 'Report not found' }
      )
    })
  })

  describe('sendReport', () => {
    it('отправляет отчёт на email в DEV режиме', async () => {
      const service = new ReportService()
      const data: ThicknessReportData = {
        sessionId: 'test-session-5',
        contact: { email: 'test@example.com' },
        points: []
      }

      const report = await service.generateReport('test-session-5', ReportType.THICKNESS, data)
      const result = await service.sendReport(report.reportId, {
        channel: DeliveryChannel.EMAIL,
        recipient: 'recipient@example.com'
      })

      assert.ok(result)
      assert.strictEqual(result.channel, DeliveryChannel.EMAIL)
      assert.strictEqual(result.recipient, 'recipient@example.com')
      assert.ok(result.sentAt)
    })

    it('отправляет отчёт по SMS в DEV режиме', async () => {
      const service = new ReportService()
      const data: ObdReportData = {
        sessionId: 'test-session-6',
        contact: { phone: '+79991234567' },
        dtc: [],
        mil: false
      }

      const report = await service.generateReport('test-session-6', ReportType.DIAGNOSTICS, data)
      const result = await service.sendReport(report.reportId, {
        channel: DeliveryChannel.SMS,
        recipient: '+79991234567'
      })

      assert.ok(result)
      assert.strictEqual(result.channel, DeliveryChannel.SMS)
      assert.strictEqual(result.recipient, '+79991234567')
    })
  })

  describe('cleanup', () => {
    it('удаляет истёкшие отчёты', async () => {
      const service = new ReportService()
      const data: ThicknessReportData = {
        sessionId: 'test-session-7',
        contact: { email: 'test@example.com' },
        points: []
      }

      const report = await service.generateReport('test-session-7', ReportType.THICKNESS, data)
      
      // Mock expired date
      const reportMeta = await service.getReport(report.reportId)
      if (reportMeta) {
        reportMeta.expiresAt = new Date(Date.now() - 1000).toISOString()
      }

      const deletedCount = await service.cleanup()
      
      assert.ok(deletedCount >= 0)
      
      const retrievedAfterCleanup = await service.getReport(report.reportId)
      assert.strictEqual(retrievedAfterCleanup, null)
    })
  })
})
