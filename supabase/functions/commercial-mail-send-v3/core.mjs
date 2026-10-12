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
  if (!isObject(input) || Object.keys(input).some(k => !['lead_id','to','subject','body','document_ids','idempotency_key','reply_to_inbox_id','reply_source_hash'].includes(k))) fail('invalid_payload');
  if (!UUID.test(input.lead_id || '') || !UUID.test(input.idempotency_key || '')) fail('invalid_payload');
  if (typeof input.to !== 'string' || typeof input.subject !== 'string' || typeof input.body !== 'string') fail('invalid_payload');
  const to = input.to.trim(), subject = input.subject.trim(), body = input.body.trim();
  if (to.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(to) || /[\r\n]/.test(input.to)) fail('invalid_recipient');
  if (!subject || subject.length > 200 || /[\u0000-\u001f\u007f]/.test(input.subject)) fail('invalid_subject');
  if (!body || body.length > LIMITS.bodyChars || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) fail('invalid_body');
  const reply_to_inbox_id = input.reply_to_inbox_id ?? null;
  if (reply_to_inbox_id !== null && (typeof reply_to_inbox_id !== 'string' || !UUID.test(reply_to_inbox_id))) fail('invalid_reply_context');
  const reply_source_hash = input.reply_source_hash ?? null;
  if (reply_to_inbox_id ? (typeof reply_source_hash !== 'string' || !/^[a-f0-9]{64}$/i.test(reply_source_hash)) : reply_source_hash !== null) fail('invalid_reply_context');
  const ids = input.document_ids ?? [];
  if (!Array.isArray(ids) || ids.length > LIMITS.documents || ids.some(id => typeof id !== 'string' || !UUID.test(id))) fail('invalid_document_ids');
  const document_ids = ids.map(id => id.toLowerCase()).sort();
  if (new Set(document_ids).size !== ids.length) fail('duplicate_document_ids');
  return { lead_id: input.lead_id.toLowerCase(), to, subject, body, document_ids, idempotency_key: input.idempotency_key.toLowerCase(), reply_to_inbox_id: reply_to_inbox_id?.toLowerCase() ?? null, reply_source_hash: reply_source_hash?.toLowerCase() ?? null };
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function providerEvidenceId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return '';
  const token = id.toLowerCase().replace(/[-_]/g, '');
  return /^(?:no|nodisponible|sinid|none|null|undefined|false|true|na|unknown|pending|unavailable|notavailable|notprovided|missing|0)$/.test(token) ? '' : id;
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
const replyText = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
function evidencedBody(value, subject) {
  const text = replyText(value);
  return text && text !== replyText(subject) && !/^(?:contenido (?:del correo |completo )?no disponible|contenido (?:completo )?pendiente|sin contenido)(?:\b|[.:])/i.test(text) ? text : '';
}
function replyHeader(inbound) {
  const candidates = [inbound.source_payload?.message_id, inbound.source_payload?.messageId].filter(value => typeof value === 'string' && value);
  if (candidates.some(value => /[\r\n]/.test(value))) fail('reply_thread_unavailable', 409);
  const valid = [...new Set(candidates.map(value => value.trim()).filter(value => value.length <= 250 && /^<[^\s<>]+@[^\s<>]+>$/.test(value)))];
  // A provider's opaque email_id / messageId is not a MIME Message-ID. Historical
  // Resend rows with only email_id/source, and Zoho numeric IDs, stay blocked until
  // original RFC header evidence is recovered; never invent a thread or borrow one.
  if (valid.length !== 1) fail('reply_thread_unavailable', 409);
  return valid[0];
}
async function replyContent(inbound, repository, actor) {
  const source = inbound.source_payload;
  if (inbound.provider !== 'RESEND_FORWARD' || source?.source !== 'resend-forward' || !replyText(inbound.provider_message_id) || inbound.provider_message_id !== source.email_id) fail('reply_content_unavailable', 409);
  const summary = evidencedBody(inbound.summary, inbound.subject);
  if (!summary) fail('reply_content_unavailable', 409);
  // Known intake stores at most 1200 summary characters. Measure raw length:
  // trimming a trailing space must not turn a truncated excerpt into complete text.
  if (inbound.summary.length < 1200) return summary;
  const received = Date.parse(inbound.received_at);
  if (!Number.isFinite(received) || !replyText(inbound.subject)) fail('reply_content_incomplete', 409);
  const rows = await repository.getInboundActivities(inbound, actor);
  // Adapter fetches at most two exact matches: more than one is ambiguous, including
  // an accidental matching outbound. No broader contact/latest-activity fallback.
  if (!Array.isArray(rows) || rows.length !== 1) fail('reply_content_incomplete', 409);
  const row = rows[0];
  const body = evidencedBody(row.notes, inbound.subject);
  if (row.organization_id !== inbound.organization_id || row.lead_id !== inbound.lead_id || row.type !== 'EMAIL' || replyText(row.subject) !== replyText(inbound.subject) || Date.parse(row.occurred_at) !== received || (row.contact_id ?? null) !== (inbound.contact_id ?? null) || !body || row.notes.length >= 4000 || replyText(body.slice(0,1200)) !== summary) fail('reply_content_incomplete', 409);
  return body;
}
async function resolveReplyBinding(payload, organizationId, actor, repository, lead) {
  if (!payload.reply_to_inbox_id) {
    // This is only an existence guard after lead authorization, never an auto-selected
    // source. Service-side org/lead scoping avoids silently bypassing a hidden inbox row.
    const exists = await repository.hasInbound(lead, organizationId, actor);
    if (typeof exists !== 'boolean') fail('mail_backend_unavailable', 503);
    if (exists) fail('reply_context_required', 409);
    return { inbound: null, headers: {}, snapshot: 'NO_INBOUND' };
  }
  const inbound = await repository.getInbound(payload.reply_to_inbox_id, payload.lead_id, organizationId, actor);
  if (!inbound || inbound.id !== payload.reply_to_inbox_id || inbound.organization_id !== organizationId || inbound.lead_id !== payload.lead_id) fail('reply_context_not_accessible', 404);
  const sender = typeof inbound.from_address === 'string' ? inbound.from_address.trim() : '';
  if (sender.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(sender) || /[\r\n]/.test(inbound.from_address || '')) fail('reply_sender_unavailable', 409);
  if (payload.to.toLowerCase() !== sender.toLowerCase()) fail('reply_recipient_mismatch', 409);
  const messageId = replyHeader(inbound);
  const content = await replyContent(inbound, repository, actor);
  const received = Date.parse(inbound.received_at);
  if (!Number.isFinite(received)) fail('reply_content_unavailable', 409);
  // Public reply-binding contract: SHA256 of this ordered JSON object in UTF-8.
  // Client computes it from the source the user reviewed, not from the outgoing
  // draft. Thus an edit before this request is also detected, even without realtime.
  const reviewedSource = JSON.stringify({ id: inbound.id, lead_id: payload.lead_id, from_address: sender.toLowerCase(), subject: replyText(inbound.subject), received_at: new Date(received).toISOString(), message_id: messageId, content });
  if (await sha256(reviewedSource) !== payload.reply_source_hash) fail('reply_context_changed', 409);
  return { inbound, headers: { 'In-Reply-To': messageId, References: messageId }, snapshot: JSON.stringify({ id: inbound.id, organization_id: organizationId, lead_id: payload.lead_id, sender: sender.toLowerCase(), messageId, content, subject: inbound.subject, received_at: inbound.received_at, provider: inbound.provider, provider_message_id: inbound.provider_message_id }) };
}
function sentResponse(outbox, replayed, documentIds, replyId) {
  return { ok: true, status: 'SENT', delivery_status: 'UNCONFIRMED', provider_message_id: outbox.provider_message_id, outbox_id: outbox.id, replayed, document_ids: documentIds, reply_to_inbox_id: replyId };
}
function replayResponse(existing, fingerprint, actor, payload) {
  if (existing.organization_id !== actor.profile.organization_id || existing.request_hash !== fingerprint || existing.created_by !== actor.user.id || existing.lead_id !== payload.lead_id) fail('idempotency_conflict', 409);
  if ((existing.inbound_mail_id ?? null) !== payload.reply_to_inbox_id) {
    // A changed/null FK cannot substantiate the original source anymore. Preserve
    // any known provider acceptance, but never report a different source as SENT.
    const accepted = existing.status === 'SENT' && providerEvidenceId(existing.provider_message_id);
    return { status: 409, body: { ok: false, error: 'attempt_requires_review', status: 'UNKNOWN', outbox_id: existing.id, requires_review: true, retry_allowed: false, ...(accepted ? { provider_status: 'ACCEPTED', provider_message_id: existing.provider_message_id, delivery_status: 'UNCONFIRMED' } : {}) } };
  }
  if (existing.status === 'SENT' && providerEvidenceId(existing.provider_message_id)) return { status: 200, body: sentResponse(existing, true, payload.document_ids, payload.reply_to_inbox_id) };
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
      if (isObject(input) && input.action === 'capabilities' && Object.keys(input).length === 1) return reply({ ok: true, contract_version: CONTRACT_VERSION, attachments: true, idempotency: true, reply_binding: true, limits: LIMITS });
      const payload = validatePayload(input), organizationId = actor.profile.organization_id;
      const lead = await repository.getLead(payload.lead_id, organizationId, actor); validateLead(lead, actor, payload.lead_id);
      const requestContent = { version: CONTRACT_VERSION, organization_id: organizationId, lead_id: payload.lead_id, to: payload.to, subject: payload.subject, body: payload.body, document_ids: payload.document_ids };
      const fingerprint = await sha256(JSON.stringify({ ...requestContent, reply_to_inbox_id: payload.reply_to_inbox_id, reply_source_hash: payload.reply_source_hash }));
      const legacyFingerprint = await sha256(JSON.stringify(requestContent));
      const previous = await repository.getAttempt(organizationId, payload.idempotency_key);
      if (previous) { const result = replayResponse(previous, fingerprint, actor, payload); return reply(result.body, result.status); }
      // Source/body edits and a new key must not bypass an uncertain attempt. Freeze
      // this case while its ledger contains unresolved or legacy unproven sends.
      const pendingCase = await repository.getPendingCase(organizationId, payload.lead_id);
      if (pendingCase) return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false, outbox_id: pendingCase.id }, 409);
      const unresolved = await repository.getUnresolved(organizationId, fingerprint) || await repository.getUnresolved(organizationId, legacyFingerprint);
      if (unresolved) return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false, outbox_id: unresolved.id }, 409);
      // Durable SENT/UNKNOWN replay guards above run before reading mutable sources.
      const replyBinding = await resolveReplyBinding(payload, organizationId, actor, repository, lead);
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
      // Downloads/awaits must not silently switch, readdress or reinterpret the source.
      const currentBinding = await resolveReplyBinding(payload, organizationId, actor, repository, lead);
      if (currentBinding.snapshot !== replyBinding.snapshot) fail('reply_context_changed', 409);
      const inbound = replyBinding.inbound;
      const mailHeaders = replyBinding.headers;
      reservationStarted = true;
      const claim = await repository.claim({ organization_id: organizationId, lead_id: lead.id, institution_id: lead.institution_id || null, contact_id: lead.contact_id || null, inbound_mail_id: inbound?.id || null, from_address: 'info@xicronix.com', to_address: payload.to, subject: payload.subject, body: payload.body, status: 'SENDING', created_by: actor.user.id, idempotency_key: payload.idempotency_key, request_hash: fingerprint, attachment_manifest: manifest, contract_version: CONTRACT_VERSION });
      if (!claim?.claimed) {
        if (claim?.existing) { const result = replayResponse(claim.existing, fingerprint, actor, payload); return reply(result.body, result.status); }
        return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false }, 409);
      }
      if (!claim.row?.id) fail('outbox_reservation_failed', 503);
      reserved = claim.row;
      // Close the precheck/claim race without inventing a second ledger or queue.
      // Concurrent different hashes can reserve; neither may send while another
      // SENDING row remains. Leave all reservations intact for explicit review.
      const competing = await repository.getPendingCase(organizationId, payload.lead_id, reserved.id);
      if (competing) return reply({ ok: false, error: 'matching_attempt_requires_review', status: 'UNKNOWN', requires_review: true, retry_allowed: false, outbox_id: reserved.id }, 409);
      let result;
      try { result = await provider.send({ from: 'Xicronix Group <info@xicronix.com>', to: [payload.to], subject: payload.subject, text: payload.body, headers: mailHeaders, ...(attachments.length ? { attachments } : {}) }, `crm-v3/${organizationId}/${payload.idempotency_key}`); }
      catch { result = { accepted: false, uncertain: true, code: 'provider_unreachable' }; }
      const providerId = providerEvidenceId(result?.id);
      if (!result?.accepted || !providerId || result.error) {
        const uncertain = result?.uncertain !== false || Boolean(providerId) || Boolean(result?.accepted);
        try { await repository.recordFailure(reserved.id, organizationId, uncertain ? 'SENDING' : 'FAILED', uncertain ? 'PROVIDER_RESULT_UNKNOWN' : 'PROVIDER_REJECTED', now()); } catch { /* Durable SENDING reservation remains the duplicate-send guard. */ }
        return reply({ ok: false, error: uncertain ? 'provider_result_unknown' : 'provider_rejected', status: uncertain ? 'UNKNOWN' : 'FAILED', outbox_id: reserved.id, requires_review: uncertain, retry_allowed: !uncertain }, uncertain ? 202 : 502);
      }
      try {
        const saved = await repository.finalize(reserved.id, organizationId, providerId, now());
        if (saved?.status !== 'SENT' || saved?.provider_message_id !== providerId) throw new Error('finalization_unconfirmed');
        return reply(sentResponse({ id: reserved.id, provider_message_id: providerId }, false, payload.document_ids, payload.reply_to_inbox_id));
      } catch {
        // Provider acceptance is a fact. Never label it FAILED or invoke the provider again.
        return reply({ ok: false, error: 'accepted_record_pending', status: 'UNKNOWN', provider_status: 'ACCEPTED', delivery_status: 'UNCONFIRMED', provider_message_id: providerId, outbox_id: reserved.id, requires_review: true, retry_allowed: false }, 202);
      }
    } catch (error) {
      if (reservationStarted) return reply({ ok: false, error: 'attempt_requires_review', status: 'UNKNOWN', ...(reserved?.id ? { outbox_id: reserved.id } : {}), requires_review: true, retry_allowed: false }, 202);
      if (error?.code === 'mail_history_review_required') return reply({ ok: false, error: error.code, send_attempted: false, requires_review: true, retry_allowed: false }, 409);
      return reply({ ok: false, error: error instanceof MailError ? error.code : 'mail_backend_unavailable', send_attempted: false, retry_allowed: error?.code !== 'idempotency_conflict' }, error instanceof MailError ? error.status : 503);
    }
  };
}
