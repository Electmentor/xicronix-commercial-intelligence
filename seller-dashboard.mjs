import {escapeHTML as esc, normalize, money, taskUrgency, sortTasksByUrgency} from './domain.mjs';
import {caseRequestContext,caseInboundMail,caseOutboundStatus,caseUnconfirmedMailActivity,caseResponseProgress} from './case-attention.mjs';
import {caseReplyContext} from './case-reply.mjs';

const closedLead = row => ['DISQUALIFIED','CONVERTED'].includes(row.status);

function urgencyForLead(lead,tasks,now){
  const own=sortTasksByUrgency(tasks.filter(row=>row.lead_id===lead.id&&!['COMPLETED','CANCELLED'].includes(row.status)),now.getTime());
  const top=own[0];
  if(top){
    const u=taskUrgency(top,now.getTime());
    if(['OVERDUE','TODAY'].includes(u.band)) return {label:'Alta',tone:'danger',rank:3,next:top.title,date:top.due_at};
    if(['SOON','WEEK'].includes(u.band)) return {label:'Media',tone:'warning',rank:2,next:top.title,date:top.due_at};
    return {label:'Baja',tone:'calm',rank:1,next:top.title,date:top.due_at};
  }
  if(lead.next_action_date){
    const delta=Date.parse(lead.next_action_date)-now.getTime();
    if(delta<0) return {label:'Alta',tone:'danger',rank:3,next:lead.next_action||'Retomar seguimiento',date:lead.next_action_date};
    if(delta<=72*3600000) return {label:'Media',tone:'warning',rank:2,next:lead.next_action||'Realizar seguimiento',date:lead.next_action_date};
  }
  return {label:'Baja',tone:'calm',rank:1,next:lead.next_action||'Definir siguiente acción',date:lead.next_action_date||null};
}

function compactDate(value){
  if(!value)return 'Sin fecha';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'Sin fecha';
  return d.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'});
}
function compactDateTime(value){
  if(!value)return 'Sin fecha ni hora';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'Sin fecha ni hora';
  return d.toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function prospectDisplayId(lead){return String(lead?.id||'').slice(0,8).toUpperCase();}
function normalizeProspectIdSearch(value){
  return String(value||'')
    .trim()
    .toUpperCase()
    .replace(/^ID\s*/,'')
    .replace(/O/g,'0')
    .replace(/[^0-9A-F]/g,'');
}
function sameMonth(value,now){
  const d=new Date(value);return Number.isFinite(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
}
function sameYear(value,now){
  const d=new Date(value);return Number.isFinite(d.getTime())&&d.getFullYear()===now.getFullYear();
}
function currentGoal(goals,now){
  const stamp=now.getTime();
  return (goals||[]).find(row=>{
    const start=Date.parse(String(row.period_start||'')+'T00:00:00');
    const end=Date.parse(String(row.period_end||'')+'T23:59:59');
    return Number.isFinite(start)&&Number.isFinite(end)&&start<=stamp&&stamp<=end;
  })||null;
}
function sellerPerformanceDashboard(data,{now=new Date(),demo=false,failures={}}={}){
  const opportunities=data.opportunities||[], tasks=data.tasks||[], meetings=data.meetings||[], activities=data.activities||[], leads=data.leads||[];
  const openOpps=opportunities.filter(row=>!['WON','LOST'].includes(row.stage));
  const won=opportunities.filter(row=>row.stage==='WON');
  const lost=opportunities.filter(row=>row.stage==='LOST');
  const wonMonth=won.filter(row=>sameMonth(row.updated_at||row.expected_close_date,now));
  const wonYear=won.filter(row=>sameYear(row.updated_at||row.expected_close_date,now));
  const salesMonth=wonMonth.reduce((sum,row)=>sum+(Number(row.value)||0),0);
  const salesYear=wonYear.reduce((sum,row)=>sum+(Number(row.value)||0),0);
  const pipeline=openOpps.reduce((sum,row)=>sum+(Number(row.value)||0),0);
  const forecast=openOpps.reduce((sum,row)=>{
    const p=Math.max(0,Math.min(100,Number(row.probability)||0));
    return sum+(Number(row.value)||0)*p/100;
  },0);
  const openTasks=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
  const overdue=openTasks.filter(row=>row.due_at&&Date.parse(row.due_at)<now.getTime()).length;
  const upcomingMeetings=meetings.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=now.getTime()&&Date.parse(row.start_at)<=now.getTime()+7*86400000).length;
  const activeLeads=leads.filter(row=>!['DISQUALIFIED','CONVERTED'].includes(row.status)).length;
  const conversion=(won.length+lost.length)?Math.round(won.length/(won.length+lost.length)*100):0;
  const monthActivities=activities.filter(row=>sameMonth(row.occurred_at||row.created_at,now)).length;
  const monthMeetings=meetings.filter(row=>row.status==='COMPLETED'&&sameMonth(row.start_at,now)).length;
  const monthTasks=tasks.filter(row=>sameMonth(row.updated_at||row.created_at,now));
  const completedMonth=monthTasks.filter(row=>row.status==='COMPLETED').length;
  const taskDiscipline=monthTasks.length?Math.round(completedMonth/monthTasks.length*100):0;
  const goal=currentGoal(data.goals||[],now);
  const target=Number(goal?.target_won_value)||0;
  const goalPct=target>0?Math.max(0,Math.min(999,Math.round(salesMonth/target*100))):null;
  const incomplete=Object.keys(failures||{}).length>0;

  return '<div class="seller-performance-dashboard modern-home">'+
    '<section class="seller-performance-hero modern-hero"><div class="modern-hero-copy"><small>BIENVENIDO A XICRONIX</small><h1>Tu negocio<br>en una sola vista.</h1><p>Clientes, oportunidades, tareas y más.<br>Todo en un solo lugar.</p><div class="modern-hero-pillars"><span><i class="pillar-icon pillar-clients" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-2.2A4.8 4.8 0 0 1 8.3 12h1.4a4.8 4.8 0 0 1 4.8 4.8V19"/><circle cx="17" cy="9" r="2.2"/><path d="M15.8 13.2h1.4a3.8 3.8 0 0 1 3.8 3.8v2"/></svg></i><b>Conecta</b><small>con tus clientes</small></span><span><i class="pillar-icon pillar-sales" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V11h4v9M10 20V7h4v13M16 20V4h4v16"/></svg></i><b>Impulsa</b><small>tus ventas</small></span><span><i class="pillar-icon pillar-auto" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 2 5.8 13h5.4L10 22l8.2-12H13z"/></svg></i><b>Automatiza</b><small>tu crecimiento</small></span></div></div>'+
    '<div class="modern-hero-operator"><img class="modern-operator-real-photo" src="https://images.unsplash.com/photo-1766066014237-00645c74e9c6?auto=format&fit=crop&fm=webp&q=82&w=1400" alt="Asesora comercial profesional con auriculares" loading="eager" decoding="async"></div></section>'+

    '<section class="seller-performance-kpis">'+
      '<article class="seller-performance-kpi primary"><small>VENTAS DEL MES</small><strong>'+money(salesMonth)+'</strong><span>'+wonMonth.length+' venta'+(wonMonth.length===1?'':'s')+' ganada'+(wonMonth.length===1?'':'s')+'</span></article>'+
      '<article class="seller-performance-kpi"><small>VENTAS DEL AÑO</small><strong>'+money(salesYear)+'</strong><span>'+wonYear.length+' cierre'+(wonYear.length===1?'':'s')+' registrado'+(wonYear.length===1?'':'s')+'</span></article>'+
      '<article class="seller-performance-kpi"><small>PIPELINE PERSONAL</small><strong>'+money(pipeline)+'</strong><span>'+openOpps.length+' oportunidad'+(openOpps.length===1?'':'es')+' abierta'+(openOpps.length===1?'':'s')+'</span></article>'+
      '<article class="seller-performance-kpi"><small>FORECAST PONDERADO</small><strong>'+money(forecast)+'</strong><span>valor × probabilidad</span></article>'+
    '</section>'+

    '<section class="seller-performance-grid">'+
      '<article class="seller-performance-panel goal-panel"><header><div><small>META COMERCIAL</small><h2>'+(target>0?'Progreso del periodo':'Meta todavía no asignada')+'</h2></div><strong>'+(goalPct===null?'—':goalPct+'%')+'</strong></header>'+
        '<div class="seller-goal-track"><i style="width:'+Math.min(100,goalPct||0)+'%"></i></div>'+
        '<div class="seller-goal-values"><span><b>'+money(salesMonth)+'</b><small>Ganado este mes</small></span><span><b>'+(target>0?money(target):'—')+'</b><small>Meta vigente</small></span></div>'+
      '</article>'+
      '<article class="seller-performance-panel execution-panel"><header><div><small>OPERACIÓN</small><h2>Estado de tu jornada</h2></div></header>'+
        '<div class="seller-execution-stats"><button type="button" data-page="tasks"><b>'+openTasks.length+'</b><span>Tareas pendientes</span><small>'+overdue+' vencidas</small></button>'+
        '<button type="button" data-page="meetings"><b>'+upcomingMeetings+'</b><span>Reuniones próximas</span><small>próximos 7 días</small></button>'+
        '<button type="button" data-page="leads"><b>'+activeLeads+'</b><span>Prospectos activos</span><small>mi cartera</small></button></div>'+
      '</article>'+
    '</section>'+

    '<section class="seller-performance-grid lower">'+
      '<article class="seller-performance-panel"><header><div><small>DESEMPEÑO</small><h2>Indicadores del mes</h2></div></header>'+
        '<div class="seller-skill-grid">'+
          '<span><b>'+conversion+'%</b><small>Conversión de cierres</small></span>'+
          '<span><b>'+taskDiscipline+'%</b><small>Disciplina de tareas</small></span>'+
          '<span><b>'+monthActivities+'</b><small>Movimientos registrados</small></span>'+
          '<span><b>'+monthMeetings+'</b><small>Reuniones realizadas</small></span>'+
        '</div>'+
      '</article>'+
      '<article class="seller-performance-panel compensation-panel"><header><div><small>MI COMPENSACIÓN</small><h2>Pendiente de contrato</h2></div><span>PRÓXIMAMENTE</span></header>'+
        '<p>El sueldo fijo, bonos y comisiones aparecerán aquí cuando exista un contrato comercial vigente y aprobado. El CRM no estimará pagos sin una regla contractual formal.</p>'+
      '</article>'+
    '</section>'+    (incomplete?'<p class="seller-dashboard-data-note">Hay módulos con información pendiente de carga. Los indicadores se calculan únicamente con los datos disponibles.</p>':'')+
  '</div>';
}

function caseListRequest(lead,data){
 const original=caseRequestContext(lead,data);if(original.text)return original;
 const reply=caseReplyContext(lead,data);return reply.complete&&reply.contextText?{text:reply.contextText,source:reply.source,at:reply.at}:original;
}
function caseRows(data,now,currentUser){
  return (data.leads||[]).map(lead=>{
    const institution=(data.institutions||[]).find(row=>row.id===lead.institution_id);
    const contact=(data.contacts||[]).find(row=>row.id===lead.contact_id);
    const owner=(data.users||[]).find(row=>row.id===lead.owner_user_id)||(currentUser?.id===lead.owner_user_id?currentUser:null);
    const activities=(data.activities||[]).filter(row=>row.lead_id===lead.id).sort((a,b)=>(Date.parse(b.occurred_at||b.created_at)||0)-(Date.parse(a.occurred_at||a.created_at)||0));
    const mail=caseInboundMail(lead,data);
    const response=caseResponseProgress(lead,data,{now});
    const newMail=response.pendingMail;
    const latestActivity=activities[0]||null,latestMail=mail[0]||null;
    const outgoing=(data.commercial_mail_outbox||[]).filter(row=>row.lead_id===lead.id).map(row=>({row,state:caseOutboundStatus(row)})).filter(item=>item.state).sort((a,b)=>(Date.parse(b.state.at)||0)-(Date.parse(a.state.at)||0));
    const outbound=outgoing[0]||null,uncertainMail=outgoing.find(item=>item.state.kind==='uncertain')||activities.find(caseUnconfirmedMailActivity)||null;
    const movements=[
      latestActivity&&{text:caseUnconfirmedMailActivity(latestActivity)?'Registro de envío sin confirmación':latestActivity.subject||latestActivity.type||'Actividad registrada',at:latestActivity.occurred_at||latestActivity.created_at},
      latestMail&&{text:'Correo recibido'+(latestMail.subject?': '+latestMail.subject:''),at:latestMail.received_at||latestMail.created_at},
      outbound&&{text:outbound.state.label+(outbound.row.subject?': '+outbound.row.subject:''),at:outbound.state.at,kind:outbound.state.kind}
    ].filter(Boolean).sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
    return {lead,institution,contact,owner,request:caseListRequest(lead,data),urgency:urgencyForLead(lead,data.tasks||[],now),newMail,uncertainMail,response,latest:movements[0]||null};
  }).sort((a,b)=>Number(closedLead(a.lead))-Number(closedLead(b.lead))||Number(!!b.uncertainMail)-Number(!!a.uncertainMail)||Number(!!b.newMail)-Number(!!a.newMail)||b.urgency.rank-a.urgency.rank||(Date.parse(b.latest?.at||b.lead.created_at)||0)-(Date.parse(a.latest?.at||a.lead.created_at)||0));
}
function matchesCaseSearch(row,query){
  const q=normalize(String(query||'').trim());
  if(!q)return true;
  const values=[row.institution?.name,row.lead.title,row.lead.id,row.contact?.first_name,row.contact?.last_name,row.contact?.email,row.owner?.full_name,row.request.text];
  if(normalize(values.filter(Boolean).join(' ')).includes(q))return true;
  // Keep short-ID searches, without treating ordinary words as hexadecimal IDs.
  if(!/^(?:id\s*)?[a-f0-9o-]{4,}$/i.test(String(query).trim()))return false;
  const id=normalizeProspectIdSearch(query);
  return !!id&&normalizeProspectIdSearch(row.lead.id).includes(id);
}
function caseCard(row,canReply){
  const {lead,institution,contact,request,urgency}=row;
  const closed=closedLead(lead),hasEmail=!!String(contact?.email||institution?.email||'').trim(),showReply=canReply&&hasEmail&&!closed&&!row.uncertainMail;
  const status=closed?(lead.status==='CONVERTED'?'Convertido':'Descartado'):(row.uncertainMail?'Revisar envío':row.latest?.kind==='failed'?'Envío fallido':row.newMail?'Correo nuevo':row.response.responseAccepted?'En seguimiento':urgency.label==='Alta'?'Por atender':'Pendiente');
  const ownerName=row.owner?.full_name||(lead.owner_user_id?'Responsable asignado':'Sin responsable');
  const next=row.uncertainMail?'Revisar el envío sin confirmación antes de enviar otro correo.':closed?'Caso cerrado':row.latest?.kind==='failed'?'Revisar el envío fallido y corregirlo antes de volver a enviar.':row.newMail?'Revisar el correo recibido y preparar la respuesta.':row.response.responseAccepted?row.response.nextAction:urgency.next;
  const nextDate=row.response.responseAccepted?row.response.nextDate:urgency.date;
  const origin=request.source+(request.at?' · '+compactDate(request.at):'');
  return '<article class="case-card'+(closed?' is-closed':'')+'" data-case-id="'+esc(lead.id)+'">'+
    '<header class="case-card-heading"><div><span class="prospect-id">ID '+esc(prospectDisplayId(lead))+'</span><h2>'+esc(institution?.name||lead.title||'Institución sin nombre')+'</h2></div><span class="seller-urgency '+(closed?'calm':row.uncertainMail||row.latest?.kind==='failed'?'danger':row.newMail?'warning':urgency.tone)+'">'+esc(status)+'</span></header>'+
    '<div class="case-request"><small>Solicitud</small><p>'+esc(request.text||'Solicitud todavía no registrada.')+'</p>'+(origin?'<span class="case-request-source">'+esc(origin)+'</span>':'')+'</div>'+
    '<dl class="case-meta"><div><dt>Responsable</dt><dd>'+esc(ownerName)+'</dd></div><div><dt>Última acción</dt><dd>'+esc(row.latest?.text||'Sin acción registrada')+(row.latest?.at?'<small>'+esc(compactDateTime(row.latest.at))+'</small>':'')+'</dd></div></dl>'+
    '<div class="case-next"><small>Siguiente paso</small><strong>'+esc(next)+'</strong>'+(!closed&&!row.uncertainMail&&row.latest?.kind!=='failed'&&nextDate?'<span>'+esc(compactDateTime(nextDate))+'</span>':'')+'</div>'+
    '<footer class="case-actions">'+(showReply?'<button type="button" class="primary" data-smart-mail="'+esc(lead.id)+'">'+(row.response.responseAccepted?'Escribir correo':'Responder')+'</button>':'')+'<button type="button"'+(!showReply?' class="primary"':'')+' data-lead-detail="'+esc(lead.id)+'">Abrir caso</button></footer>'+
  '</article>';
}

export function renderSellerDashboard(data,{now=new Date(),demo=false,failures={},searchQuery='',showSearch=false,caseFilter='pending',currentUser=null,canReply=true}={}){
  if(!showSearch)return sellerPerformanceDashboard(data,{now,demo,failures});
  const filter=['pending','all','closed'].includes(caseFilter)?caseFilter:'pending';
  const all=caseRows(data,now,currentUser);
  const filtered=all.filter(row=>filter==='all'||(filter==='closed'?closedLead(row.lead):!closedLead(row.lead)));
  const rows=filtered.filter(row=>matchesCaseSearch(row,searchQuery));
  const incomplete=Object.keys(failures||{}).length>0;
  const totals={pending:all.filter(row=>!closedLead(row.lead)).length,all:all.length,closed:all.filter(row=>closedLead(row.lead)).length};
  const filters=[['pending','Pendientes'],['all','Todos'],['closed','Cerrados']].map(([key,label])=>'<button type="button" data-case-filter="'+key+'" class="case-filter'+(filter===key?' active':'')+'" aria-pressed="'+(filter===key)+'">'+label+' <span>'+totals[key]+'</span></button>').join('');
  const empty=failures.leads?'No se pudieron cargar los casos. Actualiza para volver a intentarlo.':String(searchQuery||'').trim()?'No hay casos que coincidan con esta búsqueda.':filter==='closed'?'No hay casos cerrados.':filter==='all'?'Todavía no hay casos.':'No hay casos pendientes.';
  return '<div class="seller-story-dashboard case-workspace">'+
    '<section class="case-toolbar"><div class="case-filters" role="group" aria-label="Filtrar casos">'+filters+'</div>'+
    '<div class="commercial-search"><div class="commercial-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="commercialSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar colegio, solicitud o ID…" value="'+esc(searchQuery)+'" aria-label="Buscar casos por colegio, solicitud, contacto o ID"></div></div></section>'+
    (incomplete?'<p class="case-load-warning" role="status">Información parcial: hay datos pendientes de carga. Actualiza antes de decidir.</p>':'')+
    '<p class="case-count" role="status">'+rows.length+' caso'+(rows.length===1?'':'s')+(demo?' · datos de demostración':'')+'</p>'+
    (rows.length?'<section class="case-list" aria-label="Lista de casos">'+rows.map(row=>caseCard(row,canReply)).join('')+'</section>':'<div class="panel empty case-empty">'+esc(empty)+'</div>')+
  '</div>';
}
