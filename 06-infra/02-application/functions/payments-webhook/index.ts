// Edge Function: payments-webhook
// Mirrors Supabase AI agent output. Verifies HMAC and updates payment status via RPC, logs event.
import { createClient } from 'npm:@supabase/supabase-js@2.30.0'
import { HmacSHA256 } from 'npm:crypto-js@4.1.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVIDER_WEBHOOK_SECRET = Deno.env.get('PROVIDER_WEBHOOK_SECRET')!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PROVIDER_WEBHOOK_SECRET) {
  console.error('Missing required env vars')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function verifySignature(body: Uint8Array, signatureHeader: string | null) {
  if (!signatureHeader) return false
  const bodyStr = new TextDecoder().decode(body)
  const hash = HmacSHA256(bodyStr, PROVIDER_WEBHOOK_SECRET).toString()
  return hash === signatureHeader
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  try {
    const signature = req.headers.get('x-provider-signature')
    const raw = new Uint8Array(await req.arrayBuffer())
    if (!verifySignature(raw, signature)) return new Response('Invalid signature', { status: 401 })

    const bodyText = new TextDecoder().decode(raw)
    const payload = JSON.parse(bodyText)
    const provider = payload.provider || payload.source || 'unknown'
    const intent_id = payload.intent_id || payload.id
    const status = payload.status || 'unknown'

    // Update payment via RPC (supports id or intent_id depending on schema)
    const rpcRes = await supabase.rpc('rpc_update_payment_status', {
      p_intent_id: intent_id,
      p_status: status,
      p_payload: payload,
    })
    if (rpcRes.error) {
      console.error('RPC error', rpcRes.error)
    }

    // Best-effort event insert
    const insertRes = await supabase.from('webhook_events').insert([{ provider, intent_id, status, payload }])
    if (insertRes.error) {
      console.warn('Insert webhook_events failed', insertRes.error.message)
    }

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return new Response('Server error', { status: 500 })
  }
})
