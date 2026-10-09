import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// No persistence, outbound transport, analytics or contact creation in this module.
export const MAX_WEBHOOK_BYTES = 1024 * 1024;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validSignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  return sameSecret(signature, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
}
function string(value, max = 512) {
  if (typeof value !== 'string' || !value || value.length > max) throw new Error('invalid_payload');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) throw new Error('invalid_timestamp');
  return new Date(Number(value) * 1000).toISOString();
}
function array(value) {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('invalid_batch');
  return value;
}

export function normalizeWebhook(payload, { wabaId, phoneNumberId }) {
  if (!wabaId || !phoneNumberId || payload?.object !== 'whatsapp_business_account') throw new Error('invalid_account');
  const events = new Map();
  for (const entry of array(payload.entry)) {
    if (entry?.id !== wabaId) throw new Error('invalid_account');
    for (const change of array(entry.changes)) {
      // Fail closed for new event types: never silently acknowledge lost history.
      if (change?.field !== 'messages' || change.value?.metadata?.phone_number_id !== phoneNumberId || change.value?.messaging_product !== 'whatsapp') throw new Error('unsupported_event');
      const value = change.value;
      for (const m of array(value.messages ?? [])) {
        const messageId = string(m?.id), sender = string(m?.from, 128);
        const type = string(m.type, 40), occurredAt = timestamp(m.timestamp);
        const name = (value.contacts ?? []).find(c => c.wa_id === sender)?.profile?.name;
        const event = { kind: 'message', wabaId, phoneNumberId, messageId, sender, occurredAt, type,
          displayName: typeof name === 'string' ? name.slice(0, 256) : null,
          text: type === 'text' ? string(m.text?.body, 65536) : null,
          // Unsupported media is represented for human review; never downloaded automatically.
          mediaEnvelope: type === 'text' ? null : structuredClone(m),
          replyToMessageId: typeof m.context?.id === 'string' ? m.context.id : null,
          requiresReview: type !== 'text', attribution: 'unconfirmed' };
        add(['message', wabaId, phoneNumberId, messageId], event);
      }
      for (const s of array(value.statuses ?? [])) {
        const messageId = string(s?.id), status = string(s.status, 40);
        if (!['sent', 'delivered', 'read', 'failed'].includes(status)) throw new Error('unsupported_status');
        const occurredAt = timestamp(s.timestamp);
        const errorCodes = array(s.errors ?? []).map(e => string(String(e.code), 32));
        add(['status', wabaId, phoneNumberId, messageId, status, occurredAt, errorCodes], {
          kind: 'status', wabaId, phoneNumberId, messageId, status, occurredAt, errorCodes
        });
      }
      if (!value.messages?.length && !value.statuses?.length) throw new Error('unsupported_event');
    }
  }
  if (!events.size) throw new Error('empty_batch');
  return [...events.values()];
  function add(identity, event) {
    const eventKey = digest(identity), contentHash = digest(event);
    if (events.has(eventKey) && events.get(eventKey).contentHash !== contentHash) throw new Error('event_conflict');
    events.set(eventKey, { ...event, eventKey, contentHash });
    if (events.size > 1000) throw new Error('invalid_batch');
  }
}

// Derive delivery only from provider evidence, independent of receipt/processing state.
// Failures coexist with success evidence; contradictory observations require review.
export function deliveryEvidence(events) {
  const states = new Set(events.filter(e => e.kind === 'status').map(e => e.status));
  const status = states.has('read') ? 'read' : states.has('delivered') ? 'delivered' :
    states.has('failed') ? 'failed' : states.has('sent') ? 'sent' : 'unknown';
  return { status, requiresReview: states.has('failed') && (states.has('delivered') || states.has('read')) };
}
