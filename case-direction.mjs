import {escapeHTML as esc,normalize} from './domain.mjs';
import {caseRequestContext} from './case-attention.mjs';

export const DIRECTION_ACTIONS={PRIORITIZE:'Priorizar',ASSIGN:'Asignar o reasignar',PROPOSAL:'Decidir propuesta',EXCEPTION:'Autorizar excepción',RESOURCE:'Autorizar recursos',COMMITMENT:'Confirmar compromiso',BLOCKER:'Decidir cómo resolver bloqueo',VERIFY_BLOCKER:'Comprobar resolución del bloqueo',ESCALATION:'Atender escalación',CONTINUE:'Continuar',PAUSE:'Pausar',DISCARD:'Descartar',ATTEND:'Registrar atención útil',WAIT:'Esperar al cliente',RESOLVE:'Registrar resolución',CLOSE:'Cerrar solicitud',REOPEN:'Reabrir',REQUEST:'Registrar solicitud de decisión'};
export const REQUEST_LABELS={PROPOSAL:'Propuesta',EXCEPTION:'Excepción',RESOURCE:'Recursos o gasto',COMMITMENT:'Compromiso',BLOCKER:'Bloqueo',ESCALATION:'Escalación'};
export const CASE_STATES={PENDING:'Pendiente',ATTENDED:'Atendido · seguimiento pendiente',WAITING_CUSTOMER:'Esperando al cliente · pendiente',RESOLVED:'Resuelto · cierre pendiente',PAUSED:'Pausado',DISCARDED:'Descartado · no resuelto',CLOSED:'Cerrado'};
const priorityLabels={LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica'};
const requestStates={PENDING:'Pendiente de decisión',APPROVED:'Aprobada · ejecución asignada',REJECTED:'Rechazada',RESOLVED:'Resolución comprobada',SUPERSEDED:'Sustituida'};
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha · definir seguimiento';
const activeTask=r=>!['COMPLETED','CANCELLED'].includes(r.status);
const stateFor=(lead,data)=>(data.crm_case_direction||[]).find(s=>s.lead_id===lead.id)||{revision:0,lifecycle:'PENDING',priority:'MEDIUM'};
export function linkedRequests(lead,data){return (data.crm_case_requests||[]).filter(r=>r.lead_id===lead.id&&r.organization_id===lead.organization_id);}
export function proposalIsCurrent(request,data){
 if(request.category!=='PROPOSAL')return true;
 const quote=(data.quotes||[]).find(q=>q.id===request.payload.quote_id);
 return !!quote&&Number(quote.revision)===Number(request.payload.quote_revision);
}
export function directionCase(lead,data,{now=Date.now()}={}){
 const state=stateFor(lead,data),requests=linkedRequests(lead,data);
 const tasks=(data.tasks||[]).filter(t=>t.lead_id===lead.id&&t.organization_id===lead.organization_id&&activeTask(t));
 const reasons=[];
 const pending=requests.filter(r=>r.status==='PENDING');
 const blockers=requests.filter(r=>r.category==='BLOCKER'&&r.status!=='RESOLVED');
 const escalations=pending.filter(r=>r.category==='ESCALATION');
 if(escalations.length)reasons.push('Escalación: '+escalations[0].payload.scope);
 if(blockers.length)reasons.push('Bloqueo pendiente de comprobar: '+blockers[0].payload.scope);
 if(pending.some(r=>r.category!=='ESCALATION'&&r.category!=='BLOCKER'))reasons.push('Decisión pendiente: '+REQUEST_LABELS[pending.find(r=>!['ESCALATION','BLOCKER'].includes(r.category)).category]);
 if(!lead.owner_user_id)reasons.push('Sin responsable asignado');
 const overdue=tasks.filter(t=>t.due_at&&Date.parse(t.due_at)<now);
 if(overdue.length||lead.next_action_date&&Date.parse(lead.next_action_date)<now)reasons.push('Próximo paso vencido');
 if(state.lifecycle==='PAUSED'&&state.review_at&&Date.parse(state.review_at)<=now)reasons.push('Revisión de pausa vencida');
 if(!lead.next_action||!lead.next_action_date)reasons.push('Falta definir próximo paso y fecha');
 if(state.lifecycle==='RESOLVED')reasons.push('Resultado registrado: comprobar cierre');
 const institution=(data.institutions||[]).find(r=>r.id===lead.institution_id);
 const contact=(data.contacts||[]).find(r=>r.id===lead.contact_id);
 const owner=(data.users||data.profiles||[]).find(r=>r.id===lead.owner_user_id);
 const next=tasks.slice().sort((a,b)=>(Date.parse(a.due_at)||Infinity)-(Date.parse(b.due_at)||Infinity))[0];
 let action=escalations.length?'ESCALATION':blockers.length?(blockers[0].status==='APPROVED'?'VERIFY_BLOCKER':'BLOCKER'):pending[0]?.category||(!lead.owner_user_id?'ASSIGN':state.lifecycle==='RESOLVED'?'CLOSE':'CONTINUE');
 if(['CLOSED','DISCARDED'].includes(state.lifecycle))action='REOPEN';
 const selected=requests.find(r=>r.category===action&&r.status==='PENDING')||(action==='VERIFY_BLOCKER'?blockers.find(r=>r.status==='APPROVED'):action==='BLOCKER'?blockers[0]:null);
 return {lead,state,requests,tasks,reasons,action,requestId:selected?.id||'',title:institution?.name||lead.title||'Entidad pendiente de identificar',request:caseRequestContext(lead,data).text||'Falta recuperar la solicitud original. Asigna su recuperación y fija una fecha.',owner:owner?.full_name||(lead.owner_user_id?'Responsable asignado · nombre no disponible':'Sin responsable'),contact:contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):'',next:next?.title||lead.next_action||'Definir próximo paso',due:next?.due_at||lead.next_action_date,rank:escalations.length*100+blockers.length*80+pending.length*60+(!lead.owner_user_id?50:0)+(overdue.length?40:0)+({CRITICAL:30,HIGH:20,MEDIUM:10,LOW:0}[state.priority]||0)};
}
export function directionCases(data,{filter='intervention',search='',now=Date.now()}={}){
 return (data.leads||[]).map(l=>directionCase(l,data,{now})).filter(c=>filter==='closed'?c.state.lifecycle==='CLOSED':filter==='all'?true:!['CLOSED','DISCARDED'].includes(c.state.lifecycle)&&c.reasons.length>0)
 .filter(c=>!search||normalize([c.title,c.lead.title,c.request,c.owner,c.next,...c.reasons].join(' ')).includes(normalize(search)))
 .sort((a,b)=>b.rank-a.rank||(Date.parse(a.due)||Infinity)-(Date.parse(b.due)||Infinity));
}
export function renderDirectionCases(data,{filter='intervention',search='',user,unavailable=false,demo=false}={}){
 const rows=directionCases(data,{filter,search});
 const own=(data.tasks||[]).filter(t=>activeTask(t)&&t.assigned_to===user?.id);
 return `<section class="case-direction" aria-label="Mis casos · Dirección"><header class="cd-header"><div><small>MIS CASOS · DIRECCIÓN${demo?' · DEMOSTRACIÓN':''}</small><h2>Mi intervención</h2><p>Decide, asigna y comprueba el resultado.</p></div><details class="cd-personal"><summary>Mi ejecución personal · ${own.length}</summary><p>Estas tareas están a tu cargo. Las decisiones de supervisión aparecen abajo.</p>${own.length?own.map(t=>`<p>${esc(t.title)} · ${esc(date(t.due_at))} <button type="button" data-edit="${esc(t.id)}" data-table="tasks">Abrir tarea</button></p>`).join(''):'<p>Sin tareas personales pendientes.</p>'}</details></header>
 <nav class="cd-filters" aria-label="Filtro de casos">${[['intervention','Mi intervención'],['all','Todos'],['closed','Cerrados']].map(([key,label])=>`<button type="button" data-direction-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</nav>
 <label class="cd-search">Buscar casos<input id="directionSearch" type="search" value="${esc(search)}" placeholder="Cliente, solicitud, responsable o siguiente paso"></label>
 ${unavailable?'<p class="cd-error" role="alert">No se pudo cargar el servicio de decisiones. Los casos siguen disponibles; actualiza antes de decidir.</p>':''}
 <p class="cd-count" role="status">${rows.length} caso${rows.length===1?'':'s'}</p>
 <div class="cd-cards">${rows.length?rows.map(c=>`<article class="cd-card" data-case-id="${esc(c.lead.id)}"><header><h3>${esc(c.title)}</h3><span>${esc(priorityLabels[c.state.priority])} · ${esc(CASE_STATES[c.state.lifecycle])}</span></header><p class="cd-request">${esc(c.request)}</p><p class="cd-attention"><strong>Tu intervención:</strong> ${esc(c.reasons.join(' · ')||'Sin decisiones o alertas registradas')}</p><dl><div><dt>Responsable</dt><dd>${esc(c.owner)}</dd></div><div><dt>Próximo paso</dt><dd>${esc(c.next)}</dd></div><div><dt>Fecha</dt><dd>${esc(date(c.due))}</dd></div></dl><footer><button type="button" class="primary" data-direction-action="${c.action}" data-direction-case="${esc(c.lead.id)}" data-direction-request="${esc(c.requestId)}" ${unavailable?'disabled':''}>${esc(DIRECTION_ACTIONS[c.action])}</button><button type="button" data-lead-detail="${esc(c.lead.id)}">Abrir caso e historial</button></footer></article>`).join(''):'<div class="cd-empty"><h3>Sin casos en esta selección</h3><p>Prueba «Todos» o cambia la búsqueda. Una espera del cliente sigue pendiente.</p></div>'}</div></section>`;
}
export function renderDirectionDetail(lead,data,{unavailable=false}={}){
 const c=directionCase(lead,data);
 const events=(data.crm_case_decisions||[]).filter(d=>d.lead_id===lead.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const requestCards=c.requests.map(r=>`<article class="cd-request-record"><h4>${esc(REQUEST_LABELS[r.category])} · ${esc(requestStates[r.status])}</h4><p>${esc(r.payload.scope)}</p>${r.payload.amount!=null?`<p>Importe: ${esc(r.payload.amount)} ${esc(r.payload.currency)}${r.payload.margin_pct!=null?' · Margen: '+esc(r.payload.margin_pct)+'%':''}</p>`:''}${r.payload.limits?`<p>Límites: ${esc(r.payload.limits)}</p>`:''}${r.payload.due_at?`<p>Compromiso: ${esc(date(r.payload.due_at))}</p>`:''}${r.payload.alternatives?`<p>Alternativas: ${esc(r.payload.alternatives)}</p>`:''}${r.payload.impact?`<p>Impacto registrado: ${esc(r.payload.impact)}</p>`:''}${r.payload.complaint?`<p>Reclamo vinculado: ${esc(r.payload.complaint.reference)} <a href="complaints.html" target="_blank" rel="noopener">Abrir reclamos</a></p>`:''}${r.category==='PROPOSAL'?`<p>Versión ${esc(r.payload.quote_revision)} · ${proposalIsCurrent(r,data)?'Vigente':'Cambió la propuesta: esta decisión no autoriza la versión actual'}</p><button type="button" data-direction-quote="${esc(r.payload.quote_id)}" data-direction-quote-revision="${esc(r.payload.quote_revision)}">Consultar versión concreta</button>`:''}
 ${r.status==='PENDING'||r.category==='BLOCKER'&&['APPROVED','REJECTED'].includes(r.status)?`<button type="button" data-direction-action="${r.category==='BLOCKER'&&r.status==='APPROVED'?'VERIFY_BLOCKER':r.category}" data-direction-case="${esc(lead.id)}" data-direction-request="${esc(r.id)}" ${unavailable?'disabled':''}>${esc(DIRECTION_ACTIONS[r.category==='BLOCKER'&&r.status==='APPROVED'?'VERIFY_BLOCKER':r.category])}</button>`:''}${r.category==='COMMITMENT'&&['PENDING','APPROVED'].includes(r.status)?`<button type="button" data-direction-action="REQUEST" data-direction-case="${esc(lead.id)}" data-direction-supersedes="${esc(r.id)}">Modificar compromiso</button>`:''}</article>`).join('');
 return `<section class="cd-supervision"><h3>Decisiones y seguimiento</h3><p>${esc(CASE_STATES[c.state.lifecycle])} · Prioridad ${esc(priorityLabels[c.state.priority])}${c.state.review_at?' · Revisión: '+esc(date(c.state.review_at)):''}</p>${c.state.result?`<p>Resultado: ${esc(c.state.result)}</p><p>Evidencia: ${esc(c.state.evidence)}</p>`:''}${unavailable?'<p role="alert">Servicio de decisiones no disponible. Actualiza para reintentar.</p>':''}<div class="cd-actions">${['PRIORITIZE','ASSIGN','REQUEST','CONTINUE','PAUSE','DISCARD','ATTEND','WAIT','RESOLVE','CLOSE','REOPEN'].map(action=>`<button type="button" data-direction-action="${action}" data-direction-case="${esc(lead.id)}" ${unavailable?'disabled':''}>${esc(DIRECTION_ACTIONS[action])}</button>`).join('')}</div>${requestCards||'<p>Sin solicitudes de decisión registradas. Puedes registrar una propuesta, excepción, recurso, compromiso, bloqueo o escalación.</p>'}<details><summary>Historial de decisiones · ${events.length}</summary>${events.map(e=>`<article class="cd-event"><h4>${esc(DIRECTION_ACTIONS[e.action]||e.action)}</h4><p>${esc(e.reason)}</p><p>${esc(date(e.created_at))} · ${esc((data.users||[]).find(u=>u.id===e.actor_id)?.full_name||'Actor registrado')}</p><details><summary>Valores anteriores y posteriores</summary><pre>${esc(JSON.stringify({antes:e.before_value,despues:e.after_value},null,2))}</pre></details></article>`).join('')||'<p>Sin decisiones registradas.</p>'}</details></section>`;
}

export const CASE_ERRORS={CASE_SCOPE_REQUIRED:'Describe el alcance o impedimento de la solicitud.',CASE_LIMITS_REQUIRED:'Indica importe, moneda y límites de la autorización.',CASE_DISCOUNT_REQUIRED:'Indica un descuento entre 0 y 100%.',CASE_PAYMENT_TERMS_REQUIRED:'Indica el plazo de pago solicitado.',CASE_REQUEST_NOT_FOUND:'Selecciona una solicitud disponible en este caso.',CASE_OUTCOME_REQUIRED:'Selecciona aprobar o rechazar.',CASE_CONFLICT:'Otra persona modificó el caso. Tus datos se conservan: revisa la versión actual y vuelve a confirmar.',CASE_DIRECTION_REQUIRED:'Tu cuenta no tiene permiso de Dirección.',CASE_PERMISSION_DENIED:'Tu cuenta no tiene permiso para esta acción.',CASE_NOT_ACCESSIBLE:'El caso no está disponible para tu cuenta.',CASE_INVALID_OWNER:'Selecciona un responsable válido de la organización.',CASE_REASON_REQUIRED:'Escribe un motivo de al menos tres caracteres.',CASE_WORK_REQUIRED:'Define responsable, próximo paso y una fecha futura.',CASE_FUTURE_DATE_REQUIRED:'La fecha debe ser futura y válida.',CASE_APPROVAL_RULE_REQUIRED:'Falta una regla empresarial confirmada para esta autorización. Puedes rechazar o asignar la revisión.',CASE_APPROVAL_LIMIT_EXCEEDED:'El importe supera el límite confirmado de Dirección.',CASE_MARGIN_LIMIT:'El margen no cumple la regla confirmada.',CASE_DISCOUNT_LIMIT:'El descuento supera la regla confirmada.',CASE_PAYMENT_LIMIT:'El plazo de pago supera la regla confirmada.',CASE_PROPOSAL_CHANGED:'Cambió la versión de la propuesta. Registra la nueva versión antes de decidir.',CASE_PROPOSAL_INCOMPLETE:'La propuesta necesita alcance, precio y margen en el cotizador.',CASE_QUOTE_MODULE_UNAVAILABLE:'El cotizador no está disponible en este entorno. Conserva el caso y asigna su preparación.',CASE_QUOTE_NOT_LINKED:'La propuesta debe pertenecer a una oportunidad vinculada a este caso.',CASE_COMPLAINT_MODULE_UNAVAILABLE:'Reclamos no está disponible en este entorno. Registra la escalación sin inventar un reclamo.',CASE_COMPLAINT_NOT_FOUND:'No se encontró el reclamo existente.',CASE_PENDING_ACTIONS:'Hay tareas, reuniones, entregables o decisiones pendientes. Comprueba su ejecución antes de resolver o cerrar.',CASE_COMMITMENT_CHANGED:'Cambió la fecha o el responsable del compromiso. Registra una modificación y decide esa versión.',CASE_BLOCKER_TASK_PENDING:'La tarea del bloqueo sigue pendiente. Comprueba y registra su ejecución primero.',CASE_BLOCKER_EVIDENCE_REQUIRED:'El bloqueo necesita una decisión de tratamiento y evidencia de resolución.',CASE_RESULT_EVIDENCE_REQUIRED:'Registra un resultado y su evidencia.',CASE_ADMINISTRATIVE_CLOSE_REQUIRED:'Primero registra la resolución, o confirma un cierre administrativo explícito.',CASE_REOPEN_REQUIRED:'Este caso requiere reapertura antes de registrar más acciones.',CASE_NOT_REOPENABLE:'El caso ya está pendiente; utiliza Continuar.',CASE_REQUEST_ALREADY_DECIDED:'Esta solicitud ya tiene una decisión. Actualiza el historial.',CASE_IDEMPOTENCY_CONFLICT:'El identificador pertenece a otra operación. Revisa el historial antes de volver a confirmar.'};
export function caseError(error){const message=String(error?.message||'');const key=Object.keys(CASE_ERRORS).find(k=>message.includes(k));return key?CASE_ERRORS[key]:'No pudimos confirmar el resultado. Se conserva lo escrito; consulta o reintenta la misma operación.';}
const options=(entries,selected='')=>entries.map(([v,label])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');
const field=(name,label,type='text',value='',required=false)=>`<label>${label}${type==='textarea'?`<textarea name="${name}" rows="3" ${required?'required':''}>${esc(value)}</textarea>`:`<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='number'?'min="0" step="any"':''}>`}</label>`;

// Controller is scoped to this tab. A command keeps the same receipt on uncertain retries.
export function createDirectionController({getContext,execute,onSaved,onOpenQuote}){
 let dialog,active=null,saving=false,pending=null;
 const ensure=()=>{if(dialog)return;dialog=document.createElement('dialog');dialog.className='cd-dialog';dialog.id='caseDirectionDialog';dialog.setAttribute('aria-labelledby','cdDialogTitle');document.body.append(dialog);dialog.addEventListener('cancel',e=>{if(saving||pending)e.preventDefault();});};
 const close=()=>{if(saving||pending)return;dialog.close();active=null;};
 function open({leadId,action,requestId='',supersedesId=''}){
  if(active&&dialog?.open){dialog.focus();return;}
  const ctx=getContext(),lead=ctx.data.leads.find(l=>l.id===leadId);if(!lead||ctx.profile?.role!=='ADMIN'||ctx.unavailable)return;
  ensure();const state=stateFor(lead,ctx.data);active={lead,action,requestId,supersedesId,revision:state.revision,updatedAt:lead.updated_at??null};pending=null;
  const requests=linkedRequests(lead,ctx.data).filter(r=>r.category===(action==='VERIFY_BLOCKER'?'BLOCKER':action)&&(['PENDING','REJECTED'].includes(r.status)||action==='VERIFY_BLOCKER'&&r.status==='APPROVED'));
  const requested=requests.find(r=>r.id===requestId)||requests[0];
  const owners=(ctx.data.users||[]).filter(u=>u.organization_id===lead.organization_id&&['ADMIN','MANAGER','SALES'].includes(u.role));
  if(!owners.some(o=>o.id===ctx.profile.id))owners.push(ctx.profile);
  const workActions=['ASSIGN','CONTINUE','PAUSE','REOPEN','ATTEND','WAIT','PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','ESCALATION'];
  const decision=['PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','ESCALATION'].includes(action);
  const quoteIds=new Set((ctx.data.opportunities||[]).filter(o=>o.lead_id===leadId).map(o=>o.id));
  const quotes=(ctx.data.quotes||[]).filter(q=>quoteIds.has(q.opportunity_id));
  dialog.innerHTML=`<header><div><small>DECISIÓN SOBRE EL CASO</small><h2 id="cdDialogTitle">${esc(DIRECTION_ACTIONS[action])}</h2><p>${esc(lead.title)}</p></div><button type="button" data-cd-close aria-label="Cerrar decisión">Cerrar</button></header><form><fieldset class="cd-fields">
  ${action==='PRIORITIZE'?`<label>Prioridad<select name="priority">${options(Object.entries(priorityLabels),state.priority)}</select></label>`:''}
  ${decision||action==='VERIFY_BLOCKER'?`<label>Solicitud concreta<select name="request_id" required><option value="">Seleccionar solicitud pendiente</option>${options(requests.map(r=>[r.id,r.payload.scope]),requested?.id)}</select></label><div class="cd-selected-request"></div>`:''}
  ${decision?'<label>Decisión<select name="outcome"><option value="APPROVE">Aprobar y asignar ejecución</option><option value="REJECT">Rechazar</option></select></label>':''}
  ${action==='REQUEST'?`<label>Tipo de solicitud<select name="category">${options(Object.entries(REQUEST_LABELS),supersedesId?'COMMITMENT':'PROPOSAL')}</select></label>${field('scope','Alcance o impedimento','textarea','',true)}<div data-cd-proposal><label>Versión del cotizador vinculada al caso<select name="quote_id"><option value="">Seleccionar propuesta</option>${options(quotes.map(q=>[q.id,(q.title||'Propuesta')+' · v'+q.revision]))}</select></label><p>Se recuperarán alcance, precio y margen de esta versión en el servidor.</p>${!quotes.length?'<p>Falta una propuesta vinculada. Usa el cotizador existente y conserva este caso asignado.</p>':''}</div><div data-cd-financial>${field('amount','Importe afectado','number')}${field('currency','Moneda (código ISO)','text')}<label>Tipo de excepción<select name="exception_type">${options([['DISCOUNT','Descuento'],['PAYMENT','Condición de pago'],['CHANGE','Cambio de alcance o condición']])}</select></label>${field('discount_pct','Descuento solicitado (%)','number')}${field('payment_days','Plazo de pago solicitado (días)','number')}${field('limits','Límites y condiciones de la autorización','textarea')}</div><div data-cd-commitment></div><div data-cd-escalation>${field('complaint_id','ID del reclamo existente (opcional)','number')}<p>Vincular un reclamo no modifica su atención ni su resultado.</p></div>${field('alternatives','Alternativas conocidas (opcional)','textarea')}${field('impact','Impacto documentado (opcional)','textarea')}`:''}
  ${workActions.includes(action)||action==='REQUEST'?`<div class="cd-work"><label>Responsable de cumplimiento<select name="owner_id"><option value="">Seleccionar responsable</option>${options(owners.map(u=>[u.id,u.full_name||'Nombre pendiente']),lead.owner_user_id)}</select></label>${field('next_action','Próximo paso','textarea',action==='REQUEST'?'':lead.next_action||'')}${field('due_at',action==='PAUSE'?'Fecha de revisión de la pausa':'Fecha de cumplimiento','datetime-local')}</div>`:''}
  ${['ATTEND','RESOLVE','CLOSE','REOPEN'].includes(action)?field('result','Resultado comprobado','textarea','',true):''}
  ${['ATTEND','RESOLVE','CLOSE','REOPEN','VERIFY_BLOCKER'].includes(action)?field('evidence','Evidencia o referencia verificable','textarea','',true):''}
  ${action==='CLOSE'?'<label class="cd-checkbox"><input type="checkbox" name="administrative"> Cierre administrativo excepcional (no acredita resolución ni venta)</label>':''}
  ${field('reason','Motivo de la decisión','textarea','',true)}</fieldset><p class="cd-message" role="status" aria-live="polite"></p><footer><button type="submit" class="primary">Registrar decisión</button><button type="button" data-cd-reconcile hidden>Consultar o reintentar la misma operación</button><button type="button" data-cd-conflict hidden>Revisar la versión actual</button><button type="button" data-cd-close>Cancelar</button></footer></form>`;
  const form=dialog.querySelector('form'),fields=dialog.querySelector('fieldset'),msg=dialog.querySelector('.cd-message');
  dialog.querySelectorAll('[data-cd-close]').forEach(b=>b.onclick=close);
  function showRequest(){const r=requests.find(r=>r.id===form.elements.request_id?.value);const box=dialog.querySelector('.cd-selected-request');if(box)box.innerHTML=r?`<p>${esc(r.payload.scope)}</p>${r.payload.amount!=null?`<p>Importe: ${esc(r.payload.amount)} ${esc(r.payload.currency)}${r.payload.margin_pct!=null?' · Margen: '+esc(r.payload.margin_pct)+'%':''}</p>`:''}${r.payload.limits?`<p>Límites: ${esc(r.payload.limits)}</p>`:''}${r.payload.quote_revision?`<p>Versión concreta: v${esc(r.payload.quote_revision)}</p>`:''}`:'';}
  function conditional(){
   const category=form.elements.category?.value;
   for(const [selector,shown] of [['[data-cd-proposal]',category==='PROPOSAL'],['[data-cd-financial]',['EXCEPTION','RESOURCE'].includes(category)],['[data-cd-escalation]',category==='ESCALATION']]){const el=dialog.querySelector(selector);if(el){el.hidden=!shown;el.querySelectorAll('input,select,textarea').forEach(n=>n.disabled=!shown);}}
   const work=dialog.querySelector('.cd-work');if(work){const required=action==='REQUEST'?category==='COMMITMENT':workActions.includes(action)&&form.elements.outcome?.value!=='REJECT';work.hidden=decision&&form.elements.outcome.value==='REJECT';work.querySelectorAll('input,select,textarea').forEach(n=>{n.required=required;n.disabled=work.hidden;});}
   if(action==='REQUEST'&&category==='PROPOSAL'){form.elements.quote_id.required=true;}else if(form.elements.quote_id)form.elements.quote_id.required=false;
   showRequest();
  }
  form.onchange=conditional;conditional();
  async function submit(command){
   if(saving)return;saving=true;fields.disabled=true;dialog.querySelector('[type=submit]').disabled=true;dialog.querySelector('[data-cd-reconcile]').disabled=true;msg.textContent='Comprobando y guardando la decisión…';
   try{
    const result=await execute(command);
    if(result.error)throw result.error;
    if(!result.data?.command_id||result.data.command_id!==command.p_command_id)throw new Error('UNCONFIRMED_RESULT');
    pending=null;saving=false;dialog.close();active=null;await onSaved({leadId,result:result.data});
   }catch(error){
    const known=Object.keys(CASE_ERRORS).some(k=>String(error.message).includes(k))||/^22|^23|^42|^P0001/.test(error.code||'');
    pending=known?null:command;msg.textContent=caseError(error);
    const conflict=String(error.message).includes('CASE_CONFLICT');dialog.querySelector('[data-cd-conflict]').hidden=!conflict;
    if(conflict)dialog.querySelector('[type=submit]').hidden=true;
    dialog.querySelector('[data-cd-reconcile]').hidden=!pending;
    fields.disabled=!!pending;dialog.querySelector('[type=submit]').disabled=!!pending;
   }finally{saving=false;dialog.querySelector('[data-cd-reconcile]').disabled=false;}
  }
  form.onsubmit=event=>{event.preventDefault();if(pending||saving)return;const values=Object.fromEntries(new FormData(form));const reason=values.reason;delete values.reason;delete values.owner_id_unused;
   if(values.due_at)values.due_at=new Date(values.due_at).toISOString();
   if(action==='REQUEST'&&values.category==='PROPOSAL')values.quote_revision=quotes.find(q=>q.id===values.quote_id)?.revision;
   if(supersedesId)values.supersedes_id=supersedesId;
   values.administrative=!!form.elements.administrative?.checked;
   submit({p_lead_id:leadId,p_expected_revision:active.revision,p_expected_updated_at:active.updatedAt,p_command_id:crypto.randomUUID(),p_action:action,p_reason:reason,p_payload:values});
  };
  dialog.querySelector('[data-cd-reconcile]').onclick=()=>{if(pending)submit(pending);};
  dialog.querySelector('[data-cd-conflict]').onclick=async()=>{
   const b=dialog.querySelector('[data-cd-conflict]');b.disabled=true;
   try{await onSaved({leadId,conflict:true});const fresh=getContext();const current=fresh.data.leads.find(l=>l.id===leadId);if(!current||fresh.unavailable)throw Error('UNAVAILABLE');active.revision=stateFor(current,fresh.data).revision;active.updatedAt=current.updated_at??null;msg.textContent='Versión actual revisada. Responsable: '+((fresh.data.users||[]).find(u=>u.id===current.owner_user_id)?.full_name||'Pendiente')+'; siguiente paso: '+(current.next_action||'Pendiente')+'. Se conserva tu formulario. Confirma otra vez si sigue siendo correcto.';b.hidden=true;dialog.querySelector('[type=submit]').hidden=false;
   }catch{msg.textContent='No se pudo recuperar la versión actual. Se conserva tu formulario.';}finally{b.disabled=false;}
  };
  dialog.showModal();form.elements.reason.focus();
 }
 return {open,close,isOpen:()=>!!dialog?.open,openQuote:(id,revision)=>onOpenQuote?.(id,revision)};
}
