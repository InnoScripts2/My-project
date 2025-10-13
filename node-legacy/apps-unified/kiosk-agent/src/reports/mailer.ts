import nodemailer from 'nodemailer'
import * as fs from 'fs/promises'

export interface MailConfig {
  host: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from: string
}

export function getMailConfigFromEnv(): MailConfig | null {
  const host = process.env.SMTP_HOST
  const from = process.env.SMTP_FROM
  if (!host || !from) return null
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const secure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  return { host, port, secure, user, pass, from }
}

export async function sendReportEmail(toEmail: string, subject: string, htmlFilePath: string, cfg: MailConfig){
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port ?? (cfg.secure ? 465 : 587),
    secure: !!cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  })

  const html = await fs.readFile(htmlFilePath, 'utf8')

  const info = await transporter.sendMail({
    from: cfg.from,
    to: toEmail,
    subject,
    html,
    attachments: [
      { filename: htmlFilePath.split(/[\\/]/).pop() || 'report.html', path: htmlFilePath, contentType: 'text/html' }
    ]
  })

  return { messageId: info.messageId }
}
