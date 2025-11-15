import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { buildHtml, buildPdf } from './builder.js'
import type { ThicknessReportData, ObdReportData } from '@selfservice/report'

describe('Report Builder', () => {
  describe('buildHtml', () => {
    it('генерирует HTML для отчёта толщинометрии', async () => {
      const data: ThicknessReportData = {
        sessionId: 'test-session-1',
        contact: { email: 'test@example.com' },
        points: [
          { id: '1', label: 'Капот', valueMicrons: 120 },
          { id: '2', label: 'Крыша', valueMicrons: 100 }
        ],
        summary: 'Тестовый отчёт'
      }

      const html = await buildHtml(data)

      assert.ok(html.includes('<!DOCTYPE html'))
      assert.ok(html.includes('test-session-1'))
      assert.ok(html.includes('test@example.com'))
      assert.ok(html.includes('Капот'))
      assert.ok(html.includes('120'))
    })

    it('генерирует HTML для отчёта OBD', async () => {
      const data: ObdReportData = {
        sessionId: 'test-session-2',
        contact: { phone: '+79991234567' },
        dtc: [
          { code: 'P0171', description: 'Система топливоподачи слишком бедная' }
        ],
        mil: true
      }

      const html = await buildHtml(data)

      assert.ok(html.includes('<!DOCTYPE html'))
      assert.ok(html.includes('test-session-2'))
      assert.ok(html.includes('P0171'))
      assert.ok(html.includes('Система топливоподачи'))
    })

    it('генерирует HTML для отчёта OBD без ошибок', async () => {
      const data: ObdReportData = {
        sessionId: 'test-session-3',
        contact: { email: 'ok@example.com' },
        dtc: [],
        mil: false
      }

      const html = await buildHtml(data)

      assert.ok(html.includes('test-session-3'))
      assert.ok(html.includes('Коды неисправностей'))
    })
  })

  describe('buildPdf', () => {
    it('генерирует PDF для отчёта толщинометрии', async () => {
      const data: ThicknessReportData = {
        sessionId: 'test-session-pdf-1',
        contact: { email: 'pdf@example.com' },
        points: [
          { id: '1', label: 'Дверь передняя левая', valueMicrons: 150 }
        ]
      }

      const pdf = await buildPdf(data)

      assert.ok(pdf instanceof Uint8Array)
      assert.ok(pdf.length > 0)
    })

    it('генерирует PDF для отчёта OBD', async () => {
      const data: ObdReportData = {
        sessionId: 'test-session-pdf-2',
        contact: { phone: '+79991234567' },
        dtc: [
          { code: 'P0420', description: 'Катализатор неэффективен' }
        ],
        mil: true
      }

      const pdf = await buildPdf(data)

      assert.ok(pdf instanceof Uint8Array)
      assert.ok(pdf.length > 0)
    })
  })
})
