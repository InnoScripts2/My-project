// Kiosk Agent (DEV) - runnable CommonJS server (no TypeScript build required)
// Endpoints: /health, /payments/intent (POST), /payments/status (GET), /payments/confirm-dev (POST)
// Usage: node apps/kiosk-agent/server.cjs

const http = require('http')
const { exec } = require('child_process')

const env = process.env.ENV || 'DEV'
const intents = new Map() // id -> { id, amount, currency, status, meta }

function json(res, code, obj){
  res.writeHead(code, {
    'content-type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(obj))
}

function parseBody(req){
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({ __invalid: true }) }
    })
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const url = new URL(req.url || '/', 'http://localhost')

  if (url.pathname === '/health'){
    return json(res, 200, { ok: true, env })
  }

  if (url.pathname === '/payments/intent' && req.method === 'POST'){
    if (env === 'PROD') return json(res, 403, { ok:false, error:'payments_disabled_in_prod' })
    const body = await parseBody(req)
    if (body.__invalid) return json(res, 400, { ok:false, error:'invalid_json' })
    const amount = Number(body.amount)
    const currency = String(body.currency || 'RUB')
    const meta = body.meta || undefined
    if (!amount || amount < 1) return json(res, 400, { ok:false, error:'amount_required' })
    const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const intent = { id, amount, currency, status: 'pending', meta }
    intents.set(id, intent)
    return json(res, 200, { ok:true, intent })
  }

  if (url.pathname === '/payments/status' && req.method === 'GET'){
    if (env === 'PROD') return json(res, 403, { ok:false, error:'payments_disabled_in_prod' })
    const id = url.searchParams.get('id') || ''
    if (!id) return json(res, 400, { ok:false, error:'id_required' })
    const intent = intents.get(id)
    if (!intent) return json(res, 404, { ok:false, error:'not_found' })
    return json(res, 200, { ok:true, status: intent.status })
  }

  if (url.pathname === '/payments/confirm-dev' && req.method === 'POST'){
    if (env !== 'DEV') return json(res, 403, { ok:false, error:'confirm_dev_only_in_dev' })
    const body = await parseBody(req)
    if (body.__invalid) return json(res, 400, { ok:false, error:'invalid_json' })
    const id = String(body.id || '')
    if (!id) return json(res, 400, { ok:false, error:'id_required' })
    const intent = intents.get(id)
    if (!intent) return json(res, 404, { ok:false, error:'not_found' })
    intent.status = 'succeeded'
    return json(res, 200, { ok:true, status: intent.status })
  }

  if (url.pathname === '/devices/status' && req.method === 'GET'){
    // Heuristic detection for Windows: list serial ports via PowerShell and
    // try to recognize common OBD/ELM/Bluetooth serial adapters by name.
    // No data simulation is performed.
    const finish = (status) => json(res, 200, { ok: true, status })
    if (process.platform !== 'win32') {
      return finish({ thickness: 'not_connected', obd: 'not_connected' })
    }
    const ps = 'Try { (Get-CimInstance Win32_SerialPort | Select-Object -ExpandProperty Name) -join "`n" } Catch { "" }'
    exec(`powershell -NoProfile -Command "${ps}"`, { timeout: 2500 }, (err, stdout) => {
      if (err) return finish({ thickness: 'not_connected', obd: 'not_connected' })
      const lines = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      const rx = /(ELM|OBD|CH340|CP210|FTDI|Bluetooth)/i
      const hasObdLike = lines.some(l => /\(COM\d+\)/i.test(l) && rx.test(l))
      const obd = hasObdLike ? 'connected' : 'not_connected'
      const thickness = 'not_connected'
      return finish({ thickness, obd })
    })
    return
  }

  return json(res, 404, { ok:false, error:'not_found' })
})

const port = process.env.PORT ? Number(process.env.PORT) : 7070
server.listen(port, () => console.log(`[agent:cjs] http listening on :${port} (env=${env})`))
