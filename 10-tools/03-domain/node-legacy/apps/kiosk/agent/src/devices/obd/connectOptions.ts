// Заглушка parseObdConnectPayload / formatObdError
export interface ObdConnectOptions { port?: string; protocol?: string; }
export function parseObdConnectPayload(body: any): { ok: boolean; data?: ObdConnectOptions; error?: string; options?: ObdConnectOptions; issues?: string[] } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_payload', issues: ['invalid_payload'] };
  const data = { port: body.port || 'COM1', protocol: body.protocol || 'auto' };
  return { ok: true, data, options: data, issues: [] };
}
export function formatObdError(e: any) { return String(e?.message || e); }
