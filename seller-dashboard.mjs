import {escapeHTML as esc, money, taskUrgency, sortTasksByUrgency} from './domain.mjs';
import {milestoneLabel} from './commercial-core.mjs';

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

function prospectRows(data,now){
  const institutions=data.institutions||[],tasks=data.tasks||[],scores=data.scores||[];
  return (data.leads||[]).filter(row=>!closedLead(row)).map(lead=>{
    const urgency=urgencyForLead(lead,tasks,now);
    const institution=institutions.find(row=>row.id===lead.institution_id);
    const maturity=safePct(lead.maturity_percent);
    const potential=potentialForLead(lead,scores);
    const story=leadStory(data,lead);
    return {lead,institution,urgency,maturity,potential,...story};
  }).sort((a,b)=>b.urgency.rank-a.urgency.rank||(b.potential??-1)-(a.potential??-1)||b.maturity-a.maturity);
}

export function renderSellerDashboard(data,{now=new Date(),demo=false,failures={}}={}){
  const rows=prospectRows(data,now),tasks=data.tasks||[],meetings=data.meetings||[];
  const incomplete=Object.keys(failures).length>0;
  const openTasks=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
  const overdue=openTasks.filter(row=>row.due_at&&Date.parse(row.due_at)<now.getTime()).length;
  const upcomingMeetings=meetings.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=now.getTime()).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
  const selected=rows[0]||null;
  const attention=rows.filter(row=>row.urgency.label==='Alta').length;
  const highPotential=rows.filter(row=>(row.potential??0)>=75).length;
  const negotiation=rows.filter(row=>row.maturity>=70).length;

  const narrative=incomplete?'Hay información pendiente de carga. Actualiza antes de priorizar.':
    !selected?'No hay prospectos activos. Registra o asigna el siguiente prospecto.':
    selected.urgency.label==='Alta'?'Prioridad: '+(selected.institution?.name||selected.lead.title)+'. '+selected.urgency.next+'.':
    'La cartera está bajo control. El siguiente movimiento con mayor impacto está en '+(selected.institution?.name||selected.lead.title)+'.';

  const kpi=(key,label,value,detail,tone='')=>'<button type="button" class="seller-story-kpi '+tone+'" data-seller-filter="'+key+'" aria-label="'+esc(label)+': '+esc(value)+'. Abrir cartera filtrada"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span><em>Ver cartera →</em></button>';
  const kpis=kpi('active','Prospectos activos',String(rows.length),highPotential+' con potencial alto')+
    kpi('action','Requieren acción',String(attention),overdue+' tareas vencidas','warning')+
    kpi('mature','Madurez alta',String(negotiation),'70% o más de madurez')+
    kpi('meeting','Próxima reunión',upcomingMeetings[0]?compactDate(upcomingMeetings[0].start_at):'—',upcomingMeetings[0]?.title||'Sin reunión próxima');

  const cards=rows.length?rows.map(row=>{
    const name=row.institution?.name||row.lead.title;
    const potential=row.potential===null?'Potencial pendiente':row.potential+'% potencial';
    return '<button class="seller-candidate-card" data-lead-detail="'+esc(row.lead.id)+'" aria-label="Abrir expediente comercial de '+esc(name)+'">'+
      '<header><div><span class="seller-candidate-kicker">PROSPECTO</span><h3>'+esc(name)+'</h3></div><span class="seller-urgency '+row.urgency.tone+'">'+esc(row.urgency.label)+'</span></header>'+
      '<p class="seller-candidate-problem"><b>Problema:</b> '+esc(row.problem)+'</p>'+
      '<div class="seller-candidate-meta"><span><b>'+row.maturity+'%</b><small>Madurez</small></span><span><b>'+esc(potential)+'</b><small>Calidad comercial</small></span></div>'+
      '<p class="seller-candidate-next"><b>Siguiente:</b> '+esc(row.urgency.next)+(row.urgency.date?' · '+esc(compactDate(row.urgency.date)):'')+'</p>'+
      '<small class="seller-candidate-evidence">'+esc(row.evidence)+'</small>'+
    '</button>';
  }).join(''):'<div class="seller-story-empty">No hay prospectos activos en tu cartera.</div>';

  const priorityRows=rows.slice(0,2);
  const focus=priorityRows.length?'<section class="seller-priority-section"><header><div><small>PROSPECTOS QUE REQUIEREN ATENCIÓN AHORA</small><h2>¿A quién atender primero y qué hacer?</h2></div><span>'+priorityRows.length+' en foco</span></header><div class="seller-priority-stack">'+priorityRows.map((row,index)=>{
    const lead=row.lead,name=row.institution?.name||lead.title,last=row.latest;
    const why=row.urgency.label==='Alta'
      ?'La acción está vencida o requiere atención inmediata.'
      :row.evidence!=='Sin evidencia comercial explícita registrada.'
        ?'Existe evidencia suficiente para mantener este prospecto en foco.'
        :'Aún falta información clave antes de avanzar.';
    return '<article class="seller-priority-prospect '+(index===0?'primary-focus':'secondary-focus')+'">'+
      '<header><div><span class="seller-priority-rank">0'+(index+1)+'</span><div><small>PROSPECTO PRIORITARIO</small><h2>'+esc(name)+'</h2><p>'+esc(milestoneLabel(lead.commercial_milestone))+' · '+row.maturity+'% de madurez</p></div></div><span class="seller-urgency '+row.urgency.tone+'">'+esc(row.urgency.label)+'</span></header>'+
      '<div class="seller-priority-grid">'+
        '<section><small>SITUACIÓN ACTUAL</small><strong>'+esc(row.situation)+'</strong><p>'+esc(last?'Último movimiento: '+compactDate(last.occurred_at):'Sin interacción reciente')+'</p></section>'+
        '<section><small>QUÉ FALTA</small><strong>'+esc(row.missingText)+'</strong><p>'+(row.contact?esc('Contacto: '+([row.contact.first_name,row.contact.last_name].filter(Boolean).join(' ')||row.contact.job_title||'registrado')):'Sin contacto identificado')+'</p></section>'+
        '<section class="action-box"><small>SIGUIENTE ACCIÓN</small><strong>'+esc(row.urgency.next)+'</strong><p>'+esc(row.urgency.date?'Fecha clave: '+compactDate(row.urgency.date):'Sin fecha comprometida')+'</p></section>'+
        '<section><small>POR QUÉ IMPORTA</small><strong>'+esc(why)+'</strong><p>'+(row.potential===null?'Potencial pendiente':row.potential+'% potencial')+' · '+esc(row.decision)+'</p></section>'+
      '</div>'+
      '<footer><div><small>Problema detectado</small><strong>'+esc(row.problem)+'</strong></div><button class="primary" data-lead-detail="'+esc(lead.id)+'">Abrir expediente</button></footer>'+
    '</article>';
  }).join('')+'</div></section>':'<div class="seller-story-empty">No hay prospectos activos en tu cartera.</div>';

  const priorityStory=selected?'<div class="seller-priority-story">'+
    '<p><small>SITUACIÓN ACTUAL</small><strong>'+esc(selected.situation)+'</strong></p>'+
    '<p><small>QUÉ FALTA</small><strong>'+esc(selected.missingText)+'</strong></p>'+
    '<p><small>SIGUIENTE ACCIÓN</small><strong>'+esc(selected.urgency.next)+(selected.urgency.date?' · '+esc(compactDate(selected.urgency.date)):'')+'</strong></p>'+
    '</div>':'';
  return '<div class="seller-story-dashboard">'+
    '<section class="seller-story-hero"><div><small>'+(demo?'DEMOSTRACIÓN':'MI DASHBOARD COMERCIAL')+'</small><h1>Qué está pasando y qué hacer ahora</h1><p>'+esc(narrative)+'</p>'+priorityStory+'</div><button data-page="leads">Ver toda mi cartera</button></section>'+
    '<section class="seller-story-kpis">'+kpis+'</section>'+
    focus+
    '<details class="seller-prospects-panel seller-prospects-panel--cards seller-secondary-list"><summary>Ver otros prospectos de mi cartera</summary><div class="seller-candidate-list">'+cards+'</div></details>'+
    '</div>';
}
