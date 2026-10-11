import {caseInboundMail, caseRequestContext} from './case-attention.mjs';

// Local, deterministic drafting aid. Unknown content and dates remain human work.
const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
const plain = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const PLACEHOLDER = '[Escribe aquí tu respuesta y el siguiente paso acordado.]';
const DAY = 86400000;
const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const limaDate = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'});

function dateEvidence(value) {
  const text = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : '') : clean(value);
  // Do not let Date.parse guess locale, timezone or roll invalid calendar days over.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)) return null;
  const rawDay = text.slice(0, 10), rawDayMs = Date.parse(rawDay+'T00:00:00Z'), ms = Date.parse(text);
  if (!Number.isFinite(rawDayMs) || !Number.isFinite(ms) || new Date(rawDayMs).toISOString().slice(0, 10) !== rawDay) return null;
  const parts = Object.fromEntries(limaDate.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));
  // CRM commercial dates are in Peru. A UTC timestamp after midnight may still
  // be the previous local day; a date-only value already denotes a calendar day.
  const day = text.includes('T') ? `${parts.year}-${parts.month}-${parts.day}` : rawDay;
  const dayMs = Date.parse(day+'T00:00:00Z');
  return {text, day, dayMs, ms};
}

function validBody(value, subject) {
  const text = clean(value);
  return text && text !== clean(subject) && !/^(?:contenido (?:del correo |completo )?no disponible|contenido (?:completo )?pendiente|sin contenido)(?:\b|[.:])/i.test(text) ? text : '';
}

function mailContent(mail, data) {
  for (const field of ['body_text', 'text_body', 'body_plain', 'content_text', 'body']) {
    const text = validBody(mail[field], mail.subject);
    if (text) return {text, bodySource:field, complete:mail.body_truncated !== true};
  }
  // Primary source verified 2026-10-11: PROD xicronix-email-inbound v14,
  // sha256 b078900d6dff9d5e4d8e817a4b5662dfe405388d4300c0b6e00d47bc24f21e31.
  // It writes bodyText (max 4000 chars) to EMAIL.notes and its first 1200 to
  // inbox.summary. Zoho webhook v1 has no equivalent full-body contract.
  const payload = mail.source_payload;
  const verifiedResend = mail.provider === 'RESEND_FORWARD' && payload?.source === 'resend-forward' &&
    clean(mail.provider_message_id) && mail.provider_message_id === payload.email_id;
  if (!verifiedResend) return {text:'', bodySource:'', complete:false};
  const summary = validBody(mail.summary, mail.subject);
  const received = dateEvidence(mail.received_at);
  const candidates = (data.activities || []).filter(row => row.type === 'EMAIL' && mail.lead_id &&
    row.lead_id === mail.lead_id && clean(row.subject) === clean(mail.subject) && received &&
    dateEvidence(row.occurred_at)?.ms === received.ms &&
    (!mail.contact_id || row.contact_id === mail.contact_id) &&
    (!mail.organization_id || row.organization_id === mail.organization_id))
    .map(row => ({text:validBody(row.notes, mail.subject), capturedLength:typeof row.notes === 'string' ? row.notes.length : 0}))
    .filter(item => item.text && summary && clean(item.text.slice(0,1200)) === summary);
  const bodies = [...new Set(candidates.map(item=>item.text))];
  if (bodies.length === 1) return {text:bodies[0], bodySource:'resend_activity', complete:candidates.every(item=>item.capturedLength < 4000)};
  if (bodies.length > 1) return {text:summary, bodySource:'resend_excerpt', complete:false};
  return {text:summary, bodySource:summary ? 'resend_excerpt' : '', complete:!!summary && mail.summary.length < 1200};
}

/** Latest inbound is always the reply context, even when the original web request remains on the case. */
export function caseReplyContext(lead, data = {}) {
  const mails = caseInboundMail(lead, data);
  if (!mails.length) {
    const request = caseRequestContext(lead, data);
    return {...request, contextText:request.text, mailId:null, bodySource:request.source ? 'case_request' : '', complete:false, dateReliable:false, chronologyReliable:true};
  }
  // A row without an actual receipt date cannot safely be ranked below dated mail.
  const undated = mails.find(row => !dateEvidence(row.received_at));
  const mail = undated || [...mails].sort((a,b)=>dateEvidence(b.received_at).ms-dateEvidence(a.received_at).ms)[0];
  const content = mailContent(mail, data);
  const forwarded = mail.provider === 'RESEND_FORWARD' || /^(?:fwd?|rv|reenv):/i.test(clean(mail.subject)) ||
    /(?:^|\n)(?:From|De|Date|Fecha):\s*\S/i.test(content.text) || /mensaje (?:original|reenviado)|forwarded message/i.test(content.text);
  return {...content, contextText:content.text, source:'Correo recibido', at:mail.received_at || null,
    mailId:mail.id || null, dateReliable:!undated && !forwarded, chronologyReliable:!undated,
    forwarded, subject:clean(mail.subject)};
}

function internalCoordination(text) {
  const normalized = plain(text);
  // Deliberately narrow rule: never classify a topic from maturity, next_action,
  // staff notes, a quoted older message or a free-form instruction to the CRM.
  const head = normalized.split(/\n\s*>|\n\s*el .{0,120} escribio:|\n\s*on .{0,120} wrote:/)[0];
  const internal = /\bcoordinacion(?:es)? interna(?:s)?\b/.test(head);
  const presentation = /\b(?:presentar|exponer|plantear)\b[^.!?\n]{0,120}\b(?:necesidad|propuesta)\b/.test(head);
  const scheduledSpace = /\b(?:espacio|reunion)\b/.test(head);
  const changed = /\b(?:cancelad\w*|postergad\w*|suspendid\w*|reprogram\w*|anulad\w*)\b/.test(head) ||
    /\bno\b[^.!?\n]{0,60}\b(?:coordinacion|reunion|espacio|presentar|podemos|tendremos)\b/.test(head);
  return {recognized:internal && presentation && scheduledSpace && !changed, text:head};
}

function relativeEvent(text, received) {
  const mentions = [...text.matchAll(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/g)];
  // Explicit/competing dates and relative modifiers need a person. No locale
  // guessing, week rollover guess, or stale weekday inferred from quoted mail.
  if (mentions.length !== 1 || /\b\d{1,4}[\/.\-]\d{1,2}(?:[\/.\-]\d{1,4})?\b|\b\d{1,2}\s+de\s+[a-z]+|\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(text)) return null;
  const word = mentions[0][0], index = mentions[0].index;
  const adjacent = text.slice(Math.max(0,index-24),index+word.length+24);
  if (/\b(?:proxim[oa]|pasad[oa]|anterior|siguiente|cada|otro|otra)\b|\b(?:\d{1,2})\b/.test(adjacent.replace(/\b15\s*minutos?\b/g,''))) return null;
  const weekday = weekdays.indexOf(word), delta = (weekday-new Date(received.dayMs).getUTCDay()+7)%7;
  if (!delta) return null;
  return new Date(received.dayMs+delta*DAY).toISOString().slice(0,10);
}

/** All bodies require review; needsHumanAnswer identifies incomplete manual drafts. */
export function buildCaseReply(lead, data = {}, {now = new Date()} = {}) {
  const context = caseReplyContext(lead, data);
  const contact = (data.contacts || []).find(row => row.id === lead?.contact_id);
  const name = clean(contact?.first_name).replace(/[\r\n<>]/g,' ').slice(0,80).trim();
  const greeting = name ? `Hola ${name},` : 'Hola,';
  const compose = paragraphs => [greeting, ...paragraphs, 'Saludos,\nEquipo Xicronix'].join('\n\n');
  const result = {...context, body:'', reason:'', reasonCode:'', needsHumanAnswer:true, reviewRequired:true, eventDate:null, eventState:'unknown'};
  const manual = (reasonCode, reason, opening = 'Gracias por escribirnos a Xicronix.') =>
    ({...result, body:compose([opening,PLACEHOLDER]),reasonCode,reason:'Borrador incompleto: '+reason});
  if (!context.text) return manual('CONTENT_UNAVAILABLE', 'falta el contenido acreditado del último mensaje. Recupera y revisa el correo antes de responder.');
  if (!context.mailId && context.source !== 'Correo recibido') return manual('MANUAL_REQUEST', 'revisa la solicitud y completa una respuesta concreta.');
  if (!context.complete) return manual('CONTENT_INCOMPLETE', 'el correo disponible es un extracto o puede estar cortado. Revisa el original antes de responder.');
  const intent = internalCoordination(context.text);
  const current = dateEvidence(now), received = dateEvidence(context.at);
  if (!context.dateReliable || !current || !received || received.ms > current.ms) {
    return manual('DATE_UNRELIABLE', 'la fecha original del correo no está acreditada. No se ha calculado la fecha de la coordinación.',
      intent.recognized ? 'Gracias por mantenernos al tanto. ¿Hubo alguna novedad en las coordinaciones internas?' : 'Gracias por escribirnos a Xicronix.');
  }
  if (!intent.recognized) return manual('MANUAL_REPLY', 'revisa el último correo y completa la respuesta sin suponer acuerdos ni resultados.');
  const eventDate = relativeEvent(intent.text, received);
  if (!eventDate) return manual('EVENT_DATE_UNCLEAR', 'la fecha de la coordinación es ambigua. Revisa el correo antes de completar la respuesta.',
    'Gracias por mantenernos al tanto de las coordinaciones internas.');
  const eventState = eventDate < current.day ? 'past' : eventDate > current.day ? 'future' : 'today';
  const paragraphs = eventState === 'past' ? [
    'Gracias por contarnos sobre las coordinaciones internas. ¿Cómo les fue con la coordinación que tenían prevista? ¿Surgió alguna consulta sobre la necesidad o la propuesta en la que podamos ayudarles?',
    'Quedamos atentos a lo que decidan para continuar.'
  ] : [
    'Gracias por contarnos sobre las coordinaciones internas. Si necesitan aclarar alguna consulta para ese espacio, con gusto podemos ayudarles.',
    'Quedamos atentos a lo que decidan.'
  ];
  return {...result,body:compose(paragraphs),needsHumanAnswer:false,eventDate,eventState,
    reasonCode:eventState === 'past' ? 'INTERNAL_COORDINATION_PAST' : 'INTERNAL_COORDINATION_PENDING',
    reason:`La referencia al día de la semana se interpreta desde la fecha del correo (${received.day}): ${eventDate}. `+
      (eventState === 'past' ? 'La fecha ya pasó; el borrador pregunta por novedades sin afirmar que la reunión ocurrió.' : 'La coordinación está prevista para hoy o después; el borrador ofrece ayuda y espera su decisión.')};
}
