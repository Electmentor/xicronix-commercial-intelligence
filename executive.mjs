import {escapeHTML as esc, money} from './domain.mjs';
import {assignedUserId} from './workspace.mjs';
import {businessMonthRange as monthRange, businessDay} from './analytics.mjs';
import {renderAnalytics} from './analytics-view.mjs';
const closed=row=>['WON','LOST'].includes(row.stage);
const amount=row=>Number(row.value)||0;
export const margin=row=>row.estimated_cost===null||row.estimated_cost===undefined||row.estimated_cost===''?null:amount(row)-Number(row.estimated_cost);
export function compactMoney(value){
 if(value===null||value===undefined)return '—';
 const magnitude=Math.abs(value),unit=magnitude>=1e6?1e6:magnitude>=1e3?1e3:1;
 return 'S/ '+(value/unit).toLocaleString('es-PE',{maximumFractionDigits:unit===1?0:1})+(unit===1e6?' M':unit===1e3?' mil':'');
}
function inPeriod(row,period){return !!row.expected_close_date&&row.expected_close_date>=period.start&&row.expected_close_date<=period.end;}
function goalFor(goals,userId,period){
 return goals.filter(row=>(row.owner_user_id||null)===userId&&row.period_start<=period.start&&row.period_end>=period.end).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]||null;
}
export function executiveMetrics(data,now=new Date()){
 const period=monthRange(now),opps=data.opportunities||[],leads=data.leads||[],tasks=data.tasks||[];
 const open=opps.filter(row=>!closed(row)),won=opps.filter(row=>row.stage==='WON'&&inPeriod(row,{...period,end:businessDay(now)}));
 const known=won.filter(row=>margin(row)!==null),revenue=won.reduce((sum,row)=>sum+amount(row),0);
 const knownRevenue=known.reduce((sum,row)=>sum+amount(row),0),grossMargin=known.length?known.reduce((sum,row)=>sum+margin(row),0):null;
 const overdue=open.filter(row=>row.next_action_date&&Date.parse(row.next_action_date)<now.getTime());
 const atRisk=open.filter(row=>overdue.includes(row)||(margin(row)!==null&&amount(row)>0&&margin(row)/amount(row)<.15));
 const goal=goalFor(data.goals||[],null,period),target=goal?Number(goal.target_won_value)||0:null;
 const pipeline=open.reduce((sum,row)=>sum+amount(row),0);
 const forecast=revenue+open.filter(row=>inPeriod(row,period)).reduce((sum,row)=>sum+amount(row)*Math.min(100,Math.max(0,Number(row.probability)||0))/100,0);
 const team=(data.users||[]).filter(row=>['SALES','MANAGER'].includes(row.role)).map(user=>{
  const own=won.filter(row=>assignedUserId(row)===user.id),known=own.filter(row=>margin(row)!==null);
  const sales=own.reduce((sum,row)=>sum+amount(row),0),personalGoal=goalFor(data.goals||[],user.id,period),target=personalGoal?Number(personalGoal.target_won_value)||0:null;
  return {user,sales,margin:known.length?known.reduce((sum,row)=>sum+margin(row),0):null,unknownCost:own.length-known.length,target,attainment:target>0?sales/target*100:null,leads:leads.filter(row=>assignedUserId(row)===user.id).length};
 }).sort((a,b)=>(b.attainment??-1)-(a.attainment??-1)||b.sales-a.sales);
 const decisions=[];
 for(const row of open){
  const overdueDays=row.next_action_date?Math.max(0,Math.ceil((now-Date.parse(row.next_action_date))/86400000)):0;
  const profit=margin(row),percent=amount(row)>0&&profit!==null?profit/amount(row)*100:null;
  if(percent!==null&&percent<15)decisions.push({id:row.id,table:'opportunities',severity:3,exposure:amount(row),title:percent<0?'Evitar una venta con pérdida':'Proteger el margen',detail:row.name,reason:'Margen estimado '+Math.round(percent)+'%. Revisar costo y alcance antes de negociar.',action:'Revisar margen',tone:'red'});
  else if(overdueDays)decisions.push({id:row.id,table:'opportunities',severity:2,exposure:amount(row),title:'Destrabar un cierre',detail:row.name,reason:overdueDays+' días sin cumplir el seguimiento. Contactar al decisor y fijar el siguiente paso.',action:'Revisar seguimiento',tone:'amber'});
  else if(profit===null)decisions.push({id:row.id,table:'opportunities',severity:1,exposure:amount(row),title:'Completar el costo',detail:row.name,reason:'Sin costo no se puede valorar la rentabilidad de esta oportunidad.',action:'Completar costo',tone:'blue'});
 }
 for(const lead of leads.filter(row=>!['CONVERTED','DISQUALIFIED'].includes(row.status))){
  const score=(data.scores||[]).find(row=>row.lead_id===lead.id)?.total_score||0;
  if(score>=75&&(!lead.next_action||!lead.next_action_date))decisions.push({id:lead.id,table:'leads',severity:1,exposure:Number(lead.estimated_value)||0,title:'Activar un prospecto de alto potencial',detail:lead.title,reason:score+'% de potencial y seguimiento incompleto. Definir responsable y fecha.',action:'Planificar contacto',tone:'blue'});
 }
 decisions.sort((a,b)=>b.severity-a.severity||b.exposure-a.exposure);
 const stages=[['Detección',['DETECTED','CONTACT_PENDING','CONTACTED']],['Calificación',['QUALIFIED','OPPORTUNITY']],['Propuesta',['PROPOSAL']],['Negociación',['NEGOTIATION']],['Ganadas · mes',['WON']]].map(([label,keys])=>{
  const rows=keys[0]==='WON'?won:open.filter(row=>keys.includes(row.stage));
  return {label,count:rows.length,value:rows.reduce((sum,row)=>sum+amount(row),0)};
 });
 return {period,revenue,grossMargin,marginPercent:knownRevenue?grossMargin/knownRevenue*100:null,unknownCosts:won.length-known.length,goal,target,attainment:target>0?revenue/target*100:null,gap:target===null?null:Math.max(0,target-revenue),pipeline,forecast,overdue,atRisk,riskValue:atRisk.reduce((sum,row)=>sum+amount(row),0),team,decisions:decisions.slice(0,3),stages,openCount:open.length,wonCount:won.length,undated:opps.filter(row=>!row.expected_close_date).length,overdueTasks:tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.due_at)<now.getTime()).length};
}
export function filterExecutiveRows(rows,table,filter,owner,now=new Date()){
 if(owner)rows=rows.filter(row=>assignedUserId(row)===owner);
 if(table==='opportunities'&&filter){
  const period=monthRange(now);
  if(filter==='won')rows=rows.filter(row=>row.stage==='WON'&&inPeriod(row,{...period,end:businessDay(now)}));
  if(filter==='pipeline')rows=rows.filter(row=>!closed(row));
  if(filter==='risk')rows=rows.filter(row=>!closed(row)&&((row.next_action_date&&Date.parse(row.next_action_date)<now.getTime())||(margin(row)!==null&&amount(row)>0&&margin(row)/amount(row)<.15)));
 }
 return rows;
}
export function renderExecutive(data,{now=new Date(),demo=false,failures={},analyticsPeriod='year'}={}){
 const m=executiveMetrics(data,now),incomplete=Object.keys(failures).length>0;
 const institutions=data.institutions||[];
 const prospects=data.prospects||[];
 const leads=data.leads||[];
 const opportunities=data.opportunities||[];
 const tasks=data.tasks||[];
 const activeLeads=leads.filter(row=>!['DISQUALIFIED','CONVERTED'].includes(row.status));
 const openOpps=opportunities.filter(row=>!closed(row));
 const actionNow=prospects.filter(row=>row.operating_bucket==='ACTION_NOW');
 const reviewFirst=prospects.filter(row=>row.operating_bucket==='RESEARCH_FIRST'||row.operating_bucket==='REVALIDATE');
 const highPriority=actionNow.length+m.atRisk.length;
 const focus=actionNow[0]||prospects.find(row=>row.xwin_band==='HIGH'||row.xwin_band==='VERY_HIGH')||null;
 const overdueTasks=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&row.due_at&&Date.parse(row.due_at)<now.getTime());
 const latestActivities=(data.activities||[]).slice().sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||''))).slice(0,4);
 const stageDefs=[
  ['Lead',activeLeads.length,'#2f7de1'],
  ['Contacto',activeLeads.filter(row=>['CONTACTED','QUALIFIED'].includes(row.status)).length,'#5aa7ec'],
  ['Diagnóstico',openOpps.filter(row=>['DETECTED','CONTACT_PENDING','CONTACTED','QUALIFIED','OPPORTUNITY'].includes(row.stage)).length,'#f47b20'],
  ['Propuesta',openOpps.filter(row=>row.stage==='PROPOSAL').length,'#f3b33d'],
  ['Negociación',openOpps.filter(row=>row.stage==='NEGOTIATION').length,'#36a77a']
 ];
 const stageMax=Math.max(1,...stageDefs.map(row=>row[1]));
 const pipeline=stageDefs.map(([label,count,color],index)=>'<button class="ci-stage" data-page="'+(index<2?'leads':'opportunities')+'" style="--ci-stage:'+color+';--ci-width:'+Math.max(18,count/stageMax*100)+'%"><small>'+label+'</small><strong>'+count+'</strong></button>').join('');
 const priorityRows=(actionNow.length?actionNow:prospects.slice(0,6)).slice(0,6);
 const priorityList=priorityRows.length?priorityRows.map(row=>{
  const xwin=row.xwin_score??row.xwin??null;
  const xpps=row.xpps_score??row.potential_score??null;
  const state=row.operating_bucket==='ACTION_NOW'?'Acción ahora':row.operating_bucket==='RESEARCH_FIRST'?'Investigar':row.operating_bucket==='STRATEGIC_WATCH'?'Vigilancia':'Revisión';
  return '<button class="ci-prospect-row" data-page="prospects"><span><strong>'+esc(row.name||row.canonical_name||'Institución')+'</strong><small>'+esc(row.district||row.city||row.department||'Institución educativa')+'</small></span><em>'+esc(state)+'</em><b>'+(xwin===null?'—':Math.round(Number(xwin)))+'</b><i aria-hidden="true">›</i></button>';
 }).join(''):'<div class="ci-empty">No hay prospectos priorizados en esta vista.</div>';
 const focusName=focus?.name||focus?.canonical_name||'Sin selección prioritaria';
 const focusXwin=focus?.xwin_score??focus?.xwin??null;
 const focusXpps=focus?.xpps_score??focus?.potential_score??null;
 const focusAction=focus?.next_action||focus?.operating_recommendation||'Revisar evidencia y definir la siguiente acción comercial.';
 const focusState=focus?.operating_bucket==='ACTION_NOW'?'Alta prioridad':focus?.operating_bucket==='RESEARCH_FIRST'?'En investigación':focus?.operating_bucket==='STRATEGIC_WATCH'?'Vigilancia estratégica':'En revisión';
 const alerts=[
  ...(m.atRisk.slice(0,2).map(row=>({tone:'danger',title:'Oportunidad requiere atención',detail:row.name||'Oportunidad',page:'opportunities'}))),
  ...(overdueTasks.slice(0,2).map(row=>({tone:'warning',title:'Seguimiento vencido',detail:row.title||'Tarea pendiente',page:'tasks'}))),
  ...(latestActivities.slice(0,2).map(row=>({tone:'info',title:'Movimiento reciente',detail:row.subject||row.type||'Actividad comercial',page:'activities'})))
 ].slice(0,4);
 const alertList=alerts.length?alerts.map(item=>'<button class="ci-alert" data-page="'+item.page+'"><span class="'+item.tone+'"></span><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></div><i aria-hidden="true">›</i></button>').join(''):'<div class="ci-empty">Sin alertas críticas registradas.</div>';
 const statusText=incomplete?'Hay módulos incompletos; actualiza antes de decidir.':highPriority?'Hay '+highPriority+' elemento'+(highPriority===1?'':'s')+' que merece'+(highPriority===1?'':'n')+' atención.':'La operación comercial está bajo control.';
 return '<div class="ci-dashboard">'+
  '<section class="ci-hero"><div><small>'+(demo?'DEMOSTRACIÓN':'XICRONIX COMMERCIAL INTELLIGENCE')+'</small><h2>Resumen comercial</h2><p>'+esc(statusText)+'</p></div><div class="ci-hero-meta"><span>'+esc(now.toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}))+'</span><button id="ceoMethodBtn" type="button">Cómo se calcula</button></div></section>'+
  '<section class="ci-kpis" aria-label="Indicadores principales">'+
   '<button class="ci-kpi blue" data-page="prospects"><span class="ci-kpi-icon">◉</span><small>Prospectos</small><strong>'+prospects.length+'</strong><em>'+activeLeads.length+' leads activos</em></button>'+
   '<button class="ci-kpi orange" data-page="opportunities"><span class="ci-kpi-icon">▽</span><small>Oportunidades</small><strong>'+openOpps.length+'</strong><em>'+compactMoney(m.pipeline)+' en cartera</em></button>'+
   '<button class="ci-kpi red" data-page="prospects"><span class="ci-kpi-icon">!</span><small>Alta prioridad</small><strong>'+highPriority+'</strong><em>'+actionNow.length+' listas para acción</em></button>'+
   '<button class="ci-kpi violet" data-page="prospects"><span class="ci-kpi-icon">▣</span><small>En revisión</small><strong>'+reviewFirst.length+'</strong><em>evidencia por completar</em></button>'+
  '</section>'+
  '<section class="ci-pipeline-panel"><header><div><small>PIPELINE</small><h3>Pipeline de oportunidades</h3></div><button data-page="opportunities">Ver pipeline completo →</button></header><div class="ci-pipeline">'+pipeline+'</div></section>'+
  '<section class="ci-main-grid">'+
   '<article class="ci-prospect-panel"><header><div><small>INSTITUCIONES / PROSPECTOS</small><h3>Prioridades comerciales</h3></div><button data-page="prospects">Ver todos →</button></header><div class="ci-prospect-head"><span>Institución</span><span>Estado</span><span>XWIN</span><span></span></div><div class="ci-prospect-list">'+priorityList+'</div></article>'+
   '<article class="ci-focus-panel"><header><div><small>FOCO INTELIGENTE</small><h3>'+esc(focusName)+'</h3><p>'+esc(focusState)+'</p></div><button data-page="prospects">Ver ficha →</button></header>'+
    '<div class="ci-score-grid"><section><small>XWIN</small><strong>'+(focusXwin===null?'—':Math.round(Number(focusXwin)))+'</strong><span>Probabilidad comercial</span></section><section><small>XPPS</small><strong>'+(focusXpps===null?'—':Math.round(Number(focusXpps)))+'</strong><span>Potencial estructural</span></section></div>'+
    '<div class="ci-focus-action"><small>Próxima acción</small><p>'+esc(focusAction)+'</p></div>'+
    '<div class="ci-focus-meta"><span><small>Estado</small><b>'+esc(focusState)+'</b></span><span><small>Fuente</small><b>'+(demo?'Demo':'Datos reales')+'</b></span></div>'+
   '</article>'+
   '<article class="ci-alert-panel"><header><div><small>ALERTAS Y SEGUIMIENTO</small><h3>Qué requiere atención</h3></div><button data-page="tasks">Ver todas →</button></header><div class="ci-alert-list">'+alertList+'</div></article>'+
  '</section>'+
  '<section class="ci-benefits"><span><b>Priorización</b><small>Enfoca esfuerzo donde importa.</small></span><span><b>Trazabilidad</b><small>Historial para decidir mejor.</small></span><span><b>Inteligencia</b><small>XPPS + XWIN explicables.</small></span><span><b>Acción comercial</b><small>Del análisis al siguiente paso.</small></span></section>'+
 '</div>';
}
export const EXECUTIVE_METHOD = 'Ventas ganadas: oportunidades WON cuya fecha de cierre prevista está en el mes actual; no son cobros. Margen: valor menos costo informado, admite pérdidas; sin costo no se estima. Meta: objetivo que cubre el mes completo. Proyección: ganadas del mes más cartera con cierre previsto en el mes ponderada por probabilidad manual, no es una garantía. Riesgo: oportunidades abiertas con seguimiento vencido o margen inferior al 15%; no se cuenta dos veces una oportunidad. Prioridades: primero margen bajo, luego atrasos, luego datos pendientes; dentro de cada grupo se ordena por importe. Son reglas explicables, no IA generativa. El ranking compara cumplimiento de metas de ventas, no liquida bonos. Los datos de demostración nunca se mezclan con datos reales.';

