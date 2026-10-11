/** Contract v3. Pure orchestration; all I/O is injected for offline tests. */
export const CONTRACT_VERSION = 3;
export const STORAGE_BUCKET = 'crm-documents';
export const LIMITS = Object.freeze({ requestBytes: 65536, bodyChars: 20000, documents: 10, fileBytes: 20 * 1024 * 1024, totalBytes: 20 * 1024 * 1024 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS = Object.freeze({
  'application/pdf': ['pdf'], 'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
  'text/plain': ['txt'], 'text/csv': ['csv'],
});
export class MailError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new MailError(code, status); };
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export async function readLimitedBytes(response, max) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > max) fail('payload_too_large', 413);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > max) { await reader.cancel(); fail('payload_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function validatePayload(input) {
  if (!isObject(input) || Object.keys(input).some(k => !['lead_id','to','subject','body','document_ids','idempotency_key'].includes(k))) fail('invalid_payload');
  if (!UUID.test(input.lead_id || '') || !UUID.test(input.idempotency_key || '')) fail('invalid_payload');
  if (typeof input.to !== 'string' || typeof input.subject !== 'string' || typeof input.body !== 'string') fail('invalid_payload');
  const to = input.to.trim(), subject = input.subject.trim(), body = input.body.trim();
  if (to.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(to) || /[\r\n]/.test(input.to)) fail('invalid_recipient');
  if (!subject || subject.length > 200 || /[\u0000-\u001f\u007f]/.test(input.subject)) fail('invalid_subject');
  if (!body || body.length > LIMITS.bodyChars || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) fail('invalid_body');
  const ids = input.document_ids ?? [];
  if (!Array.isArray(ids) || ids.length > LIMITS.documents || ids.some(id => typeof id !== 'string' || !UUID.test(id))) fail('invalid_document_ids');
  const document_ids = ids.map(id => id.toLowerCase()).sort();
  if (new Set(document_ids).size !== ids.length) fail('duplicate_document_ids');
  return { lead_id: input.lead_id.toLowerCase(), to, subject, body, document_ids, idempotency_key: input.idempotency_key.toLowerCase() };
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function validateActor(actor) {
  if (!actor?.user?.id || !actor?.profile || actor.user.id !== actor.profile.id) fail('unauthorized', 401);
  if (!UUID.test(actor.profile.organization_id || '') || !['ADMIN','MANAGER','SALES'].includes(actor.profile.role)) fail('forbidden', 403);
}
function validateLead(lead, actor, id) {
  if (!lead || lead.id !== id || lead.organization_id !== actor.profile.organization_id) fail('lead_not_found', 404);
  if (actor.profile.role !== 'ADMIN' && (lead.owner_user_id || lead.created_by) !== actor.user.id) fail('lead_not_found', 404);
}
export function validateDocument(document, version, payload, organizationId) {
  if (!document || !version || document.organization_id !== organizationId || document.lead_id !== payload.lead_id || version.organization_id !== organizationId || version.lead_id !== payload.lead_id || version.document_id !== document.id || !UUID.test(version.id || '')) fail('attachment_not_accessible', 403);
  if (![document.status, version.status].every(status => ['CURRENT','SENT','SIGNED'].includes(status))) fail('attachment_not_sendable', 409);
  if (!version.is_current || !Number.isSafeInteger(version.version_number) || version.version_number < 1 || document.current_version !== version.version_number) fail('attachment_version_unavailable', 409);
  const prefix = `${organizationId}/${payload.lead_id}/${document.id}/v${version.version_number}/`;
  const path = version.storage_path;
  if (typeof path !== 'string' || !path.startsWith(prefix) || !/^[a-zA-Z0-9._-]+$/.test(path.slice(prefix.length)) || path.includes('..') || path.length > 700) fail('invalid_attachment_path');
  const name = version.file_name;
  if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(name)) fail('invalid_attachment_name');
  const mime = String(version.mime_type || '').toLowerCase();
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (!MIME_EXTENSIONS[mime]?.includes(extension)) fail('unsupported_attachment_type', 415);
  const size = Number(version.size_bytes);
  if (!Number.isSafeInteger(size) || size <= 0 || size > LIMITS.fileBytes) fail('attachment_size_invalid', 413);
  return { document_id: document.id, version_id: version.id, version_number: version.version_number, storage_path: path, file_name: name, mime_type: mime, size_bytes: size };
}
function validSignature(bytes, mime) {
  const head = (...values) => values.every((value, i) => bytes[i] === value);
  if (mime === 'application/pdf') return head(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (mime === 'image/png') return head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mime === 'image/jpeg') return head(0xff, 0xd8, 0xff);
  if (mime === 'image/webp') return new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (mime.includes('openxmlformats')) return head(0x50,0x4b,0x03,0x04);
  if (['application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'].includes(mime)) return head(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  try { return !new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0'); } catch { return false; }
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function sentResponse(outbox, replayed, documentIds) {
  return { ok: true, status: 'SENT', delivery_status: 'UNCONFIRMED', provider_message_id: outbox.provider_message_id, outbox_id: outbox.id, replayed, document_ids: documentIds };
}
function replayResponse(existing, fingerprint, actor, payload) {
  if (existing.organization_id !== actor.profile.organization_id || existing.request_hash !== fingerprint || existing.created_by !== actor.user.id || existing.lead_id !== payload.lead_id) fail('idempotency_conflict', 409);
  if (existing.status === 'SENT' && typeof existing.provider_message_id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(existing.provider_message_id)) return { status: 200, body: sentResponse(existing, true, payload.document_ids) };
  if (existing.status === 'FAILED') return { status: 409, body: { ok: false, error: 'previous_attempt_failed', status: 'FAILED', outbox_id: existing.id, requires_review: false, retry_allowed: true } };
  return { status: 409, body: { ok: false, error: 'attempt_requires_review', status: 'UNKNOWN', outbox_id: existing.id, requires_review: true, retry_allowed: false } };
}
export function createHandler({ repository, provider, allowedOrigins = ['https://xicronix-commercial-intelligence.vercel.app'], now = () => new Date().toISOString() }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Origin', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (origin && allowedOrigins.includes(origin)) headers['access-control-allow-origin'] = origin;
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return reply({ ok: false, error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
    let reserved = null;
    let reservationStarted = false;
    try {
      if (!/^Bearer\s+\S+$/i.test(request.headers.get('authorization') || '')) fail('unauthorized', 401);
      const actor = await repository.authenticate(request); validateActor(actor);
      let input;
      try { input = JSON.parse(new TextDecoder().decode(await readLimitedBytes(request, LIMITS.requestBytes))); }
      catch (error) { if (error instanceof MailError) throw error; fail('invalid_json'); }
      const capabilities = await repository.capabilities();
      if (capabilities?.contract_version !== CONTRACT_VERSION || capabilities?.attachments !== true || capabilities?.idempotency !== true || capabilities?.bucket_private !== true) fail('mail_backend_not_ready', 503);
      if (isObject(input) && input.action === 'capabilities' && Object.keys(input).length === 1) return reply({ ok: true, contract_version: CONTRACT_VERSION, attachments: true, idempotency: true, limits: LIMITS });
      const payload = validatePayload(input), organizationId = actor.profile.organization_id;
      const lead = await repository.getLead(payload.lead_id, organizationId, actor); validateLead(lead, actor, payload.lead_id);
      const fingerprint = await sha256(JSON.stringify({ version: CONTRACT_VERSION, organization_id: organizationId, lead_id: payload.lead_id, to: payload.to, subject: payload.subject, body: payload.body, document_ids: payload.document_ids }));
      const previous = await repository.getAttempt(organizationId, payload.idempotency_key);
      if (previous) { const result = replayResponse(previous, fingerprint, actor, payload); return reply(result.body, result.status); }
      const unresolved = await repository.getUnresolved(organizationId, fingerprint);
      if (unresolved) return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false, outbox_id: unresolved.id }, 409);
      const materials = payload.document_ids.length ? await repository.getDocuments(payload.document_ids, payload.lead_id, organizationId, actor) : [];
      if (!Array.isArray(materials) || materials.length !== payload.document_ids.length) fail('attachment_not_accessible', 403);
      const manifest = payload.document_ids.map(id => {
        const matches = materials.filter(item => item.document?.id === id);
        if (matches.length !== 1) fail('attachment_version_unavailable', 409);
        return validateDocument(matches[0].document, matches[0].version, payload, organizationId);
      });
      if (manifest.reduce((sum, item) => sum + item.size_bytes, 0) > LIMITS.totalBytes) fail('attachments_too_large', 413);
      const attachments = [];
      for (const item of manifest) {
        const file = await repository.downloadPrivate(STORAGE_BUCKET, item.storage_path, actor, LIMITS.fileBytes);
        const mime = String(file.mime_type || '').toLowerCase().split(';')[0].trim();
        if (!(file.bytes instanceof Uint8Array) || file.bytes.length !== item.size_bytes) fail('attachment_size_mismatch', 409);
        if (mime !== item.mime_type || !validSignature(file.bytes, item.mime_type)) fail('attachment_type_mismatch', 415);
        item.sha256 = await sha256(file.bytes);
        attachments.push({ filename: item.file_name, content: base64(file.bytes), content_type: item.mime_type });
      }
      const inbound = await repository.getInbound(payload.lead_id, organizationId, actor);
      const mailHeaders = {};
      const messageId = inbound?.source_payload?.message_id || inbound?.source_payload?.messageId;
      if (typeof messageId === 'string' && /^<[^\s<>\r\n]+@[^\s<>\r\n]+>$/.test(messageId) && messageId.length <= 250) { mailHeaders['In-Reply-To'] = messageId; mailHeaders.References = messageId; }
      reservationStarted = true;
      const claim = await repository.claim({ organization_id: organizationId, lead_id: lead.id, institution_id: lead.institution_id || null, contact_id: lead.contact_id || null, inbound_mail_id: inbound?.id || null, from_address: 'info@xicronix.com', to_address: payload.to, subject: payload.subject, body: payload.body, status: 'SENDING', created_by: actor.user.id, idempotency_key: payload.idempotency_key, request_hash: fingerprint, attachment_manifest: manifest, contract_version: CONTRACT_VERSION });
      if (!claim?.claimed) {
        if (claim?.existing) { const result = replayResponse(claim.existing, fingerprint, actor, payload); return reply(result.body, result.status); }
        return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false }, 409);
      }
      if (!claim.row?.id) fail('outbox_reservation_failed', 503);
      reserved = claim.row;
      let result;
      try { result = await provider.send({ from: 'Xicronix Group <info@xicronix.com>', to: [payload.to], subject: payload.subject, text: payload.body, headers: mailHeaders, ...(attachments.length ? { attachments } : {}) }, `crm-v3/${organizationId}/${payload.idempotency_key}`); }
      catch { result = { accepted: false, uncertain: true, code: 'provider_unreachable' }; }
      const providerId = typeof result?.id === 'string' ? result.id.trim() : '';
      if (!result?.accepted || !/^[A-Za-z0-9_-]{1,200}$/.test(providerId) || result.error) {
        const uncertain = result?.uncertain !== false || Boolean(providerId) || Boolean(result?.accepted);
        try { await repository.recordFailure(reserved.id, organizationId, uncertain ? 'SENDING' : 'FAILED', uncertain ? 'PROVIDER_RESULT_UNKNOWN' : 'PROVIDER_REJECTED', now()); } catch { /* Durable SENDING reservation remains the duplicate-send guard. */ }
        return reply({ ok: false, error: uncertain ? 'provider_result_unknown' : 'provider_rejected', status: uncertain ? 'UNKNOWN' : 'FAILED', outbox_id: reserved.id, requires_review: uncertain, retry_allowed: !uncertain }, uncertain ? 202 : 502);
      }
      try {
        const saved = await repository.finalize(reserved.id, organizationId, providerId, now());
        if (saved?.status !== 'SENT' || saved?.provider_message_id !== providerId) throw new Error('finalization_unconfirmed');
        return reply(sentResponse({ id: reserved.id, provider_message_id: providerId }, false, payload.document_ids));
      } catch {
        // Provider acceptance is a fact. Never label it FAILED or invoke the provider again.
        return reply({ ok: false, error: 'accepted_record_pending', status: 'UNKNOWN', provider_status: 'ACCEPTED', delivery_status: 'UNCONFIRMED', provider_message_id: providerId, outbox_id: reserved.id, requires_review: true, retry_allowed: false }, 202);
      }
    } catch (error) {
      if (reservationStarted) return reply({ ok: false, error: 'attempt_requires_review', status: 'UNKNOWN', ...(reserved?.id ? { outbox_id: reserved.id } : {}), requires_review: true, retry_allowed: false }, 202);
      return reply({ ok: false, error: error instanceof MailError ? error.code : 'mail_backend_unavailable', send_attempted: false, retry_allowed: error?.code !== 'idempotency_conflict' }, error instanceof MailError ? error.status : 503);
    }
  };
}
