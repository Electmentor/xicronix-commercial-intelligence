import { MailError, readLimitedBytes, STORAGE_BUCKET, providerEvidenceId } from './core.mjs';

const TIMEOUT_MS = 15000;
/** Fixed configured Supabase host; caller input can never select a URL or bucket. */
export function createRepository({ url, publicKey, serviceKey, fetcher = fetch }) {
  let base;
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') throw new Error(); base = parsed.origin; } catch { throw new MailError('mail_backend_not_configured', 503); }
  if (!publicKey || !serviceKey) throw new MailError('mail_backend_not_configured', 503);
  const serviceHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
  const actorHeaders = actor => ({ apikey: publicKey, authorization: actor.authorization, 'content-type': 'application/json' });
  async function jsonRequest(path, { headers = serviceHeaders, method = 'GET', body } = {}) {
    const response = await fetcher(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    let data;
    try { const bytes = await readLimitedBytes(response, 1024 * 1024); data = bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : null; } catch { throw new MailError('mail_backend_unavailable', 503); }
    if (!response.ok) { const error = new MailError('mail_backend_unavailable', 503); error.dbCode = typeof data?.code === 'string' ? data.code : ''; throw error; }
    return data;
  }
  const tablePath = (name, query) => `/rest/v1/${name}?${new URLSearchParams(query)}`;
  async function rows(name, query, actor) {
    const data = await jsonRequest(tablePath(name, query), { headers: actor ? actorHeaders(actor) : serviceHeaders });
    if (!Array.isArray(data)) throw new MailError('mail_backend_unavailable', 503);
    return data;
  }
  async function one(name, query, actor) {
    const data = await rows(name, { ...query, limit: '2' }, actor);
    if (data.length > 1) throw new MailError('mail_backend_unavailable', 503);
    return data[0] || null;
  }
  const attemptSelect = 'id,organization_id,lead_id,created_by,status,provider_message_id,request_hash,idempotency_key,inbound_mail_id';
  const repository = {
    async authenticate(request) {
      const authorization = request.headers.get('authorization');
      const response = await fetcher(`${base}/auth/v1/user`, { headers: { apikey: publicKey, authorization }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
      if (!response.ok) throw new MailError('unauthorized', 401);
      const user = JSON.parse(new TextDecoder().decode(await readLimitedBytes(response, 65536)));
      if (!user?.id || user.is_anonymous === true) throw new MailError('unauthorized', 401);
      const actor = { user, authorization };
      actor.profile = await one('profiles', { select: 'id,organization_id,role', id: `eq.${user.id}` }, actor);
      return actor;
    },
    async capabilities() {
      const contract = await jsonRequest('/rest/v1/rpc/crm_mail_send_contract_v3', { method: 'POST', body: {} });
      const bucket = await jsonRequest(`/storage/v1/bucket/${STORAGE_BUCKET}`);
      return { ...contract, bucket_private: bucket?.id === STORAGE_BUCKET && bucket?.public === false };
    },
    getLead(id, org, actor) {
      return one('leads', { select: 'id,organization_id,institution_id,contact_id,owner_user_id,created_by', id: `eq.${id}`, organization_id: `eq.${org}` }, actor);
    },
    getAttempt(org, key) {
      return one('commercial_mail_outbox', { select: attemptSelect, organization_id: `eq.${org}`, idempotency_key: `eq.${key}` });
    },
    getUnresolved(org, fingerprint) {
      return one('commercial_mail_outbox', { select: 'id', organization_id: `eq.${org}`, request_hash: `eq.${fingerprint}`, status: 'eq.SENDING' });
    },
    async getPendingCase(org, lead, excludeId = null) {
      const scope = { organization_id: `eq.${org}`, lead_id: `eq.${lead}`, ...(excludeId ? { id: `neq.${excludeId}` } : {}) };
      // Also handles UNKNOWN if present, without assuming it is an enum member.
      const unresolved = await rows('commercial_mail_outbox', { select: 'id', ...scope, status: 'not.in.(SENT,FAILED)', limit: '1' });
      if (unresolved.length) return unresolved[0];
      // v2 could mark SENT with no provider evidence. Do not backfill or rewrite
      // those rows; freeze the case until reviewed, as the UI already does.
      // Stable pagination cannot silently hide invalid evidence beyond a row cap.
      // If the bounded inspection cannot finish, fail closed instead of sending.
      let offset = 0;
      for (let page = 0; page < 10 && offset < 1000; page++) {
        const sent = await rows('commercial_mail_outbox', { select: 'id,provider_message_id', ...scope, status: 'eq.SENT', order: 'id.asc', limit: '100', offset: String(offset) });
        if (!sent.length) return null;
        const unproven = sent.find(row => !providerEvidenceId(row.provider_message_id));
        if (unproven) return { id: unproven.id };
        // The server may cap below our requested limit; only an empty page proves
        // exhaustion. Advance by actual rows, never assume a short page is final.
        offset += sent.length;
      }
      throw new MailError('mail_history_review_required', 409);
    },
    async getDocuments(ids, lead, org, actor) {
      const filter = { organization_id: `eq.${org}`, lead_id: `eq.${lead}` };
      const documents = await rows('documents', { select: 'id,organization_id,lead_id,current_version,status', ...filter, id: `in.(${ids.join(',')})` }, actor);
      const versions = await rows('document_versions', { select: 'id,organization_id,lead_id,document_id,version_number,is_current,status,storage_path,file_name,mime_type,size_bytes', ...filter, document_id: `in.(${ids.join(',')})`, is_current: 'eq.true' }, actor);
      return documents.flatMap(document => {
        const matching = versions.filter(version => version.document_id === document.id);
        return matching.length ? matching.map(version => ({ document, version })) : [{ document, version: null }];
      });
    },
    async downloadPrivate(bucket, path, actor, limit) {
      if (bucket !== STORAGE_BUCKET || typeof path !== 'string' || path.startsWith('/') || path.includes('..') || path.includes('%')) throw new MailError('invalid_attachment_path');
      const response = await fetcher(`${base}/storage/v1/object/authenticated/${STORAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: actorHeaders(actor), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
      if (!response.ok) throw new MailError('attachment_download_failed', 409);
      return { bytes: await readLimitedBytes(response, limit), mime_type: response.headers.get('content-type') };
    },
    async hasInbound(lead, org, actor) {
      // Boolean only, after core authorized this lead. Do not choose a hidden/latest
      // source using service credentials or return any inbox content from this guard.
      if (!lead?.id || lead.organization_id !== org || !actor?.authorization) throw new MailError('reply_context_not_accessible', 404);
      const inboxExists = async query => (await rows('commercial_mail_inbox', { select: 'id', organization_id: `eq.${org}`, limit: '1', ...query })).length > 0;
      if (await inboxExists({ lead_id: `eq.${lead.id}` })) return true;
      const emails = new Set();
      for (const [table, id] of [['contacts', lead.contact_id], ['institutions', lead.institution_id]]) {
        if (!id) continue;
        const related = await one(table, { select: 'id,organization_id,email', id: `eq.${id}`, organization_id: `eq.${org}` }, actor);
        if (!related || related.id !== id || related.organization_id !== org) throw new MailError('reply_context_not_accessible', 404);
        // A contact-only orphan blocks new mail; it is never adopted as a source.
        if (table === 'contacts' && await inboxExists({ lead_id: 'is.null', contact_id: `eq.${related.id}` })) return true;
        const email = typeof related.email === 'string' ? related.email.trim().toLowerCase() : '';
        if (!email) continue;
        if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(email) || /[\r\n]/.test(related.email)) throw new MailError('reply_context_not_accessible', 404);
        emails.add(email);
      }
      for (const email of emails) {
        // Literal case-insensitive match, not an interpolated OR expression. Escape
        // SQL LIKE wildcards; '*' (PostgREST alias) is rejected above, fail-closed.
        if (await inboxExists({ lead_id: 'is.null', from_address: `ilike.${email.replace(/[%_]/g, '\\$&')}` })) return true;
      }
      return false;
    },
    async getInbound(id, lead, org, actor) {
      const row = await one('commercial_mail_inbox', { select: 'id,organization_id,lead_id,contact_id,from_address,provider,provider_message_id,subject,summary,received_at,message_id:source_payload->>message_id,messageId:source_payload->>messageId,source:source_payload->>source,email_id:source_payload->>email_id', id: `eq.${id}`, organization_id: `eq.${org}`, lead_id: `eq.${lead}` }, actor);
      return row ? { ...row, source_payload: { message_id: row.message_id, messageId: row.messageId, source: row.source, email_id: row.email_id } } : null;
    },
    getInboundActivities(inbound, actor) {
      return rows('activities', { select: 'organization_id,lead_id,contact_id,type,subject,notes,occurred_at', organization_id: `eq.${inbound.organization_id}`, lead_id: `eq.${inbound.lead_id}`, contact_id: inbound.contact_id ? `eq.${inbound.contact_id}` : 'is.null', type: 'eq.EMAIL', subject: `eq.${inbound.subject}`, occurred_at: `eq.${inbound.received_at}`, limit: '2' }, actor);
    },
    async claim(record) {
      try {
        const result = await jsonRequest('/rest/v1/commercial_mail_outbox?select=id', { method: 'POST', headers: { ...serviceHeaders, Prefer: 'return=representation' }, body: record });
        if (!Array.isArray(result) || result.length !== 1 || !result[0].id) throw new MailError('outbox_reservation_failed', 503);
        return { claimed: true, row: result[0] };
      } catch (error) {
        if (error.dbCode !== '23505') throw error;
        return { claimed: false, existing: await repository.getAttempt(record.organization_id, record.idempotency_key) };
      }
    },
    async recordFailure(id, org, status, errorText, timestamp) {
      const result = await jsonRequest(tablePath('commercial_mail_outbox', { id: `eq.${id}`, organization_id: `eq.${org}`, status: 'eq.SENDING', select: 'id' }), { method: 'PATCH', headers: { ...serviceHeaders, Prefer: 'return=representation' }, body: { status, error_text: errorText, updated_at: timestamp } });
      if (!Array.isArray(result) || result.length !== 1) throw new MailError('outbox_update_unconfirmed', 503);
    },
    finalize(id, org, providerId, timestamp) {
      return jsonRequest('/rest/v1/rpc/crm_mail_finish_send_v3', { method: 'POST', body: { p_outbox_id: id, p_organization_id: org, p_provider_message_id: providerId, p_sent_at: timestamp } });
    },
  };
  return repository;
}
export function classifyProviderResponse(status, result) {
  const id = typeof result?.id === 'string' ? result.id.trim() : '';
  const hasError = Boolean(result?.error || result?.name || result?.message);
  if (status >= 200 && status < 300 && providerEvidenceId(id) && !hasError) return { accepted: true, id };
  // Ambiguous responses (including 5xx, timeout, conflict and a missing ID) are frozen for review.
  const definiteRejection = !id && ((status >= 400 && status < 500 && ![408,409,429].includes(status)) || (status >= 200 && status < 300 && Boolean(result?.error)));
  return { accepted: false, uncertain: !definiteRejection, ...(id ? { id } : {}), code: 'provider_error' };
}
export function createProvider({ apiKey, fetcher = fetch }) {
  if (!apiKey) throw new MailError('mail_backend_not_configured', 503);
  return {
    async send(payload, idempotencyKey) {
      const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
      let result;
      try { result = JSON.parse(new TextDecoder().decode(await readLimitedBytes(response, 16384))); } catch { return { accepted: false, uncertain: true, code: 'invalid_provider_response' }; }
      return classifyProviderResponse(response.status, result);
    },
  };
}
