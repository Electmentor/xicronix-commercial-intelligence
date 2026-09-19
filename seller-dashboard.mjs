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

function prospectRows(data,now){
  const institutions=data.institutions||[],tasks=data.tasks||[],scores=data.scores||[];
  return (data.leads||[]).filter(row=>!closedLead(row)).map(lead=>{
    const urgency=urgencyForLead(lead,tasks,now);
    const institution=institutions.find(row=>row.id===lead.institution_id);
    const maturity=safePct(lead.maturity_percent);
    const potential=potentialForLead(lead,scores);
    return {lead,institution,urgency,maturity,potential};
  }).sort((a,b)=>b.urgency.rank-a.urgency.rank||b.maturity-a.maturity||(b.potential??-1)-(a.potential??-1));
}

function timelineForLead(data,lead){
  return (data.activities||[]).filter(row=>row.lead_id===lead.id).sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||''))).slice(0,4);
}

function compactDate(value){
  if(!value)return 'Sin fecha';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'Sin fecha';
  return d.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'});
}

export function renderSellerDashboard(data,{now=new Date(),demo=false,failures={}}={}){
  const rows=prospectRows(data,now),tasks=data.tasks||[],meetings=data.meetings||[];
  const incomplete=Object.keys(failures).length>0;
  const openTasks=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
  const overdue=openTasks.filter(row=>row.due_at&&Date.parse(row.due_at)<now.getTime()).length;
  const upcomingMeetings=meetings.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=now.getTime()).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
  const selected=rows[0]||null;
  const narrative=incomplete?'Hay información pendiente de carga. Actualiza antes de priorizar.':
    !selected?'No hay prospectos activos. Registra o asigna el siguiente prospecto.':
    selected.urgency.label==='Alta'?'Tu prioridad inmediata es '+(selected.institution?.name||selected.lead.title)+'. '+selected.urgency.next+'.':
    'Tu cartera está bajo control. La mejor siguiente acción está en '+(selected.institution?.name||selected.lead.title)+'.';

  const kpi=(label,value,detail,tone='')=>'<article class="seller-story-kpi '+tone+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></article>';
  const highPotential=rows.filter(row=>(row.potential??0)>=75).length;
  const negotiation=rows.filter(row=>row.maturity>=70).length;
  const kpis=kpi('Prospectos activos',String(rows.length),highPotential+' con potencial alto')+
    kpi('Requieren atención',String(rows.filter(row=>row.urgency.label==='Alta').length),overdue+' tareas vencidas','warning')+
    kpi('Avance alto',String(negotiation), '70% o más de madurez')+
    kpi('Próxima reunión',upcomingMeetings[0]?compactDate(upcomingMeetings[0].start_at):'—',upcomingMeetings[0]?.title||'Sin reunión próxima');

  const bars=rows.length?rows.map(row=>{
    const name=row.institution?.name||row.lead.title;
    const stage=milestoneLabel(row.lead.commercial_milestone);
    return '<button class="seller-prospect-row" data-lead-detail="'+esc(row.lead.id)+'" aria-label="Abrir expediente comercial de '+esc(name)+'">'+
      '<span class="seller-prospect-main"><strong>'+esc(name)+'</strong><small>'+esc(stage)+' · '+esc(row.urgency.label)+'</small></span>'+
      '<span class="seller-progress-track" aria-hidden="true"><i style="width:'+row.maturity+'%"></i></span>'+
      '<b>'+row.maturity+'%</b><span class="seller-urgency '+row.urgency.tone+'">'+esc(row.urgency.label)+'</span><span aria-hidden="true">›</span></button>';
  }).join(''):'<div class="seller-story-empty">No hay prospectos activos en tu cartera.</div>';

  let focus='';
  if(selected){
    const lead=selected.lead,name=selected.institution?.name||lead.title;
    const events=timelineForLead(data,lead);
    const last=events[0];
    focus='<article class="seller-focus-card">'+
      '<header><div><small>PROSPECTO PRIORITARIO</small><h2>'+esc(name)+'</h2><p>'+esc(milestoneLabel(lead.commercial_milestone))+' · '+selected.maturity+'% de madurez</p></div><button class="primary" data-lead-detail="'+esc(lead.id)+'">Abrir expediente comercial</button></header>'+
      '<div class="seller-situation-grid"><section><small>Situación</small><strong>'+esc(last?.subject||'Sin movimiento reciente')+'</strong><p>'+esc(last?.notes||last?.need_summary||'Aún no hay suficiente actividad registrada para resumir la última interacción.')+'</p></section>'+
      '<section><small>Acción</small><strong>'+esc(selected.urgency.next)+'</strong><p>'+esc(selected.urgency.date?'Fecha clave: '+compactDate(selected.urgency.date):'Aún no hay fecha comprometida.')+'</p></section>'+
      '<section><small>Potencial</small><strong>'+(selected.potential===null?'Pendiente':selected.potential+'%')+'</strong><p>'+esc(lead.estimated_value?money(lead.estimated_value):'Valor económico aún no definido')+'</p></section></div>'+
      '<div class="seller-timeline"><h3>Últimos movimientos</h3>'+(events.length?events.map((event,index)=>'<div class="seller-timeline-item '+(index===0?'current':'')+'"><i></i><span><strong>'+esc(event.subject||event.type||'Movimiento')+'</strong><small>'+esc(compactDate(event.occurred_at))+'</small></span></div>').join(''):'<p>Sin movimientos registrados.</p>')+'</div></article>';
  }

  return '<div class="seller-story-dashboard">'+
    '<section class="seller-story-hero"><div><small>'+(demo?'DEMOSTRACIÓN':'MI DASHBOARD COMERCIAL')+'</small><h1>Qué está pasando y qué hacer ahora</h1><p>'+esc(narrative)+'</p></div><button data-page="leads">Ver toda mi cartera</button></section>'+
    '<section class="seller-story-kpis">'+kpis+'</section>'+
    '<section class="seller-story-grid"><article class="seller-prospects-panel"><header><div><small>RADIOGRAFÍA DE CARTERA</small><h2>Mis prospectos y avance comercial</h2></div><span>Ordenados por prioridad</span></header><div class="seller-prospect-list">'+bars+'</div></article>'+focus+'</section>'+
    '</div>';
}
