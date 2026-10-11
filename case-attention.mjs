// Pure presentation helpers. Customer requests and operational next steps stay separate.
const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
const time = value => Date.parse(value || '') || 0;
const activityAt = row => row.occurred_at || row.created_at || null;
const mailAt = row => row.received_at || row.created_at || null;
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
  const contact = (data.contacts || []).find(row => row.id === lead.contact_id);
  const institution = (data.institutions || []).find(row => row.id === lead.institution_id);
  const email = clean(contact?.email || institution?.email).toLowerCase();
  return (data.mail || []).filter(row => {
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
  const activities = (data.activities || []).filter(row => row.lead_id === lead.id)
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

/** Provider acceptance evidence is required even for historical rows marked SENT. */
export function caseOutboundStatus(row) {
  if (!row) return null;
  const status = clean(row.status).toUpperCase();
  const at = row.sent_at || row.updated_at || row.created_at || null;
  if (status === 'SENT' && clean(row.provider_message_id)) return {kind:'sent', label:'Correo enviado', at};
  if (status === 'FAILED') return {kind:'failed', label:'Envío fallido', at};
  if (['SENT', 'SENDING', 'UNKNOWN'].includes(status)) return {kind:'uncertain', label:'Envío sin confirmación', at};
  return null;
}

// v2 could create this success-looking activity even when the provider returned no ID.
export function caseUnconfirmedMailActivity(row) {
  return row?.type === 'EMAIL' && /env[ií]o confirmado por Resend\.\s*ID:\s*no disponible\b/i.test(clean(row.evidence_note));
}
