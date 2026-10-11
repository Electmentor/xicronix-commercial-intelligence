import {caseInboundMail, caseRequestContext} from './case-attention.mjs';
import {buildCaseReply, caseReplyContext} from './case-reply.mjs';

const clean = value => typeof value === 'string' ? value.trim() : '';
const sameOrg = (lead, row) => !lead?.organization_id || !row.organization_id || lead.organization_id === row.organization_id;
function timestamp(value, now) {
  const raw = clean(value);
  // Require a source timestamp including timezone, never created_at/import time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const parts=raw.match(/T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
  if(+parts[1]>23||+parts[2]>59||+parts[3]>59||+parts[4]>14||+parts[5]>59||(+parts[4]===14&&+parts[5]!==0))return null;
  const ms = Date.parse(raw), day = Date.parse(raw.slice(0,10)+'T00:00:00Z');
  if (!Number.isFinite(ms) || !Number.isFinite(day) || new Date(day).toISOString().slice(0,10)!==raw.slice(0,10) || ms > now) return null;
  return ms;
}
const outgoing = row => ['OUT','OUTBOUND','OUTGOING','SENT'].includes(String(row.direction||'').toUpperCase());

/** Only recorded evidence. A social channel label is not a social integration. */
export function latestWhatsappContext(lead, data = {}, {now = Date.now()} = {}) {
  if (!lead?.id) return {kind:'missing', text:'', reason:'No hay una interacción vinculada a este expediente.'};
  const clock = now instanceof Date ? now.getTime() : now;
  const mail = caseInboundMail(lead,data);
  const candidates = mail.map(row => {
    const evidence = caseReplyContext(lead,{...data,mail:[row]});
    return {kind:'mail', id:row.id, at:row.received_at, time:evidence.forwarded?null:timestamp(row.received_at,clock), source:'Correo recibido', text:evidence.contextText||'', complete:evidence.complete, dateReliable:evidence.dateReliable, row};
  });
  for (const row of data.activities || []) {
    if (row.lead_id!==lead.id || !sameOrg(lead,row)) continue;
    // The inbound adapter also writes an EMAIL activity. Do not count it twice.
    if (row.type==='EMAIL' && mail.some(m=>m.subject===row.subject && m.received_at===row.occurred_at)) continue;
    if (!['WEB_FORM','EMAIL','WHATSAPP','CALL','MEETING','VISIT','DEMO','PROPOSAL_SENT','FOLLOW_UP'].includes(row.type) && !row.channel && !row.customer_message) continue;
    let text='', source=clean(row.channel)||clean(row.type)||'Interacción registrada';
    if (row.type==='WEB_FORM') {
      text=caseRequestContext(lead,{...data,mail:[],activities:[row]}).text;
      source=/chat/i.test(row.subject||'')?'Nexa / solicitud registrada':'Formulario web';
    } else if (!outgoing(row)) {
      // Staff notes, summaries and next_action are never customer quotations.
      text=clean(row.customer_message);
    }
    candidates.push({kind:'activity', id:row.id, at:row.occurred_at, time:timestamp(row.occurred_at,clock), source, text, complete:!!text && row.body_truncated!==true, dateReliable:false, outgoing:outgoing(row)||row.type==='PROPOSAL_SENT', row});
  }
  for (const row of data.commercial_mail_outbox || []) {
    if (row.lead_id===lead.id && sameOrg(lead,row) && ['SENT','SENDING','UNKNOWN'].includes(row.status))
      candidates.push({kind:'outbound',id:row.id,at:row.sent_at,time:timestamp(row.sent_at,clock),source:'Respuesta por correo registrada',text:'',complete:false,outgoing:true,row});
  }
  if (!candidates.length) return {kind:'missing',text:'',reason:'No hay contenido de una interacción registrada. Escribe el mensaje manualmente.'};
  if (candidates.some(c=>c.time===null)) return {kind:'uncertain',text:'',reason:'Hay interacciones sin fecha de origen acreditada. Revisa el historial para identificar la última; no usamos una anterior por defecto.'};
  candidates.sort((a,b)=>b.time-a.time);
  const latest=candidates[0];
  if (candidates[1]?.time===latest.time) return {kind:'uncertain',text:'',reason:'Varias interacciones tienen la misma fecha. Revisa cuál corresponde antes de responder.'};
  return {...latest,reason:latest.outgoing?'La última interacción registrada es saliente. Prepara un seguimiento; no reinicies la solicitud.':!latest.text?'Falta el cuerpo acreditado de la última interacción. Revisa el original o escribe la respuesta manualmente.':!latest.complete?'El contenido puede estar incompleto. Revisa el original.':'Revisa el contexto y adapta el mensaje antes de abrir WhatsApp.'};
}

export function whatsappDraft(lead, data = {}, options = {}) {
  const context=latestWhatsappContext(lead,data,options);
  let text='';
  if (context.kind==='mail' && context.complete && context.dateReliable) {
    const reply=buildCaseReply(lead,{...data,mail:[context.row]}, {now:new Date(options.now ?? Date.now())});
    // Only the narrow, evidenced follow-up rule is auto-drafted. No raw copying.
    if (!reply.needsHumanAnswer) text=reply.body.replace(/\n\nSaludos,\nEquipo Xicronix$/,'');
  }
  return {context,text,manual:!text};
}

export function whatsappPhone(value) {
  const raw=clean(value);
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';
  let digits=raw.replace(/\D/g,'');
  if (/^9\d{8}$/.test(digits)) digits='51'+digits;
  else if (!raw.startsWith('+') && !/^519\d{8}$/.test(digits)) return '';
  return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}
export function whatsappUrl(phone, text) {
  const number=whatsappPhone(phone), message=clean(text);
  if (/Visitante:[\s\S]*Nexa:|Nexa:[\s\S]*Visitante:/i.test(message)) return '';
  if (!number || !message || message.length>1200 || /\[(?:Escribe|Completa|Respuesta)/i.test(message)) return '';
  // A guardrail, not a guarantee: the user also reviews sensitive information.
  if (/-----BEGIN .*PRIVATE KEY|\b(?:sk-proj-|sk_live_|ghp_|gho_|xoxb-)|\b(?:password|contrase[nñ]a|api[_ -]?key|access[_ -]?token)\s*[:=]/i.test(message)) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

const dismissComposer = new WeakMap();

/** Discard the composer and its data on session, workspace or source changes. */
export function closeCaseWhatsapp(doc = globalThis.document) {
  const dialog = doc?.getElementById('caseWhatsappDialog');
  if (!dialog) return false;
  const dismiss = dismissComposer.get(dialog);
  if (dismiss) dismiss(false);
  else { if (dialog.open) dialog.close(); dialog.replaceChildren(); dialog.remove(); }
  return true;
}

/** In-memory composer. Opening is a handoff, never evidence of sending/delivery. */
export function openCaseWhatsapp({lead=null,contact=null,institution=null,data={},radar=null,document:doc=globalThis.document,open=globalThis.open?.bind(globalThis),now=Date.now(),dataSource='demo',isCurrent=()=>false,isReady=()=>true}={}) {
  closeCaseWhatsapp(doc);
  const draft=whatsappDraft(lead,data,{now});
  const dialog=doc.createElement('dialog');dialog.id='caseWhatsappDialog';dialog.setAttribute('aria-labelledby','caseWhatsappTitle');
  dialog.style.cssText='width:min(620px,calc(100vw - 24px));max-height:90vh;overflow:auto;padding:24px;box-sizing:border-box';
  const node=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
  const title=node('h2',dataSource==='live'?'Preparar WhatsApp':'Preparar WhatsApp · simulación');title.id='caseWhatsappTitle';dialog.append(title);
  const name=[contact?.first_name,contact?.last_name].filter(Boolean).join(' ')||radar?.decision_maker_name||'Contacto por confirmar';
  dialog.append(node('p',name));
  const warning=node('p',draft.context.reason);warning.setAttribute('role','status');dialog.append(warning);
  if(draft.context.source)dialog.append(node('p',`${draft.context.source} · ${draft.context.at||'Fecha no acreditada'}`));
  if(draft.context.text){const details=node('details');details.append(node('summary','Ver contexto registrado (no se copiará al mensaje)'));const body=node('p',draft.context.text);body.style.whiteSpace='pre-wrap';details.append(body);dialog.append(details);}
  const phoneLabel=node('label','Número de WhatsApp del destinatario (con código de país)');
  const phone=node('input');phone.type='tel';phone.autocomplete='off';phone.value=contact?.phone||(!lead?radar?.contact_whatsapp:'')||'';phone.style.width='100%';phoneLabel.append(phone);dialog.append(phoneLabel);
  if(!phone.value && institution?.phone)dialog.append(node('p','Sólo hay teléfono institucional. Confirma quién recibirá el mensaje y escribe el número; no lo seleccionamos automáticamente.'));
  const label=node('label','Mensaje breve para revisar y editar');const input=node('textarea');input.rows=7;input.maxLength=1200;input.value=draft.text;input.placeholder='Escribe una respuesta al último mensaje o un seguimiento concreto.';input.style.cssText='width:100%;box-sizing:border-box';label.append(input);dialog.append(label);
  const confirmLabel=node('label');const reviewed=node('input');reviewed.type='checkbox';reviewed.style.width='auto';confirmLabel.append(reviewed,doc.createTextNode(' Revisé el destinatario y el texto. No contiene información sensible ni conversaciones completas.'));dialog.append(confirmLabel);
  dialog.append(node('p',dataSource==='live'?'WhatsApp se abrirá con este borrador. Tú decides si lo envías. Abrirlo no cambia el estado del expediente.':'Esta demostración permite revisar el borrador. No abrirá WhatsApp ni enviará mensajes.'));
  const feedback=node('p');feedback.setAttribute('role','status');dialog.append(feedback);
  const cancel=node('button','Cancelar');cancel.type='button';const proceed=node('button',dataSource==='live'?'Abrir WhatsApp':'Simular apertura');proceed.type='button';proceed.disabled=true;dialog.append(cancel,proceed);
  const reset=()=>{reviewed.checked=false;proceed.disabled=true;feedback.textContent='';};phone.addEventListener('input',reset);input.addEventListener('input',reset);
  reviewed.addEventListener('change',()=>{proceed.disabled=!reviewed.checked;});
  let active=true;
  proceed.addEventListener('click',()=>{
    if(!active||!dialog.open||!reviewed.checked)return;
    let current=false;try{current=isCurrent()===true;}catch(_error){}
    if(!current){dismiss(false);return;}
    let ready=false;try{ready=isReady()===true;}catch(_error){}
    if(!ready){feedback.textContent='Espera a que termine la actualización. Tu borrador se conserva.';return;}
    const url=whatsappUrl(phone.value,input.value);
    if(!url){feedback.textContent='Revisa el número, escribe un mensaje de hasta 1200 caracteres y elimina marcadores o credenciales.';return;}
    if(dataSource!=='live'){reviewed.checked=false;proceed.disabled=true;feedback.textContent='Simulación completada. No se abrió WhatsApp ni se envió ningún mensaje.';return;}
    open?.(url,'_blank','noopener,noreferrer');
    reviewed.checked=false;proceed.disabled=true;feedback.textContent='Se solicitó abrir WhatsApp. El envío no se verifica ni se registra como realizado.';
  });
  const previous=doc.activeElement;
  const dismiss=(restoreFocus=true)=>{
    if(!active)return;active=false;
    phone.value='';input.value='';reviewed.checked=false;proceed.disabled=true;feedback.textContent='';
    if(dialog.open)dialog.close();dialog.replaceChildren();dialog.remove();dismissComposer.delete(dialog);
    if(restoreFocus)previous?.focus?.();
  };
  dismissComposer.set(dialog,dismiss);
  cancel.addEventListener('click',()=>dismiss());
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('close',()=>dismiss(),{once:true});
  doc.body.append(dialog);dialog.showModal();input.focus();
  return dialog;
}
