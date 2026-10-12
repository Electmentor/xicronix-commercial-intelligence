// Pure presentation helpers. Customer requests and operational next steps stay separate.
const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
const time = value => Date.parse(value || '') || 0;
const activityAt = row => row.occurred_at || row.created_at || null;
const mailAt = row => row.received_at || row.created_at || null;
const sameOrganization = (lead, row) => !lead?.organization_id || !row.organization_id || lead.organization_id === row.organization_id;
const originalHeading = /^(?:requerimiento original|solicitud original|consulta original|mensaje original|mensaje recibido|mensaje del (?:cliente|visitante))(?:\s+del (?:cliente|visitante))?\s*:\s*(.*)$/i;
const metadataHeading = /^(?:contexto(?: adicional| de la solicitud| del chat| de conversaci[oó]n| comercial)?|metadatos|datos de contacto|datos del contacto|canal(?: de origen)?|origen|p[aá]gina(?: de origen)?|sourcePage|cta|referencia(?: p[uú]blica)?|instrucciones(?: internas)?|instrucci[oó]n interna|siguiente (?:paso|acci[oó]n)|pr[oó]xima acci[oó]n|acci[oó]n interna|resumen interno)\s*:/i;

function webRequest(notes) {
  const lines = clean(notes).split('\n');
  const start = lines.findIndex(line => originalHeading.test(line.trim()));
  const explicit = start >= 0;
  const requestLines = explicit ? [lines[start].trim().match(originalHeading)[1], ...lines.slice(start + 1)] : lines;
  const end = requestLines.findIndex(line => metadataHeading.test(line.trim()));
  return {text: (end < 0 ? requestLines : requestLines.slice(0, end)).join('\n').trim(), explicit};
}

// A lead link takes precedence over a shared contact; don't mix different cases.
export function caseInboundMail(lead, data = {}) {
  if (!lead?.id) return [];
  const contact = (data.contacts || []).find(row => row.id === lead.contact_id && sameOrganization(lead, row));
  const institution = (data.institutions || []).find(row => row.id === lead.institution_id && sameOrganization(lead, row));
  const email = clean(contact?.email || institution?.email).toLowerCase();
  return (data.mail || []).filter(row => {
    if (!sameOrganization(lead, row)) return false;
    if (['OUT', 'OUTBOUND', 'OUTGOING', 'SENT'].includes(String(row.direction || '').toUpperCase())) return false;
    if (row.lead_id) return row.lead_id === lead.id;
    return (lead.contact_id && row.contact_id === lead.contact_id) || (email && clean(row.from_address).toLowerCase() === email);
  }).sort((a, b) => time(mailAt(b)) - time(mailAt(a)));
}

function inboundBody(row) {
  const body = ['body_text', 'text_body', 'body_plain', 'content_text', 'body'].map(key => clean(row[key])).find(Boolean) || '';
  if (!body || body === clean(row.subject) || /^(?:contenido (?:del correo |completo )?no disponible|contenido (?:completo )?pendiente|sin contenido)(?:\b|[.:])/i.test(body)) return '';
  // summary is intentionally not a body: it may contain generated/internal context.
  return body;
}

/** Returns the full evidenced customer request, never lead.next_action or activity.notes from staff. */
export function caseRequestContext(lead, data = {}) {
  if (!lead?.id) return {text: '', source: '', at: null};
  const activities = (data.activities || []).filter(row => row.lead_id === lead.id && sameOrganization(lead, row))
    .sort((a, b) => time(activityAt(b)) - time(activityAt(a)));
  const web = activities.filter(row => row.type === 'WEB_FORM').map(row => ({row, ...webRequest(row.notes)}));
  const original = web.find(item => item.explicit && item.text);
  if (original) return {text: original.text, source: 'Solicitud web', at: activityAt(original.row)};
  const inbound = caseInboundMail(lead, data)[0];
  if (inbound && inboundBody(inbound)) return {text: inboundBody(inbound), source: 'Correo recibido', at: mailAt(inbound)};
  const submission = web.find(item => item.text);
  if (submission) return {text: submission.text, source: 'Solicitud web', at: activityAt(submission.row)};
  const need = activities.find(row => clean(row.need_summary));
  if (need) return {text: clean(need.need_summary), source: 'Necesidad registrada', at: activityAt(need)};
  return {text: '', source: '', at: null};
}

// Use the provider's token format, excluding legacy placeholders that aren't evidence.
function providerEvidenceId(value) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return '';
  const token = id.toLowerCase().replace(/[-_]/g, '');
  return /^(?:no|nodisponible|sinid|none|null|undefined|false|true|na|unknown|pending|unavailable|notavailable|notprovided|missing|0)$/.test(token) ? '' : id;
}

/** Provider acceptance evidence is required even for historical rows marked SENT. */
export function caseOutboundStatus(row) {
  if (!row) return null;
  const status = clean(row.status).toUpperCase();
  const at = row.sent_at || row.updated_at || row.created_at || null;
  if (status === 'SENT' && providerEvidenceId(row.provider_message_id)) return {kind:'sent', label:'Correo enviado', at};
  if (status === 'FAILED') return {kind:'failed', label:'Envío fallido', at};
  if (['SENT', 'SENDING', 'UNKNOWN'].includes(status)) return {kind:'uncertain', label:'Envío sin confirmación', at};
  return null;
}

// v2 could create this success-looking activity even when the provider returned no ID.
export function caseUnconfirmedMailActivity(row) {
  return row?.type === 'EMAIL' && /env[ií]o confirmado por Resend\.\s*ID:\s*no disponible\b/i.test(clean(row.evidence_note));
}

function acceptedActivityId(row) {
  if (row.type !== 'EMAIL' || caseUnconfirmedMailActivity(row)) return '';
  const evidence = clean(row.evidence_note);
  if (!/^(?:Aceptado por Resend\.|Env[ií]o confirmado por Resend\.)/i.test(evidence)) return '';
  return providerEvidenceId(evidence.match(/\bID:\s*([^.\n]+)(?:\.|$)/i)?.[1]);
}

function sourceDate(value) {
  const raw = clean(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2})))?$/.exec(raw);
  if (!match) return null;
  const day = Date.parse(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return null;
  if (match[2] && (+match[2] > 23 || +match[3] > 59 || +match[4] > 59 || +match[6] > 14 || (+match[6] === 14 && +match[7] !== 0) || +match[7] > 59)) return null;
  const start = Date.parse(raw);
  if (!Number.isFinite(start)) return null;
  // A date-only value is an interval, not proof of midnight or order within that day.
  return {start, end: match[2] ? start : start + 86400000 - 1};
}

// Display-only progress: an unread flag does not mean the case still needs a reply.
// Acceptance is not delivery, and neither this helper nor its callers close/read a case.
export function caseResponseProgress(lead, data = {}, {now = Date.now()} = {}) {
  const stamp = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : sourceDate(now)?.start;
  const mail = caseInboundMail(lead, data);
  const isCaseRow = row => lead?.id && row.lead_id === lead.id && sameOrganization(lead, row);
  const activities = (data.activities || []).filter(isCaseRow);
  const accepted = [
    ...(data.commercial_mail_outbox || []).filter(row => isCaseRow(row) && caseOutboundStatus(row)?.kind === 'sent')
      .map(row => ({at: row.sent_at, subject: row.subject || '', source: 'outbox'})),
    ...activities.filter(row => acceptedActivityId(row))
      .map(row => ({at: row.occurred_at, subject: row.subject || '', source: 'activity'}))
  ].filter(row => {const date = sourceDate(row.at); return date && date.end <= stamp;})
    .sort((a, b) => sourceDate(b.at).start - sourceDate(a.at).start)[0] || null;
  const acceptedAt = accepted ? sourceDate(accepted.at).start : null;
  // Receipt/submission dates must come from their source fields, never import created_at.
  const requests = [...mail.map(row => sourceDate(row.received_at)), ...activities.filter(row => row.type === 'WEB_FORM').map(row => sourceDate(row.occurred_at))];
  const chronologyKnown = requests.every(date => date && date.end <= stamp);
  const responseAccepted = !!accepted && chronologyKnown && requests.every(date => acceptedAt > date.end);
  const pendingMail = mail.find(row => {
    const received = sourceDate(row.received_at);
    return row.status === 'NEW' && (!accepted || !received || received.end > stamp || received.end >= acceptedAt);
  }) || null;
  if (!responseAccepted) return {accepted, responseAccepted: false, pendingMail, nextAction: '', nextDate: null};

  // Keep future human plans; automatic first-response work remains recorded but isn't repeated.
  const plans = [
    ...(data.tasks || []).filter(row => isCaseRow(row) && !['COMPLETED','CANCELLED'].includes(row.status) && !row.automation_key && clean(row.title))
      .map(row => ({text: row.title, at: row.due_at})),
    ...(data.meetings || []).filter(row => isCaseRow(row) && !['COMPLETED','CANCELLED'].includes(row.status) && clean(row.title))
      .map(row => ({text: 'Preparar y realizar: ' + row.title, at: row.start_at}))
  ];
  const initialResponse = /^(?:Revisar la solicitud y realizar la primera respuesta humana\.?|Definir (?:la )?siguiente acci[oó]n(?: comercial)?\.?)$/i;
  if (clean(lead?.next_action) && !initialResponse.test(clean(lead.next_action))) plans.push({text: lead.next_action, at: lead.next_action_date});
  const plan = plans.filter(row => sourceDate(row.at)?.start > stamp).sort((a, b) => sourceDate(a.at).start - sourceDate(b.at).start)[0];
  return {accepted, responseAccepted: true, pendingMail, nextAction: plan?.text || 'Esperar respuesta o programar seguimiento.', nextDate: plan?.at || null};
}
