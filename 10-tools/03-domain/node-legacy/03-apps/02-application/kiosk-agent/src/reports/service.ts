import * as fs from 'fs/promises'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { ThicknessReportData, ObdReportData } from '@selfservice/report'
import { buildHtml, buildPdf } from './components/builder.js'
import { createStorageAdapter, type StorageAdapter } from './components/storage-adapter.js'
import { createMailerAdapter, type MailerAdapter } from './components/mailer-adapter.js'
import { createSmsAdapter, type SmsAdapter } from './components/sms-adapter.js'
import { Counter, Histogram, register } from 'prom-client'

export enum ReportType {
  THICKNESS = 'THICKNESS',
  DIAGNOSTICS = 'DIAGNOSTICS'
}

export enum DeliveryChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS'
}

export interface Report {
  reportId: string
  sessionId: string
  type: ReportType
  generatedAt: string
  htmlContent?: string
  pdfPath?: string
  expiresAt: string
  metadata?: Record<string, unknown>
}

export interface DeliveryOptions {
  channel: DeliveryChannel
  recipient: string
  language?: string
}

export interface DeliveryResult {
  success: boolean
  channel: DeliveryChannel
  recipient: string
  sentAt: string
  error?: string
}

const generateReportTotal = new Counter({
  name: 'report_generated_total',
  help: 'Total number of reports generated',
  labelNames: ['type', 'status'],
  registers: [register],
})

const deliverReportTotal = new Counter({
  name: 'report_delivered_total',
  help: 'Total number of reports delivered',
  labelNames: ['channel', 'status'],
  registers: [register],
})

const generateReportDuration = new Histogram({
  name: 'report_generation_duration_seconds',
  help: 'Report generation duration in seconds',
  labelNames: ['type'],
  registers: [register],
})

const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export class ReportService {
  private storage: StorageAdapter
  private mailer: MailerAdapter
  private sms: SmsAdapter
  private reportsMetadata: Map<string, Report> = new Map()

  constructor(
    storage?: StorageAdapter,
    mailer?: MailerAdapter,
    sms?: SmsAdapter
  ) {
    this.storage = storage || createStorageAdapter()
    this.mailer = mailer || createMailerAdapter()
    this.sms = sms || createSmsAdapter()
  }

  async generateReport(
    sessionId: string,
    type: ReportType,
    data: ThicknessReportData | ObdReportData
  ): Promise<Report> {
    const timer = generateReportDuration.startTimer({ type })
    const reportId = randomUUID()
    
    try {
      const htmlContent = await buildHtml(data)
      let pdfPath: string | undefined

      try {
        const pdfBuffer = await buildPdf(data)
        pdfPath = await this.storage.put(reportId, pdfBuffer, 'pdf')
      } catch (error) {
        console.warn('[ReportService] PDF generation failed, continuing with HTML only:', error)
      }

      const htmlPath = await this.storage.put(reportId, htmlContent, 'html')
      
      const report: Report = {
        reportId,
        sessionId,
        type,
        generatedAt: new Date().toISOString(),
        htmlContent,
        pdfPath,
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
        metadata: { htmlPath }
      }

      this.reportsMetadata.set(reportId, report)
      generateReportTotal.inc({ type, status: 'success' })
      timer()
      
      return report
    } catch (error) {
      generateReportTotal.inc({ type, status: 'failed' })
      timer()
      throw error
    }
  }

  async getReport(reportId: string): Promise<Report | null> {
    const report = this.reportsMetadata.get(reportId)
    
    if (!report) {
      return null
    }

    if (new Date(report.expiresAt) < new Date()) {
      await this.deleteReport(reportId)
      return null
    }

    return report
  }

  async previewReport(reportId: string): Promise<string> {
    const report = await this.getReport(reportId)
    
    if (!report) {
      throw new Error('Report not found')
    }

    if (report.htmlContent) {
      return report.htmlContent
    }

    const htmlPath = await this.storage.getUrl(reportId, 'html')
    const htmlContent = await fs.readFile(htmlPath, 'utf8')
    
    return htmlContent
  }

  async sendReport(
    reportId: string,
    delivery: DeliveryOptions
  ): Promise<DeliveryResult> {
    const report = await this.getReport(reportId)
    
    if (!report) {
      throw new Error('Report not found')
    }

    const result: DeliveryResult = {
      success: false,
      channel: delivery.channel,
      recipient: delivery.recipient,
      sentAt: new Date().toISOString(),
    }

    try {
      if (delivery.channel === DeliveryChannel.EMAIL) {
        await this.sendEmail(report, delivery.recipient)
      } else if (delivery.channel === DeliveryChannel.SMS) {
        await this.sendSms(report, delivery.recipient)
      }

      result.success = true
      deliverReportTotal.inc({ channel: delivery.channel, status: 'success' })
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      deliverReportTotal.inc({ channel: delivery.channel, status: 'failed' })
    }

    return result
  }

  private async sendEmail(report: Report, recipient: string): Promise<void> {
    if (!report.htmlContent) {
      report.htmlContent = await this.previewReport(report.reportId)
    }

    const subject = report.type === ReportType.THICKNESS
      ? `Отчёт толщинометрии ЛКП - ${new Date(report.generatedAt).toLocaleDateString('ru-RU')}`
      : `Отчёт диагностики OBD-II - ${new Date(report.generatedAt).toLocaleDateString('ru-RU')}`

    await this.mailer.send({
      to: recipient,
      subject,
      htmlBody: report.htmlContent,
      attachmentPath: report.pdfPath,
    })
  }

  private async sendSms(report: Report, recipient: string): Promise<void> {
    const baseUrl = process.env.KIOSK_BASE_URL || 'http://localhost:7070'
    const viewUrl = `${baseUrl}/api/reports/${report.reportId}/preview`
    
    const message = report.type === ReportType.THICKNESS
      ? `Отчёт толщинометрии готов: ${viewUrl}`
      : `Отчёт OBD-II готов: ${viewUrl}`

    await this.sms.send({
      to: recipient,
      message: message.substring(0, 160), // SMS length limit
    })
  }

  private async deleteReport(reportId: string): Promise<void> {
    const report = this.reportsMetadata.get(reportId)
    
    if (!report) {
      return
    }

    try {
      await this.storage.delete(reportId, 'html')
      if (report.pdfPath) {
        await this.storage.delete(reportId, 'pdf')
      }
    } catch (error) {
      console.warn('[ReportService] Failed to delete report files:', error)
    }

    this.reportsMetadata.delete(reportId)
  }

  async cleanup(): Promise<number> {
    const now = new Date()
    let deletedCount = 0

    for (const [reportId, report] of this.reportsMetadata.entries()) {
      if (new Date(report.expiresAt) < now) {
        await this.deleteReport(reportId)
        deletedCount++
      }
    }

    return deletedCount
  }
}

export const reportService = new ReportService()

// Legacy compatibility functions (deprecated)
export type AnyReportData = ThicknessReportData | ObdReportData

export interface GeneratedReportPaths {
  id: string
  htmlPath: string
}

export function writeReportToOutbox(data: AnyReportData, outboxRoot: string): GeneratedReportPaths {
  console.warn('[writeReportToOutbox] Deprecated function, use ReportService instead')
  const id = `${data.sessionId}-${Date.now()}`
  const html = generateReportHtml(data)
  const htmlPath = path.join(outboxRoot, `${id}.html`)
  
  import('fs').then(fs => {
    fs.mkdirSync(outboxRoot, { recursive: true })
    fs.writeFileSync(htmlPath, html, 'utf8')
  })
  
  return { id, htmlPath }
}

export function resolveReportHtmlPathById(outboxRoot: string, id: string): string | null {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return null
  const htmlPath = path.join(outboxRoot, `${id}.html`)
  
  try {
    const fs = require('fs')
    return fs.existsSync(htmlPath) ? htmlPath : null
  } catch {
    return null
  }
}

export function simulateSend(paths: GeneratedReportPaths, to: { email?: string; phone?: string }, outboxRoot: string): void {
  console.warn('[simulateSend] Deprecated function, use ReportService.sendReport instead')
  const logDir = path.join(outboxRoot, 'sent')
  
  import('fs').then(fs => {
    fs.mkdirSync(logDir, { recursive: true })
    const record = {
      id: paths.id,
      to,
      htmlPath: paths.htmlPath,
      sentAt: new Date().toISOString(),
      note: 'DEV only: simulated send — no external provider configured.'
    }
    fs.writeFileSync(path.join(logDir, `${paths.id}.json`), JSON.stringify(record, null, 2), 'utf8')
  })
}

function generateReportHtml(data: AnyReportData): string {
  const title = isThickness(data) ? 'Отчёт: толщинометрия ЛКП' : 'Отчёт: диагностика OBD‑II'
  const createdAt = new Date().toLocaleString('ru-RU')
  const contact = [data.contact?.phone, data.contact?.email].filter(Boolean).join(' / ')
  const head = `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${baseCss}</style></head><body>`
  const header = `<header><h1>${escapeHtml(title)}</h1><div class="meta">Сессия: ${escapeHtml(data.sessionId)} • ${escapeHtml(createdAt)}</div><div class="meta">Контакт: ${escapeHtml(contact || '—')}</div></header>`
  const body = isThickness(data) ? renderThickness(data) : renderObd(data)
  const foot = `<footer><div class="muted">Создано терминалом самообслуживания. Этот файл может содержать персональные данные; не пересылайте его третьим лицам без согласия.</div></footer>`
  return `${head}<main class="report">${header}${body}${foot}</main></body></html>`
}

function renderThickness(data: ThicknessReportData): string {
  const summary = data.summary ? `<p class="lead">${escapeHtml(data.summary)}</p>` : ''
  const rows = (data.points || []).map((p) => `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.label)}</td><td class="num">${escapeHtml(String(p.valueMicrons))} мкм</td></tr>`).join('')
  return `
    <section>
      ${summary}
      <h2>Измерения</h2>
      <table class="grid"><thead><tr><th>ID</th><th>Зона</th><th>Толщина</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">Нет данных</td></tr>'}</tbody></table>
    </section>
  `
}

function renderObd(data: ObdReportData): string {
  const dtc = data.dtc || []
  const codes = dtc.length ? dtc.map((c) => `<li><strong>${escapeHtml(c.code)}</strong> ${c.description ? `— ${escapeHtml(c.description)}` : ''}</li>`).join('') : '<div class="muted">Коды неисправностей отсутствуют</div>'
  const clear = data.clearAttempt ? `<div class="meta">Сброс DTC: ${escapeHtml(data.clearAttempt.result)} • ${escapeHtml(data.clearAttempt.at)}</div>` : ''
  return `
    <section>
      <div class="status">MIL: ${data.mil ? '<span class="badge badge-danger">горит</span>' : '<span class="badge badge-ok">погашен</span>'}</div>
      ${clear}
      <h2>Коды неисправностей</h2>
      ${dtc.length ? `<ul class="dtc">${codes}</ul>` : codes}
    </section>
  `
}

function isThickness(data: AnyReportData): data is ThicknessReportData {
  return (data as any).points !== undefined
}

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const baseCss = `
  body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#0F172A; }
  .report { padding: 24px; max-width: 900px; margin: 0 auto; }
  header h1 { margin: 0 0 6px; font-size: 24px; }
  header .meta { color:#64748B; font-size: 13px; }
  .lead { font-size: 16px; margin: 6px 0 12px; }
  h2 { margin: 16px 0 8px; font-size: 18px; }
  .grid { width: 100%; border-collapse: collapse; }
  .grid th, .grid td { border: 1px solid #E5E7EB; padding: 6px 8px; text-align: left; }
  .grid .num { text-align: right; }
  .muted { color:#64748B }
  .badge { display:inline-block; padding:2px 6px; border-radius: 8px; font-size: 12px; color:white; }
  .badge-ok { background:#16A34A; }
  .badge-danger { background:#DC2626; }
  footer { margin-top: 24px; border-top: 1px solid #E5E7EB; padding-top: 12px; }
`
