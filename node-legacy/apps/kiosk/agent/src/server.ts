/** Minimal HTTP server without DEV simulations (no device simulation). */
import * as http from 'http'
import { Agent } from './index.js'
import { writeReportToOutbox } from './reports/service.js'
import { getMailConfigFromEnv, sendReportEmail } from './reports/mailer.js'
import * as path from 'path'
async function getDevicesStatus() {
  return { devices: [], updatedAt: new Date().toISOString() };
}

export function createServer(env: 'DEV'|'QA'|'PROD' = 'DEV'){
  const agent = new Agent({ env, logLevel: 'info' })
  const state = agent.start()
  // DEV payment simulations removed; payments are disabled until real PSP is integrated

  const server = http.createServer((req: any, res: any) => {
    // CORS headers for kiosk frontend (file:// or http://localhost)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', 'http://localhost')
    const notFound = () => {
      res.writeHead(404, { 'content-type':'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
    }
    const badRequest = (msg: string) => {
      res.writeHead(400, { 'content-type':'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'bad_request', message: msg }))
    }
    const forbidden = (msg: string) => {
      res.writeHead(403, { 'content-type':'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'forbidden', message: msg }))
    }
    const notImplemented = (msg: string) => {
      res.writeHead(501, { 'content-type':'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_implemented', message: msg }))
    }
    const readJson = (cb: (body: any) => void | Promise<void>) => {
      let data = ''
      req.on('data', (chunk: any) => { data += chunk })
      req.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          const maybePromise = cb(parsed)
          if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
            (maybePromise as Promise<void>).catch((err: any) => {
              console.error('[server] async handler failed', err)
              res.writeHead(500, { 'content-type':'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'internal', message: String(err?.message || err) }))
            })
          }
        } catch (e: any) {
          badRequest('invalid_json')
        }
      })
    }

    // Very basic health endpoint; will be replaced by a framework later
    if (url.pathname === '/health'){
      res.writeHead(200, { 'content-type':'application/json' })
      res.end(JSON.stringify({ ok: true, state }))
      return
    }

    // Payments API disabled until real provider is integrated
    if (url.pathname === '/payments/intent' && req.method === 'POST'){
      return notImplemented('payments_disabled')
    }

    if (url.pathname === '/payments/status' && req.method === 'GET'){
      return notImplemented('payments_disabled')
    }

    // confirm-dev removed

    // Devices status (no simulation). When drivers are wired, report actual states.
    if (url.pathname === '/devices/status' && req.method === 'GET'){
      (async () => {
        const status = await getDevicesStatus()
        res.writeHead(200, { 'content-type':'application/json' })
        res.end(JSON.stringify({ ok: true, status }))
      })()
      return
    }

    // Reports: generate only (no simulated sending)
    if (url.pathname === '/reports/generate' && req.method === 'POST'){
      if (env === 'PROD') return forbidden('reports_disabled_in_prod')
      return readJson(async (body) => {
        try {
          const data = body?.data
          if (!data || !data.sessionId || !data.contact) return badRequest('data_required')
          const outboxRoot = process.env.REPORTS_OUTBOX || path.resolve(process.cwd(), 'outbox')
          const generated = await writeReportToOutbox(data, outboxRoot)
          res.writeHead(200, { 'content-type':'application/json' })
          res.end(JSON.stringify({ ok: true, id: generated.id, html: generated.htmlPath, pdf: generated.pdfPath }))
        } catch (e: any) {
          res.writeHead(500, { 'content-type':'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'internal', message: String(e?.message || e) }))
        }
      })
    }
    if (url.pathname === '/reports/send' && req.method === 'POST'){
      if (env === 'PROD') return forbidden('reports_send_disabled_in_prod_until_psp')
      const mailCfg = getMailConfigFromEnv()
      if (!mailCfg) return notImplemented('email_not_configured')
      return readJson(async (body) => {
        try {
          const data = body?.data
          if (!data || !data.sessionId || !data.contact) return badRequest('data_required')
          const contact = data.contact || {}
          const toEmail: string | undefined = contact.email
          if (!toEmail){
            res.writeHead(400, { 'content-type':'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'no_email', message: 'Email обязателен для отправки отчёта.' }))
            return
          }
          const outboxRoot = process.env.REPORTS_OUTBOX || path.resolve(process.cwd(), 'outbox')
          const generated = await writeReportToOutbox(data, outboxRoot)
          const sendRes = await sendReportEmail(toEmail, generated, mailCfg)
          res.writeHead(200, { 'content-type':'application/json' })
          res.end(JSON.stringify({ ok: sendRes.success, id: generated.id, deliveryId: sendRes.deliveryId, error: sendRes.error }))
        } catch (e: any) {
          res.writeHead(500, { 'content-type':'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'send_failed', message: String(e?.message || e) }))
        }
      })
    }

    return notFound()
  })
  return server
}

if (typeof require !== 'undefined' && require.main === module) {
  const server = createServer('DEV')
  const port = process.env.PORT ? Number(process.env.PORT) : 7070
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[agent] http listening on :${port}`)
  })
}
