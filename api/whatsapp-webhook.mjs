import { MAX_WEBHOOK_BYTES, normalizeWebhook, sameSecret, validSignature } from '../whatsapp-intake.mjs';
import { createDevStore } from '../whatsapp-store.mjs';

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_WEBHOOK_BYTES) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_WEBHOOK_BYTES) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

/**
 * DEV-only adapter; exact development project allowlist, production forbidden.
 * commitBatch must atomically insert/deduplicate ALL events, reject conflicting
 * content hashes and return a durable receipt read from committed storage.
 * Tests inject an in-memory double; that does not establish durable reception.
 */
export function createHandler({ env = process.env, commitBatch = createDevStore({ env })?.commitBatch ?? null } = {}) {
  return async request => {
    const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    if (env.VERCEL_ENV === 'production') return reply(503, { ok: false, reason: 'production_not_authorized' });
    if (env.WHATSAPP_INTAKE_ENABLED !== 'true') return reply(503, { ok: false, reason: 'intake_disabled' });
    if (!['GET', 'POST'].includes(request.method)) return reply(405, { ok: false });
    // Subscription itself is blocked until persistence and explicit setup approval.
    if (!commitBatch || !env.WHATSAPP_APP_SECRET || !env.WHATSAPP_VERIFY_TOKEN || !env.WHATSAPP_WABA_ID || !env.WHATSAPP_PHONE_NUMBER_ID) return reply(503, { ok: false, reason: 'intake_not_ready' });
    if (request.method === 'GET') {
      const q = new URL(request.url).searchParams;
      if (q.get('hub.mode') !== 'subscribe' || !sameSecret(q.get('hub.verify_token'), env.WHATSAPP_VERIFY_TOKEN)) return reply(403, { ok: false });
      const challenge = q.get('hub.challenge');
      if (!challenge || !/^\d{1,128}$/.test(challenge)) return reply(400, { ok: false });
      return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { ok: false });
    let raw;
    try { raw = await readBody(request); } catch (error) { return reply(error.message === 'too_large' ? 413 : 400, { ok: false }); }
    if (!validSignature(raw, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) return reply(401, { ok: false });
    let events;
    try {
      events = normalizeWebhook(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), {
        wabaId: env.WHATSAPP_WABA_ID, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID
      });
    } catch { return reply(400, { ok: false, reason: 'invalid_event' }); }
    try {
      const receipt = await commitBatch(events);
      const expected = new Set(events.map(e => e.eventKey));
      const keys = receipt?.eventKeys;
      if (receipt?.durable !== true || typeof receipt.receiptId !== 'string' || !receipt.receiptId || !Array.isArray(keys) || keys.length !== expected.size || new Set(keys).size !== expected.size || keys.some(k => !expected.has(k))) throw new Error('unconfirmed_commit');
      // 200 means durable receipt ONLY. Processing and outbound delivery are separate.
      return reply(200, { ok: true, received: true, processing: 'unconfirmed' });
    } catch {
      // Includes a timeout after commit: provider retry must deduplicate by eventKey.
      return reply(503, { ok: false, reason: 'receipt_unconfirmed' });
    }
  };
}
export default { fetch: createHandler() };
