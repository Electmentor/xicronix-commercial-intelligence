// Server-only DEV adapter. No dependency, token creation, outbound message API or analytics.
export const DEV_PROJECT = 'rmximatxuaczhpqbcuho';
export function createVerifiedStore({ rpc, organizationId, wabaId, phoneNumberId }) {
  if (!rpc || !organizationId || !wabaId || !phoneNumberId) throw new Error('store_not_configured');
  return {
    async commitBatch(events) {
      await rpc('whatsapp_receive_batch', { p_org: organizationId, p_waba: wabaId, p_phone: phoneNumberId, p_events: events });
      const rows = await rpc('whatsapp_read_receipts', { p_org: organizationId, p_keys: events.map(e => e.eventKey) });
      if (!Array.isArray(rows) || rows.length !== events.length || new Set(rows.map(r => r.eventKey)).size !== events.length) throw new Error('readback_incomplete');
      for (const e of events) if (!rows.some(r => r.eventKey === e.eventKey && r.contentHash === e.contentHash && typeof r.id === 'string' && r.id)) throw new Error('readback_mismatch');
      return { durable: true, receiptId: rows[0].id, eventKeys: rows.map(r => r.eventKey) };
    },
    processReceipt(eventKey, ownerId = null) {
      return rpc('whatsapp_process_receipt', { p_org: organizationId, p_key: eventKey, p_owner: ownerId });
    },
    bindContact(sender, contactId) {
      return rpc('whatsapp_bind_contact', { p_org: organizationId, p_waba: wabaId, p_phone: phoneNumberId, p_sender: sender, p_contact: contactId });
    }
  };
}

export function createDevStore({ env = process.env, fetcher = fetch } = {}) {
  if (env.WHATSAPP_ENVIRONMENT !== 'dev' || env.VERCEL_ENV === 'production') return null;
  const expectedUrl = `https://${DEV_PROJECT}.supabase.co`;
  if (env.WHATSAPP_SUPABASE_URL !== expectedUrl || !env.WHATSAPP_SUPABASE_SERVICE_KEY || !env.WHATSAPP_ORGANIZATION_ID || !env.WHATSAPP_WABA_ID || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  const rpc = async (name, args) => {
    const response = await fetcher(`${expectedUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { apikey: env.WHATSAPP_SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.WHATSAPP_SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!response.ok) throw new Error('storage_unavailable');
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  return createVerifiedStore({ rpc, organizationId: env.WHATSAPP_ORGANIZATION_ID, wabaId: env.WHATSAPP_WABA_ID, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID });
}
