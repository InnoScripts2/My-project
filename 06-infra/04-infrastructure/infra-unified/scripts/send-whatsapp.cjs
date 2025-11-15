'use strict'

// WhatsApp sender with two providers:
// - Meta Cloud API (default): env WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
// - Green-API: env GREEN_API_URL, GREEN_INSTANCE_ID, GREEN_API_TOKEN (and chatId via --chat or GREEN_CHAT_ID)
// Args: --to=+79xxxxxxxxx [--chat="7996315xxxx@c.us"] [--text="message"] [--file=path/to/file] [--provider=meta|green]
// If both --text and --file provided, file content will be appended under the text.

const { readFileSync } = require('node:fs')
const { basename } = require('node:path')

function parseArgs() {
  const args = {}
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args[m[1]] = m[2]
  }
  return args
}

async function main() {
  const args = parseArgs()
  if (args.insecure === '1' || args.insecure === 'true') {
    // Allow running behind TLS inspection/proxy by disabling cert verification for this process only
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
  let text = args.text || ''
  const file = args.file

  if (file) {
    try {
      const content = readFileSync(file, 'utf8')
      // WhatsApp text message limit is ~4096 chars; keep a safe margin
      const limit = 3900
      const header = text ? String(text).trim() + '\n\n' : ''
      const remaining = Math.max(0, limit - header.length)
      const body = content.slice(0, remaining)
      text = header + body + (content.length > remaining ? '\n…' : '')
    } catch (e) {
      // Fallback: ignore file if cannot read
      text = text || `Не удалось прочитать файл отчёта: ${basename(file)}`
    }
  }

  if (!text || !text.trim()) {
    throw new Error('Nothing to send: provide --text or --file')
  }

  const providerArg = (args.provider || process.env.WHATSAPP_PROVIDER || '').toLowerCase()
  const hasGreen = !!(
    (args.greenUrl || process.env.GREEN_API_URL) &&
    (args.greenInstance || process.env.GREEN_INSTANCE_ID) &&
    (args.greenToken || process.env.GREEN_API_TOKEN)
  )
  const hasMeta = !!(args.token || process.env.WHATSAPP_TOKEN || process.env.META_WHATSAPP_TOKEN) && !!(args.phoneId || process.env.WHATSAPP_PHONE_ID || process.env.META_WHATSAPP_PHONE_ID)
  const provider = providerArg || (hasGreen ? 'green' : 'meta')

  if (provider === 'green') {
    const baseUrl = args.greenUrl || process.env.GREEN_API_URL
    const instanceId = args.greenInstance || process.env.GREEN_INSTANCE_ID
    const apiToken = args.greenToken || process.env.GREEN_API_TOKEN
    const chatArg = args.chat || process.env.GREEN_CHAT_ID
    let chatId = chatArg
    if (!chatId) {
      // Derive from --to or WHATSAPP_PHONE as digits-only + '@c.us'
      const toPhone = args.to || process.env.WHATSAPP_PHONE
      if (!toPhone) throw new Error('Green-API: provide --chat or set GREEN_CHAT_ID or pass --to/WHATSAPP_PHONE to derive chatId')
      const digits = String(toPhone).replace(/\D/g, '')
      chatId = `${digits}@c.us`
    }
    const url = `${baseUrl.replace(/\/$/, '')}/waInstance${encodeURIComponent(instanceId)}/sendMessage/${encodeURIComponent(apiToken)}`
    const payload = { chatId, message: text, customPreview: {} }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = data && data.errorMessage ? data.errorMessage : res.statusText
      throw new Error(`Green-API error: ${res.status} ${err}`)
    }
    process.stdout.write(JSON.stringify({ ok: true, provider: 'green', chatId, id: data.idMessage || null }))
    return
  }

  // default: meta cloud api
  const token = args.token || process.env.WHATSAPP_TOKEN || process.env.META_WHATSAPP_TOKEN
  const phoneId = args.phoneId || process.env.WHATSAPP_PHONE_ID || process.env.META_WHATSAPP_PHONE_ID
  const to = args.to || process.env.WHATSAPP_PHONE
  if (!token) throw new Error('Meta: WHATSAPP_TOKEN is required')
  if (!phoneId) throw new Error('Meta: WHATSAPP_PHONE_ID is required')
  if (!to) throw new Error('Meta: recipient phone is required via --to or WHATSAPP_PHONE')

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`
  const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }

    let res, data
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      data = await res.json().catch(() => ({}))
    } catch (e) {
      const details = { name: e?.name, code: e?.code, message: e?.message }
      console.error('Network error calling WhatsApp API:', details)
      throw new Error('fetch failed')
    }
    if (!res.ok) {
      const err = data && data.error ? `${data.error.message || 'Unknown error'} (code=${data.error.code || 'n/a'})` : res.statusText
      throw new Error(`WhatsApp API error: ${res.status} ${err}`)
    }
  process.stdout.write(JSON.stringify({ ok: true, provider: 'meta', to, id: data.messages?.[0]?.id || null }))
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message || err))
    process.exit(1)
  })
}
