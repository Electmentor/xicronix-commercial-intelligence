import {escapeHTML as esc, money, taskUrgency, sortTasksByUrgency} from './domain.mjs';
import {MILESTONE_META,milestoneLabel,milestonePercent} from './commercial-core.mjs?v=20260923-v2.40.22';

const closedLead = row => ['DISQUALIFIED','CONVERTED'].includes(row.status);
const safePct = value => Math.max(0,Math.min(100,Number(value)||0));

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

function potentialForLead(lead,scores){
  const score=scores.find(row=>row.lead_id===lead.id);
  return score?safePct(score.total_score):null;
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

function sellerPhoneHref(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits?'tel:+'+(digits.startsWith('51')?digits:'51'+digits):'';
}
function sellerWhatsappHref(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits?'https://wa.me/'+(digits.startsWith('51')?digits:'51'+digits):'';
}
function sellerQuickActions(row,{compact=false}={}){
  const contact=row.contact||null;
  const institution=row.institution||null;
  const phone=String(contact?.phone||institution?.phone||'').trim();
  const email=String(contact?.email||institution?.email||'').trim();
  return '<div class="seller-direct-actions'+(compact?' compact':'')+'">'+
    (phone?'<a class="seller-direct-action primary" href="'+esc(sellerPhoneHref(phone))+'">Llamar</a>':'')+
    (email?'<button type="button" class="seller-direct-action" data-smart-mail="'+esc(row.lead.id)+'">Correo</button>':'')+
    (phone?'<a class="seller-direct-action" href="'+esc(sellerWhatsappHref(phone))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
    '<button type="button" class="seller-direct-action" data-activity-lead="'+esc(row.lead.id)+'">Registrar resultado</button>'+
  '</div>';
}

function renderProspectProgress(lead,maturity){
  const percent=Math.max(0,Math.min(100,Number(maturity)||milestonePercent(lead.commercial_milestone)||0));
  const currentCode=lead.commercial_milestone||'';
  const nodes=Object.entries(MILESTONE_META).map(([code,meta],index)=>{
    const reached=percent>=meta.percent;
    const current=currentCode===code || (!currentCode && percent===meta.percent);
    const state=current?'current':reached?'done':'future';
    return '<div class="prospect-progress-node '+state+'" style="--node-pos:'+meta.percent+'%">'+
      '<span class="prospect-progress-tick" aria-hidden="true"></span>'+
      '<div><b>'+meta.percent+'%</b><small>'+esc(meta.label)+'</small></div>'+
    '</div>';
  }).join('');
  return '<section class="prospect-progress" aria-label="Avance comercial '+percent+' por ciento">'+
    '<div class="prospect-progress-shell">'+
      '<div class="prospect-progress-head" aria-hidden="true"></div>'+
      '<div class="prospect-progress-track"><span class="prospect-progress-comet" style="--comet-pos:'+percent+'%" aria-hidden="true"></span>'+nodes+'</div>'+
    '</div>'+
  '</section>';
}

function leadStory(data,lead){
  const activities=(data.activities||[]).filter(row=>row.lead_id===lead.id).sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||'')));
  const latest=activities[0]||null;
  const needRow=activities.find(row=>row.need_summary);
  const evidenceRow=activities.find(row=>row.evidence_note);
  const decisionRow=activities.find(row=>row.decision_timeline||row.budget_signal);
  const contact=(data.contacts||[]).find(row=>row.id===lead.contact_id);
  const problem=needRow?.need_summary||latest?.need_summary||'Necesidad aún no precisada en el expediente.';
  const evidence=evidenceRow?.evidence_note||latest?.evidence_note||'Sin evidencia comercial explícita registrada.';
  const decision=[decisionRow?.decision_timeline,decisionRow?.budget_signal].filter(Boolean).join(' · ')||'Timing y presupuesto aún no confirmados.';
  const missing=[];
  if(!needRow?.need_summary&&!latest?.need_summary)missing.push('precisar la necesidad');
  if(!evidenceRow?.evidence_note&&!latest?.evidence_note)missing.push('registrar evidencia');
  if(!contact)missing.push('identificar al contacto');
  if(!decisionRow?.decision_timeline)missing.push('confirmar timing');
  if(!decisionRow?.budget_signal&&!(Number(lead.estimated_value)>0))missing.push('confirmar presupuesto');
  const missingText=missing.length?missing.slice(0,2).join(' y '):'no hay un bloqueo crítico registrado';
  const situation=latest?
    'Último movimiento: '+(latest.subject||latest.type||'interacción registrada')+'.':
    'No existe una interacción reciente registrada.';
  return {activities,latest,contact,problem,evidence,decision,missingText,situation};
}

function newestInboundMailForLead(data,lead){
  return (data.mail||[])
    .filter(row=>row.lead_id===lead.id&&row.status==='NEW')
    .sort((a,b)=>String(b.received_at||b.created_at||'').localeCompare(String(a.received_at||a.created_at||'')))[0]||null;
}

function recommendedMove(row){
  const contact=row.contact||null, institution=row.institution||null, lead=row.lead;
  const phone=contact?.phone||institution?.phone||'', email=contact?.email||institution?.email||'';
  if(row.newMail){
    return {
      channel:'Correo',
      reason:'Acaba de ingresar un correo del prospecto. Una respuesta entrante tiene prioridad temporal sobre el seguimiento planificado.',
      action:'Leer y responder: '+(row.newMail.subject||'correo recibido')
    };
  }
  const urgent=row.urgency?.label==='Alta';
  const advanced=row.maturity>=70;
  const contacted=['CONTACTED','QUALIFIED'].includes(lead.status);

  if(phone && (urgent||advanced||contacted)){
    return {
      channel:'Llamada',
      reason:urgent?'Hay una acción vencida o inmediata; conviene reducir latencia y obtener respuesta directa.':advanced?'La madurez comercial ya es alta; una conversación directa ayuda a destrabar el siguiente hito.':'Ya existe contacto previo; conviene confirmar interés y fijar el siguiente paso.',
      action:row.urgency?.next||'Llamar y acordar el siguiente paso'
    };
  }
  if(email){
    return {
      channel:'Correo',
      reason:row.evidence&& !row.evidence.startsWith('Sin evidencia')?'Hay evidencia comercial registrada; conviene enviar un mensaje breve y contextualizado con una llamada a la acción concreta.':'Existe correo de contacto, pero falta evidencia suficiente; conviene un primer contacto corto orientado a diagnóstico.',
      action:row.urgency?.next||'Enviar correo y fijar seguimiento'
    };
  }
  if(phone){
    return {
      channel:'Llamada',
      reason:'Hay teléfono disponible y todavía no existe un canal digital mejor documentado para este caso.',
      action:row.urgency?.next||'Llamar para identificar necesidad y decisor'
    };
  }
  return {
    channel:'Investigar',
    reason:'No hay teléfono ni correo de contacto registrados. Antes de intentar vender, completa el decisor y un canal verificable.',
    action:'Identificar contacto y canal verificable'
  };
}

function prospectRows(data,now){
  const institutions=data.institutions||[],tasks=data.tasks||[],scores=data.scores||[];
  return (data.leads||[]).filter(row=>!closedLead(row)).map(lead=>{
    const urgency=urgencyForLead(lead,tasks,now);
    const institution=institutions.find(row=>row.id===lead.institution_id);
    const maturity=safePct(lead.maturity_percent);
    const potential=potentialForLead(lead,scores);
    const story=leadStory(data,lead);
    const newMail=newestInboundMailForLead(data,lead);
    const base={lead,institution,urgency,maturity,potential,newMail,...story};
    return {...base,recommended:recommendedMove(base)};
  }).sort((a,b)=>Number(!!b.newMail)-Number(!!a.newMail)||b.urgency.rank-a.urgency.rank||(b.potential??-1)-(a.potential??-1)||b.maturity-a.maturity);
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
function matchesProspectSearch(row,query){
  const raw=String(query||'').trim();
  if(!raw)return true;
  const q=raw.toLowerCase();
  const name=row.institution?.name||row.lead.title||'';
  if(name.toLowerCase().includes(q))return true;
  const qId=normalizeProspectIdSearch(raw);
  if(!qId)return false;
  const fullId=normalizeProspectIdSearch(row.lead.id);
  const shortId=normalizeProspectIdSearch(prospectDisplayId(row.lead));
  return fullId.includes(qId)||shortId.includes(qId);
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

  return '<div class="seller-performance-dashboard">'+
    '<section class="seller-performance-hero"><div><small>MI RENDIMIENTO COMERCIAL</small><h1>Tu negocio, en una sola vista</h1><p>Inicio resume resultados y tendencia. Las acciones operativas se ejecutan en Mis tareas, Mi cartera y Mi agenda.</p></div>'+
    '<span class="seller-performance-period">'+now.toLocaleDateString('es-PE',{month:'long',year:'numeric'})+'</span></section>'+

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
    '</section>'+

    '<section class="seller-dashboard-shortcuts"><button type="button" data-page="tasks"><span>Mis tareas</span><small>Ejecutar acciones pendientes</small></button>'+
    '<button type="button" data-page="leads"><span>Mi cartera</span><small>Revisar prospectos y expedientes</small></button>'+
    '<button type="button" data-page="meetings"><span>Mi agenda</span><small>Ver reuniones y compromisos</small></button></section>'+
    (incomplete?'<p class="seller-dashboard-data-note">Hay módulos con información pendiente de carga. Los indicadores se calculan únicamente con los datos disponibles.</p>':'')+
  '</div>';
}

export function renderSellerDashboard(data,{now=new Date(),demo=false,failures={},searchQuery='',showSearch=false}={}){
  if(!showSearch)return sellerPerformanceDashboard(data,{now,demo,failures});
  const rows=prospectRows(data,now),tasks=data.tasks||[],meetings=data.meetings||[];
  const incomplete=Object.keys(failures).length>0;
  const openTasks=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
  const overdue=openTasks.filter(row=>row.due_at&&Date.parse(row.due_at)<now.getTime()).length;
  const searchedRows=String(searchQuery||'').trim()?rows.filter(row=>matchesProspectSearch(row,searchQuery)):rows;
  const selected=searchedRows[0]||null;
  const nextRows=searchedRows.slice(1,4);
  const restRows=searchedRows.slice(4);

  const narrative=incomplete?'Hay información pendiente de carga. Actualiza antes de priorizar.':
    !selected?(String(searchQuery||'').trim()?'No se encontraron prospectos con ese ID o nombre.':'No hay prospectos activos. Registra o asigna el siguiente prospecto.'):
    selected.newMail?'Correo nuevo: '+(selected.institution?.name||selected.lead.title)+'. '+(selected.newMail.subject||'Requiere respuesta')+'.':
    selected.urgency.label==='Alta'?'Prioridad: '+(selected.institution?.name||selected.lead.title)+'. '+selected.urgency.next+'.':
    'La cartera está bajo control. El siguiente movimiento con mayor impacto está en '+(selected.institution?.name||selected.lead.title)+'.';

  const todayAction=selected?'<section class="seller-today-command'+(selected.newMail?' inbound-mail':'')+'"><header><div><small>'+(selected.newMail?'CORREO NUEVO · HACER AHORA':'PRIORIDAD #1 · HACER AHORA')+'</small><h2>'+esc(selected.institution?.name||selected.lead.title)+'</h2><p>'+esc(selected.recommended.action)+'</p></div><span class="seller-channel">'+esc(selected.recommended.channel)+'</span></header>'+sellerQuickActions(selected)+'<div class="seller-today-context"><span><b>Por qué ahora</b>'+esc(selected.recommended.reason)+'</span><span><b>'+(selected.newMail?'Recibido':'Para avanzar')+'</b>'+esc(selected.newMail?compactDateTime(selected.newMail.received_at||selected.newMail.created_at):selected.missingText)+'</span></div><button class="seller-open-detail" data-lead-detail="'+esc(selected.lead.id)+'">Ver expediente completo →</button></section>':'';

  const focus=nextRows.length?'<section class="seller-priority-section"><div class="seller-section-heading"><small>SIGUIENTES 3</small><strong>La cola inmediata después de tu prioridad principal</strong></div><div class="seller-priority-stack">'+nextRows.map((row,index)=>{
    const lead=row.lead,name=row.institution?.name||lead.title;
    return '<article class="seller-priority-prospect secondary-focus">'+
      '<header><div><span class="seller-priority-rank">0'+(index+2)+'</span><div class="prospect-title-line"><h2>'+esc(name)+'</h2><span class="prospect-id">ID '+esc(prospectDisplayId(lead))+'</span></div></div><div class="seller-priority-status"><span class="seller-urgency '+row.urgency.tone+'">'+esc(row.urgency.label)+'</span></div></header>'+
      renderProspectProgress(lead,row.maturity)+
      '<footer class="prospect-action-footer"><div class="prospect-action-flow">'+
        '<section class="prospect-action-col"><small>ÚLTIMA ACCIÓN</small><strong>'+esc(row.latest?.subject||row.latest?.type||'Sin acción registrada')+'</strong><span>'+esc(compactDateTime(row.latest?.occurred_at))+'</span></section>'+
        '<span class="prospect-action-divider" aria-hidden="true"></span>'+
        '<section class="prospect-action-col"><small>SIGUIENTE ACCIÓN</small><strong>'+esc(row.urgency.next||'Por definir')+'</strong><span>'+esc(row.urgency.date?compactDateTime(row.urgency.date):'Por definir')+'</span></section>'+
      '</div>'+sellerQuickActions(row)+'<button class="seller-open-detail" data-lead-detail="'+esc(lead.id)+'">Ver expediente →</button></footer>'+
    '</article>';
  }).join('')+'</div></section>':'';

  const cards=restRows.length?restRows.map(row=>{
    const name=row.institution?.name||row.lead.title;
    const potential=row.potential===null?'Potencial pendiente':row.potential+'% potencial';
    return '<article class="seller-candidate-card operational compact">'+
      '<header><div><span class="seller-candidate-kicker">PROSPECTO</span><h3>'+esc(name)+'</h3></div><span class="seller-urgency '+row.urgency.tone+'">'+esc(row.urgency.label)+'</span></header>'+
      '<div class="seller-candidate-meta"><span><b>'+row.maturity+'%</b><small>Madurez</small></span><span><b>'+esc(potential)+'</b><small>Potencial</small></span></div>'+
      '<p class="seller-candidate-next"><b>Siguiente:</b> '+esc(row.urgency.next)+(row.urgency.date?' · '+esc(compactDate(row.urgency.date)):'')+'</p>'+
      sellerQuickActions(row,{compact:true})+
      '<button type="button" class="seller-open-detail" data-lead-detail="'+esc(row.lead.id)+'">Ver expediente →</button>'+
    '</article>';
  }).join(''):'';

  const searchBox=showSearch?'<section class="commercial-search"><div class="commercial-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="commercialSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar por ID o nombre…" value="'+esc(searchQuery)+'" aria-label="Buscar prospecto por ID o nombre"></div><small>'+searchedRows.length+' resultado'+(searchedRows.length===1?'':'s')+'</small></section>':'';

  const restSection=restRows.length?'<details class="seller-prospects-panel seller-prospects-panel--cards seller-secondary-list"><summary>Resto de mi cartera <span>'+restRows.length+'</span></summary><div class="seller-candidate-list">'+cards+'</div></details>':'';

  return '<div class="seller-story-dashboard">'+
    '<section class="seller-command-summary"><span>PRIORIDAD DIARIA</span><strong>'+esc(narrative)+'</strong></section>'+
    searchBox+
    todayAction+
    focus+
    restSection+
    '</div>';
}
