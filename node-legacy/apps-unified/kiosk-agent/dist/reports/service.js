import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { buildHtml, buildPdf } from './components/builder.js';
import { createStorageAdapter } from './components/storage-adapter.js';
import { createMailerAdapter } from './components/mailer-adapter.js';
import { createSmsAdapter } from './components/sms-adapter.js';
import { Counter, Histogram, register } from 'prom-client';
export var ReportType;
(function (ReportType) {
    ReportType["THICKNESS"] = "THICKNESS";
    ReportType["DIAGNOSTICS"] = "DIAGNOSTICS";
})(ReportType || (ReportType = {}));
export var DeliveryChannel;
(function (DeliveryChannel) {
    DeliveryChannel["EMAIL"] = "EMAIL";
    DeliveryChannel["SMS"] = "SMS";
})(DeliveryChannel || (DeliveryChannel = {}));
const generateReportTotal = new Counter({
    name: 'report_generated_total',
    help: 'Total number of reports generated',
    labelNames: ['type', 'status'],
    registers: [register],
});
const deliverReportTotal = new Counter({
    name: 'report_delivered_total',
    help: 'Total number of reports delivered',
    labelNames: ['channel', 'status'],
    registers: [register],
});
const generateReportDuration = new Histogram({
    name: 'report_generation_duration_seconds',
    help: 'Report generation duration in seconds',
    labelNames: ['type'],
    registers: [register],
});
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export class ReportService {
    constructor(storage, mailer, sms) {
        this.reportsMetadata = new Map();
        this.storage = storage || createStorageAdapter();
        this.mailer = mailer || createMailerAdapter();
        this.sms = sms || createSmsAdapter();
    }
    async generateReport(sessionId, type, data) {
        const timer = generateReportDuration.startTimer({ type });
        const reportId = randomUUID();
        try {
            const htmlContent = await buildHtml(data);
            let pdfPath;
            try {
                const pdfBuffer = await buildPdf(data);
                pdfPath = await this.storage.put(reportId, pdfBuffer, 'pdf');
            }
            catch (error) {
                console.warn('[ReportService] PDF generation failed, continuing with HTML only:', error);
            }
            const htmlPath = await this.storage.put(reportId, htmlContent, 'html');
            const report = {
                reportId,
                sessionId,
                type,
                generatedAt: new Date().toISOString(),
                htmlContent,
                pdfPath,
                expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
                metadata: { htmlPath }
            };
            this.reportsMetadata.set(reportId, report);
            generateReportTotal.inc({ type, status: 'success' });
            timer();
            return report;
        }
        catch (error) {
            generateReportTotal.inc({ type, status: 'failed' });
            timer();
            throw error;
        }
    }
    async getReport(reportId) {
        const report = this.reportsMetadata.get(reportId);
        if (!report) {
            return null;
        }
        if (new Date(report.expiresAt) < new Date()) {
            await this.deleteReport(reportId);
            return null;
        }
        return report;
    }
    async previewReport(reportId) {
        const report = await this.getReport(reportId);
        if (!report) {
            throw new Error('Report not found');
        }
        if (report.htmlContent) {
            return report.htmlContent;
        }
        const htmlPath = await this.storage.getUrl(reportId, 'html');
        const htmlContent = await fs.readFile(htmlPath, 'utf8');
        return htmlContent;
    }
    async sendReport(reportId, delivery) {
        const report = await this.getReport(reportId);
        if (!report) {
            throw new Error('Report not found');
        }
        const result = {
            success: false,
            channel: delivery.channel,
            recipient: delivery.recipient,
            sentAt: new Date().toISOString(),
        };
        try {
            if (delivery.channel === DeliveryChannel.EMAIL) {
                await this.sendEmail(report, delivery.recipient);
            }
            else if (delivery.channel === DeliveryChannel.SMS) {
                await this.sendSms(report, delivery.recipient);
            }
            result.success = true;
            deliverReportTotal.inc({ channel: delivery.channel, status: 'success' });
        }
        catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            deliverReportTotal.inc({ channel: delivery.channel, status: 'failed' });
        }
        return result;
    }
    async sendEmail(report, recipient) {
        if (!report.htmlContent) {
            report.htmlContent = await this.previewReport(report.reportId);
        }
        const subject = report.type === ReportType.THICKNESS
            ? `Отчёт толщинометрии ЛКП - ${new Date(report.generatedAt).toLocaleDateString('ru-RU')}`
            : `Отчёт диагностики OBD-II - ${new Date(report.generatedAt).toLocaleDateString('ru-RU')}`;
        await this.mailer.send({
            to: recipient,
            subject,
            htmlBody: report.htmlContent,
            attachmentPath: report.pdfPath,
        });
    }
    async sendSms(report, recipient) {
        const baseUrl = process.env.KIOSK_BASE_URL || 'http://localhost:7070';
        const viewUrl = `${baseUrl}/api/reports/${report.reportId}/preview`;
        const message = report.type === ReportType.THICKNESS
            ? `Отчёт толщинометрии готов: ${viewUrl}`
            : `Отчёт OBD-II готов: ${viewUrl}`;
        await this.sms.send({
            to: recipient,
            message: message.substring(0, 160), // SMS length limit
        });
    }
    async deleteReport(reportId) {
        const report = this.reportsMetadata.get(reportId);
        if (!report) {
            return;
        }
        try {
            await this.storage.delete(reportId, 'html');
            if (report.pdfPath) {
                await this.storage.delete(reportId, 'pdf');
            }
        }
        catch (error) {
            console.warn('[ReportService] Failed to delete report files:', error);
        }
        this.reportsMetadata.delete(reportId);
    }
    async cleanup() {
        const now = new Date();
        let deletedCount = 0;
        for (const [reportId, report] of this.reportsMetadata.entries()) {
            if (new Date(report.expiresAt) < now) {
                await this.deleteReport(reportId);
                deletedCount++;
            }
        }
        return deletedCount;
    }
}
export const reportService = new ReportService();
export function writeReportToOutbox(data, outboxRoot) {
    console.warn('[writeReportToOutbox] Deprecated function, use ReportService instead');
    const id = `${data.sessionId}-${Date.now()}`;
    const html = generateReportHtml(data);
    const htmlPath = path.join(outboxRoot, `${id}.html`);
    import('fs').then(fs => {
        fs.mkdirSync(outboxRoot, { recursive: true });
        fs.writeFileSync(htmlPath, html, 'utf8');
    });
    return { id, htmlPath };
}
export function resolveReportHtmlPathById(outboxRoot, id) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(id))
        return null;
    const htmlPath = path.join(outboxRoot, `${id}.html`);
    try {
        const fs = require('fs');
        return fs.existsSync(htmlPath) ? htmlPath : null;
    }
    catch {
        return null;
    }
}
export function simulateSend(paths, to, outboxRoot) {
    console.warn('[simulateSend] Deprecated function, use ReportService.sendReport instead');
    const logDir = path.join(outboxRoot, 'sent');
    import('fs').then(fs => {
        fs.mkdirSync(logDir, { recursive: true });
        const record = {
            id: paths.id,
            to,
            htmlPath: paths.htmlPath,
            sentAt: new Date().toISOString(),
            note: 'DEV only: simulated send — no external provider configured.'
        };
        fs.writeFileSync(path.join(logDir, `${paths.id}.json`), JSON.stringify(record, null, 2), 'utf8');
    });
}
function generateReportHtml(data) {
    const title = isThickness(data) ? 'Отчёт: толщинометрия ЛКП' : 'Отчёт: диагностика OBD‑II';
    const createdAt = new Date().toLocaleString('ru-RU');
    const contact = [data.contact?.phone, data.contact?.email].filter(Boolean).join(' / ');
    const head = `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${baseCss}</style></head><body>`;
    const header = `<header><h1>${escapeHtml(title)}</h1><div class="meta">Сессия: ${escapeHtml(data.sessionId)} • ${escapeHtml(createdAt)}</div><div class="meta">Контакт: ${escapeHtml(contact || '—')}</div></header>`;
    const body = isThickness(data) ? renderThickness(data) : renderObd(data);
    const foot = `<footer><div class="muted">Создано терминалом самообслуживания. Этот файл может содержать персональные данные; не пересылайте его третьим лицам без согласия.</div></footer>`;
    return `${head}<main class="report">${header}${body}${foot}</main></body></html>`;
}
function renderThickness(data) {
    const summary = data.summary ? `<p class="lead">${escapeHtml(data.summary)}</p>` : '';
    const rows = (data.points || []).map((p) => `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.label)}</td><td class="num">${escapeHtml(String(p.valueMicrons))} мкм</td></tr>`).join('');
    return `
    <section>
      ${summary}
      <h2>Измерения</h2>
      <table class="grid"><thead><tr><th>ID</th><th>Зона</th><th>Толщина</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">Нет данных</td></tr>'}</tbody></table>
    </section>
  `;
}
function renderObd(data) {
    const dtc = data.dtc || [];
    const codes = dtc.length ? dtc.map((c) => `<li><strong>${escapeHtml(c.code)}</strong> ${c.description ? `— ${escapeHtml(c.description)}` : ''}</li>`).join('') : '<div class="muted">Коды неисправностей отсутствуют</div>';
    const clear = data.clearAttempt ? `<div class="meta">Сброс DTC: ${escapeHtml(data.clearAttempt.result)} • ${escapeHtml(data.clearAttempt.at)}</div>` : '';
    return `
    <section>
      <div class="status">MIL: ${data.mil ? '<span class="badge badge-danger">горит</span>' : '<span class="badge badge-ok">погашен</span>'}</div>
      ${clear}
      <h2>Коды неисправностей</h2>
      ${dtc.length ? `<ul class="dtc">${codes}</ul>` : codes}
    </section>
  `;
}
function isThickness(data) {
    return data.points !== undefined;
}
function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
`;
