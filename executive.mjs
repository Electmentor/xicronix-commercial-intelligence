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
 const period=monthRange(now),opps=data.opportunities||[],leads=data.leads||[],tasks=data.tasks||[],meetings=data.meetings||[];
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
  const openOwn=open.filter(row=>assignedUserId(row)===user.id);
  const activeLeads=leads.filter(row=>assignedUserId(row)===user.id&&!['CONVERTED','DISQUALIFIED'].includes(row.status));
  const overdueOwnTasks=tasks.filter(row=>assignedUserId(row)===user.id&&!['COMPLETED','CANCELLED'].includes(row.status)&&row.due_at&&Date.parse(row.due_at)<now.getTime());
  const nextMeetings=meetings.filter(row=>assignedUserId(row)===user.id&&!['COMPLETED','CANCELLED'].includes(row.status)&&row.start_at&&Date.parse(row.start_at)>=now.getTime());
  const riskOwn=openOwn.filter(row=>(row.next_action_date&&Date.parse(row.next_action_date)<now.getTime())||(margin(row)!==null&&amount(row)>0&&margin(row)/amount(row)<.15));
  return {user,sales,margin:known.length?known.reduce((sum,row)=>sum+margin(row),0):null,unknownCost:own.length-known.length,target,attainment:target>0?sales/target*100:null,leads:activeLeads.length,openCount:openOwn.length,openValue:openOwn.reduce((sum,row)=>sum+amount(row),0),overdueTasks:overdueOwnTasks.length,nextMeetings:nextMeetings.length,riskCount:riskOwn.length};
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
 return {period,revenue,grossMargin,marginPercent:knownRevenue?grossMargin/knownRevenue*100:null,unknownCosts:won.length-known.length,goal,target,attainment:target>0?revenue/target*100:null,gap:target===null?null:Math.max(0,target-revenue),pipeline,forecast,overdue,atRisk,riskValue:atRisk.reduce((sum,row)=>sum+amount(row),0),team,decisions:decisions.slice(0,5),stages,openCount:open.length,wonCount:won.length,undated:opps.filter(row=>!row.expected_close_date).length,overdueTasks:tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.due_at)<now.getTime()).length};
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
 const progress=m.attainment===null?'Sin meta':Math.round(m.attainment)+'% de la meta';
 const radar=(data.radar||[]).filter(row=>!['DISCARD'].includes(row.classification));
 const radarCritical=radar.filter(row=>row.classification==='CRITICAL');
 const radarHigh=radar.filter(row=>row.classification==='HIGH');
 const topSignal=radar.slice().sort((a,b)=>Number(b.weighted_score||0)-Number(a.weighted_score||0))[0]||null;
 const openOpportunities=(data.opportunities||[]).filter(row=>!closed(row));
 const prospects=data.prospects||[];
 const actionNow=prospects.filter(row=>row.operating_bucket==='ACTION_NOW');
 const reviewFirst=prospects.filter(row=>row.operating_bucket==='RESEARCH_FIRST'||row.operating_bucket==='REVALIDATE');
 const topHighPriority=actionNow.length||radarCritical.length+radarHigh.length;
 const strongestOpportunity=openOpportunities.slice().sort((a,b)=>amount(b)-amount(a))[0]||null;
 const headline=incomplete?'Datos incompletos: actualiza antes de decidir.':
   radarCritical.length?radarCritical.length+' señal(es) crítica(s) requieren revisión ejecutiva.':
   m.atRisk.length?m.atRisk.length+' oportunidad(es) presentan riesgo operativo o de margen.':
   m.target===null?'Define la meta para orientar al equipo.':
   m.attainment>=100?'Meta alcanzada. Protege el margen del siguiente cierre.':'Faltan '+compactMoney(m.gap)+' para alcanzar la meta.';
 const kpi=(label,value,hint,view,tone='')=>'<button class="ceo-kpi '+tone+'" data-ceo-view="'+view+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+esc(hint)+'</small></button>';
 const statusTitle=incomplete?'INFORMACIÓN PARCIAL':demo?'ESCENARIO SIMULADO':'LECTURA EJECUTIVA';
 const storyItems=incomplete?[
  {label:'SITUACIÓN',text:'Hay módulos incompletos; actualiza antes de interpretar el desempeño.',action:'Actualizar antes de decidir',target:'dashboard'}
 ]:[
  {label:'SITUACIÓN',text:m.pipeline>0?'La cartera abierta suma '+compactMoney(m.pipeline)+' en '+m.openCount+' oportunidades y '+(data.leads||[]).filter(row=>!['CONVERTED','DISQUALIFIED'].includes(row.status)).length+' prospectos activos.':'Aún no hay cartera abierta registrada.',action:'Ver cartera',target:'opportunities'},
  {label:'RIESGO',text:m.atRisk.length?m.atRisk.length+' oportunidad(es) exponen '+compactMoney(m.riskValue)+' por seguimiento vencido o margen bajo; además hay '+m.overdueTasks+' tareas vencidas.':'No hay oportunidades abiertas clasificadas como riesgo por las reglas actuales.',action:m.atRisk.length?'Revisar riesgo':'Ver tareas',target:m.atRisk.length?'opportunities':'tasks'},
  {label:'OPORTUNIDAD',text:radarCritical.length||radarHigh.length?(radarCritical.length+' críticas y '+radarHigh.length+' de alta prioridad en Radar'+(topSignal?' · foco: '+topSignal.institution_name+'.':'.')):(strongestOpportunity?'Mayor oportunidad abierta: '+strongestOpportunity.name+' · '+compactMoney(amount(strongestOpportunity))+'.':'No hay una oportunidad destacada por valor o Radar.'),action:radar.length?'Abrir Radar':'Ver oportunidades',target:radar.length?'radar':'opportunities'},
  {label:'DECISIÓN',text:m.decisions[0]?m.decisions[0].title+': '+m.decisions[0].detail+'. '+m.decisions[0].reason:(m.team[0]?'Mantener foco en '+m.team[0].user.full_name+' y revisar el siguiente cierre con mayor impacto.':'No hay una decisión crítica generada por las reglas actuales.'),action:m.decisions[0]?m.decisions[0].action:'Ver prospectos',target:m.decisions[0]?.table||'leads'}
 ];
 const macrozoneFor=region=>{
  const key=String(region||'').toUpperCase();
  if(key==='LIMA'||key==='CALLAO')return 'LIMA';
  if(['TUMBES','PIURA','LAMBAYEQUE','LA LIBERTAD','CAJAMARCA','AMAZONAS','SAN MARTIN','LORETO'].includes(key))return 'NORTE';
  if(['ANCASH','HUANUCO','PASCO','JUNIN','HUANCAVELICA','AYACUCHO','UCAYALI'].includes(key))return 'CENTRO';
  if(['ICA','AREQUIPA','MOQUEGUA','TACNA','CUSCO','PUNO','APURIMAC','MADRE DE DIOS'].includes(key))return 'SUR';
  return 'OTROS';
 };
 const territorialRows=radar.filter(row=>row.region||row.city);
 const macroCounts=territorialRows.reduce((acc,row)=>{const key=macrozoneFor(row.region);acc[key]=(acc[key]||0)+1;return acc;},{});
 const limaRows=territorialRows.filter(row=>String(row.region||'').toUpperCase()==='LIMA');
 const territoryCoverage=new Set(territorialRows.map(row=>String(row.region||'').trim()).filter(Boolean)).size;
 const districtCoverage=new Set(limaRows.map(row=>String(row.city||'').trim()).filter(Boolean)).size;
 const availableSegments=territorialRows.reduce((acc,row)=>{const key=row.ticket_band||row.institution_size||'SIN_PROXY';acc[key]=(acc[key]||0)+1;return acc;},{});
 const territorialStory=[
   macroCounts.LIMA?'Lima concentra '+macroCounts.LIMA+' de '+territorialRows.length+' señales georreferenciables de la cobertura actual.':'Lima aún no concentra señales en la cobertura actual.',
   macroCounts.NORTE?'El norte aporta '+macroCounts.NORTE+' señal(es), hoy principalmente fuera de Lima.':'El norte todavía no tiene volumen suficiente para una lectura comparativa.',
   districtCoverage?'En Lima hay '+districtCoverage+' distritos/ciudades representados en Radar.':'La cobertura distrital de Lima aún es insuficiente.',
   'La segmentación económica formal está pendiente de transferir desde Prospect Intelligence; no se infiere NSE por ubicación.'
 ];
 const territorial='<section class="territorial-intelligence"><header><div><small>INTELIGENCIA TERRITORIAL</small><h2>¿Dónde se está moviendo la demanda observable?</h2><p>Lectura de señales actualmente visibles en Radar. No representa todavía el universo nacional ni una probabilidad de venta.</p></div><span>'+territorialRows.length+' señales · '+territoryCoverage+' regiones</span></header>'+
 '<div class="territorial-summary">'+
  ['LIMA','NORTE','CENTRO','SUR'].map(zone=>'<article><strong>'+Number(macroCounts[zone]||0)+'</strong><span>'+zone+'</span><small>'+Math.round((Number(macroCounts[zone]||0)/Math.max(1,territorialRows.length))*100)+'% de la cobertura visible</small></article>').join('')+
 '</div>'+
 '<div class="territorial-story">'+territorialStory.map((item,index)=>'<p><b>0'+(index+1)+'</b><span>'+esc(item)+'</span></p>').join('')+'</div>'+
 '<div class="territorial-maps"><article><div class="territorial-map-head"><div><small>PERÚ</small><h3>Concentración regional</h3></div><span>Señales Radar</span></div><div id="territorialPeruMap" class="territorial-map" aria-label="Mapa territorial de Perú"></div></article>'+
 '<article><div class="territorial-map-head"><div><small>LIMA</small><h3>Distribución por distrito/ciudad</h3></div><span>'+districtCoverage+' zonas visibles</span></div><div id="territorialLimaMap" class="territorial-map" aria-label="Mapa territorial de Lima"></div></article></div>'+
 '<section class="territorial-segment"><header><div><small>CAPACIDAD / SEGMENTACIÓN</small><h3>Proxy comercial disponible hoy</h3></div><span>No es NSE oficial</span></header><div>'+Object.entries(availableSegments).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([key,count])=>'<p><strong>'+count+'</strong><span>'+esc(key==='SIN_PROXY'?'Sin proxy disponible':key)+'</span></p>').join('')+'</div><small>La estructura queda preparada para incorporar market_segment_proxy, matrícula, pensión e ingresos brutos estimados cuando se transfieran desde DEV.</small></section>'+
 '</section>';
 const institutions=(data.institutions||[]).length;
 const activeLeads=(data.leads||[]).filter(row=>!['CONVERTED','DISQUALIFIED'].includes(row.status)).length;
 const kpis=kpi('Ventas ganadas · mes',incomplete?'—':compactMoney(m.revenue),m.wonCount+' cierres · '+progress,'won')+
 kpi('Instituciones en cartera',incomplete?'—':String(institutions),activeLeads+' prospectos activos','pipeline')+
 kpi('Cartera abierta',incomplete?'—':compactMoney(m.pipeline),m.openCount+' oportunidades · proyección mes '+compactMoney(m.forecast),'pipeline')+
 kpi('Cartera en riesgo',incomplete?'—':compactMoney(m.riskValue),m.overdue.length+' seguimientos atrasados · '+m.overdueTasks+' tareas vencidas','risk','risk');
 const decisions=incomplete?'<p class="ceo-empty">No se generan recomendaciones con módulos incompletos.</p>':m.decisions.length?m.decisions.map((item,index)=>'<article class="ceo-decision '+item.tone+'"><div class="ceo-decision-top"><span>0'+(index+1)+' / '+item.title+'</span><strong>'+compactMoney(item.exposure)+'</strong></div><h3 title="'+esc(item.detail)+'">'+esc(item.detail)+'</h3><p>'+esc(item.reason)+'</p><button data-edit="'+esc(item.id)+'" data-table="'+item.table+'">'+item.action+' <span aria-hidden="true">↗</span></button></article>').join(''):'<div class="ceo-empty"><strong>Sin alertas según las reglas actuales.</strong><span> Revisa la cartera o registra nuevas oportunidades.</span><button data-page="leads">Ver prospectos</button></div>';
 const openOpportunityLeadIds=new Set(openOpportunities.map(row=>row.lead_id).filter(Boolean));
 const pipelineLeadCount=(data.leads||[]).filter(row=>!openOpportunityLeadIds.has(row.id)&&['NEW','RESEARCHING','CONTACT_PENDING'].includes(row.status)).length;
 const pipelineContactedCount=(data.leads||[]).filter(row=>!openOpportunityLeadIds.has(row.id)&&['CONTACTED','QUALIFIED'].includes(row.status)).length;
 const pipelineDiagnosisCount=openOpportunities.filter(row=>['DETECTED','CONTACT_PENDING','CONTACTED','QUALIFIED','OPPORTUNITY'].includes(row.stage)).length;
 const pipelineProposalCount=openOpportunities.filter(row=>row.stage==='PROPOSAL').length;
 const pipelineNegotiationCount=openOpportunities.filter(row=>row.stage==='NEGOTIATION').length;
 const pipelineWonCount=(data.opportunities||[]).filter(row=>row.stage==='WON'&&inPeriod(row,{...m.period,end:businessDay(now)})).length;
 const mobilePipeline=[
  ['Lead',pipelineLeadCount,'#2f7de1'],
  ['Contactado',pipelineContactedCount,'#5aa7ec'],
  ['Diagnóstico',pipelineDiagnosisCount,'#8b6fd6'],
  ['Propuesta',pipelineProposalCount,'#f3b33d'],
  ['Negociación',pipelineNegotiationCount,'#ed7d31'],
  ['Ganado',pipelineWonCount,'#36a77a']
 ];
 const strategicOpportunities=openOpportunities.slice().sort((a,b)=>amount(b)-amount(a)).slice(0,4);
 const executiveTasks=(data.tasks||[]).filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
 const upcoming=[
  ...(data.meetings||[]).filter(row=>row.start_at&&Date.parse(row.start_at)>=now.getTime()).map(row=>({date:row.start_at,type:'Reunión',title:row.title||'Reunión comercial',page:'meetings'})),
  ...executiveTasks.filter(row=>row.due_at&&Date.parse(row.due_at)>=now.getTime()).map(row=>({date:row.due_at,type:'Tarea',title:row.title||'Tarea comercial',page:'tasks'})),
  ...openOpportunities.filter(row=>row.expected_close_date&&Date.parse(row.expected_close_date)>=now.getTime()).map(row=>({date:row.expected_close_date,type:'Cierre esperado',title:row.name||'Oportunidad',page:'opportunities'}))
 ].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,6);
 const teamCards=incomplete?'<div class="director-empty">Equipo pendiente de cargar.</div>':m.team.length?m.team.slice(0,6).map(row=>{
  const attention=row.riskCount||row.overdueTasks;
  return '<button class="director-team-card '+(attention?'needs-attention':'')+'" data-ceo-seller="'+esc(row.user.id)+'">'+
   '<div class="director-team-head"><span class="director-avatar">'+esc((row.user.full_name||'?').trim().charAt(0).toUpperCase())+'</span><span><strong>'+esc(row.user.full_name)+'</strong><small>'+(attention?'Requiere seguimiento':'Operación estable')+'</small></span></div>'+
   '<div class="director-team-metrics"><span><b>'+row.openCount+'</b><small>casos</small></span><span><b>'+row.overdueTasks+'</b><small>vencidas</small></span><span><b>'+row.riskCount+'</b><small>riesgo</small></span><span><b>'+(row.attainment===null?'—':Math.round(row.attainment)+'%')+'</b><small>meta</small></span></div>'+
   '<div class="director-team-value"><small>Cartera</small><strong>'+compactMoney(row.openValue)+'</strong></div>'+
  '</button>';
 }).join(''):'<div class="director-empty">Aún no hay ejecutivos comerciales vinculados.</div>';
 const exceptionCards=incomplete?'<div class="director-empty">Actualiza los datos antes de interpretar excepciones.</div>':m.decisions.length?m.decisions.map((item,index)=>
  '<article class="director-exception '+item.tone+'"><div><span class="director-exception-index">'+String(index+1).padStart(2,'0')+'</span><span class="director-exception-label">'+esc(item.title)+'</span><strong>'+compactMoney(item.exposure)+'</strong></div><h3>'+esc(item.detail)+'</h3><p>'+esc(item.reason)+'</p><button data-edit="'+esc(item.id)+'" data-table="'+item.table+'">'+esc(item.action)+' →</button></article>'
 ).join(''):'<div class="director-empty">No hay excepciones críticas según las reglas actuales.</div>';
 const strategicCards=strategicOpportunities.length?strategicOpportunities.map((row,index)=>{
  const owner=(data.users||[]).find(user=>user.id===assignedUserId(row));
  const next=row.next_action_date?new Date(row.next_action_date).toLocaleDateString('es-PE',{day:'2-digit',month:'short'}):'Sin fecha';
  return '<button class="director-opportunity" data-edit="'+esc(row.id)+'" data-table="opportunities"><span class="director-opportunity-rank">0'+(index+1)+'</span><span><strong>'+esc(row.name||'Oportunidad')+'</strong><small>'+esc(owner?.full_name||'Sin responsable')+' · '+esc(row.stage||'Sin etapa')+'</small></span><span><b>'+compactMoney(amount(row))+'</b><small>Próxima: '+esc(next)+'</small></span></button>';
 }).join(''):'<div class="director-empty">No hay oportunidades abiertas registradas.</div>';
 const upcomingRows=upcoming.length?upcoming.map(item=>'<button class="director-upcoming-row" data-page="'+item.page+'"><span>'+new Date(item.date).toLocaleDateString('es-PE',{day:'2-digit',month:'short'})+'</span><span><small>'+esc(item.type)+'</small><strong>'+esc(item.title)+'</strong></span><span>→</span></button>').join(''):'<div class="director-empty">No hay hitos próximos registrados.</div>';
 const directorPipeline=mobilePipeline.map(([label,count,color])=>'<div class="director-pipeline-stage" style="--pipe:'+color+'"><span></span><strong>'+count+'</strong><small>'+label+'</small></div>').join('');
 const iconSales='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V12h3v8M10.5 20V7h3v13M17 20V3h3v17"/></svg>';
 const iconPipeline='<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v5c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 10v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>';
 const iconRisk='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Z"/><path d="M12 9v5M12 17.3v.1"/></svg>';
 const iconForecast='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16l4-5 3 2 5-7M16 6h2v2"/></svg>';
 const mobileClone='<section class="director-mobile-dashboard director-mobile-clone" aria-label="Dashboard de dirección móvil">'+
  '<header class="director-mobile-head director-mobile-head--clone"><div><small>DIRECCIÓN</small><h2>Hola, Toshi</h2><p>'+esc(headline)+'</p></div></header>'+
  '<section class="director-mobile-kpis director-mobile-kpis--clone">'+
   '<article class="director-mobile-kpi sales"><span class="director-kpi-icon">'+iconSales+'</span><div><small>Ventas mes</small><strong>'+compactMoney(m.revenue)+'</strong><span>'+progress+'</span></div></article>'+
   '<article class="director-mobile-kpi pipeline"><span class="director-kpi-icon">'+iconPipeline+'</span><div><small>Pipeline</small><strong>'+compactMoney(m.pipeline)+'</strong><span>'+m.openCount+' oportunidades</span></div></article>'+
   '<article class="director-mobile-kpi risk '+(m.atRisk.length?'is-active':'')+'"><span class="director-kpi-icon">'+iconRisk+'</span><div><small>En riesgo</small><strong>'+m.atRisk.length+'</strong><span>'+compactMoney(m.riskValue)+'</span></div></article>'+
   '<article class="director-mobile-kpi forecast"><span class="director-kpi-icon">'+iconForecast+'</span><div><small>Forecast</small><strong>'+compactMoney(m.forecast)+'</strong><span>mes actual</span></div></article>'+
  '</section>'+
  '<section class="director-manager-reading"><span>LECTURA GERENCIAL</span><p>'+esc(m.pipeline===0?'Sin cartera abierta. Prioriza generación de oportunidades.':m.atRisk.length?'Hay '+m.atRisk.length+' oportunidades en riesgo dentro de una cartera de '+compactMoney(m.pipeline)+'. Prioriza seguimiento y margen.':'Cartera activa sin alertas críticas de riesgo. Revisa madurez y próximos cierres.')+'</p></section>'+
  '<section class="director-mobile-section director-mobile-section--clone"><header><h3>Pipeline comercial</h3><small>Estado actual</small></header><div class="director-mobile-pipeline director-mobile-pipeline--clone">'+mobilePipeline.map(([label,count,color],index)=>{const icons=[
 '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M4 19v-2a5 5 0 0 1 5-5h.3a5 5 0 0 1 5 5v2M14 13a4 4 0 0 1 6 3.4V19"/></svg>',
 '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M5 20v-3a7 7 0 0 1 14 0v3"/></svg>',
 '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="5"/><path d="m14 14 5 5"/></svg>',
 '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/></svg>',
 '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 12 4-4 4 4-4 4-4-4Zm10 0 4-4 4 4-4 4-4-4Z"/><path d="M9 12h6"/></svg>',
 '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4"/></svg>'
 ][index];return '<div class="director-pipeline-stage director-pipeline-stage--clone" style="--pipe:'+color+'"><span class="stage-accent"></span><span class="stage-icon">'+icons+'</span><strong>'+count+'</strong><small>'+label+'</small></div>';}).join('')+'</div></section>'+
  '<section class="director-mobile-section director-mobile-section--clone"><header><h3>Requiere mi atención</h3><button data-page="now">Ver todo →</button></header><div class="director-mobile-exceptions director-mobile-exceptions--clone">'+(m.decisions.slice(0,2).map(item=>'<button data-edit="'+esc(item.id)+'" data-table="'+item.table+'"><span class="attention-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 9v6l8 6 8-6V9z"/><path d="M12 8v5M12 16h.01"/></svg></span><span><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span><span class="clone-chevron">›</span></button>').join('')||'<button data-page="now" class="clone-empty-row"><span class="attention-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8L6 17Z"/><path d="M10 20h4"/></svg></span><span><strong>Sin excepciones críticas.</strong></span><span class="clone-chevron">›</span></button>')+'</div></section>'+
  '<section class="director-mobile-section director-mobile-section--clone"><header><h3>Equipo comercial</h3><button data-page="users">Ver equipo →</button></header><div class="director-mobile-team director-mobile-team--clone">'+(m.team.slice(0,3).map(row=>'<button data-ceo-seller="'+esc(row.user.id)+'"><span class="team-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M4 19v-2a5 5 0 0 1 5-5h.3a5 5 0 0 1 5 5v2M14 13a4 4 0 0 1 6 3.4V19"/></svg></span><span><strong>'+esc(row.user.full_name)+'</strong><small>'+row.openCount+' casos · '+row.overdueTasks+' vencidas · '+compactMoney(row.openValue)+'</small></span><b>'+(row.attainment===null?'—':Math.round(row.attainment)+'%')+'</b><span class="clone-chevron">›</span></button>').join('')||'<button data-page="users" class="clone-empty-row"><span class="team-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M4 19v-2a5 5 0 0 1 5-5h.3a5 5 0 0 1 5 5v2M14 13a4 4 0 0 1 6 3.4V19"/></svg></span><span><strong>Sin equipo registrado.</strong></span><span class="clone-chevron">›</span></button>')+'</div></section>'+
  '<nav class="director-mobile-bottom-nav" aria-label="Accesos rápidos de dirección">'+
   '<button class="active" data-page="dashboard"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H4z"/><path d="M9 20v-6h6v6"/></svg></span><small>Inicio</small></button>'+
   '<button data-page="opportunities"><span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/></svg></span><small>Oportunidades</small></button>'+
   '<button data-page="goals"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h6"/></svg></span><small>Reportes</small></button>'+
   '<button data-page="now"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8L6 17Z"/><path d="M10 20h4"/></svg></span><small>Notificaciones</small></button>'+
  '</nav>'+
 '</section>';
 const maxStage=Math.max(1,...m.stages.map(row=>row.value));
 const pipeline=m.stages.map((row,index)=>'<div class="ceo-stage"><span>'+row.label+'</span><b>'+row.count+'</b><strong>'+compactMoney(row.value)+'</strong><div><i style="width:'+row.value/maxStage*100+'%;--stage-color:'+['#4b8cff','#62b3e4','#a790ed','#efad55','#40bda0'][index]+'"></i></div></div>').join('');
 return '<div class="ceo-dashboard director-dashboard">'+mobileClone+
 '<section class="director-hero"><div><small>DIRECCIÓN COMERCIAL · '+esc(now.toLocaleDateString('es-PE',{month:'long',year:'numeric'}))+'</small><h2>Hola, Toshi</h2><p>'+esc(headline)+'</p></div><div class="director-hero-actions"><button data-page="now">Ver prioridades</button><button id="ceoMethodBtn" class="secondary">Cómo se calcula</button></div></section>'+
 '<section class="director-kpis">'+
  '<button data-ceo-view="won"><small>Ventas ganadas · mes</small><strong>'+compactMoney(m.revenue)+'</strong><span>'+m.wonCount+' cierres · '+progress+'</span></button>'+
  '<button data-ceo-view="pipeline"><small>Pipeline abierto</small><strong>'+compactMoney(m.pipeline)+'</strong><span>'+m.openCount+' oportunidades</span></button>'+
  '<button data-ceo-view="pipeline"><small>Forecast del mes</small><strong>'+compactMoney(m.forecast)+'</strong><span>'+(m.target===null?'Sin meta definida':'Meta '+compactMoney(m.target))+'</span></button>'+
  '<button data-ceo-view="risk" class="'+(m.atRisk.length?'risk':'')+'"><small>Exposición en riesgo</small><strong>'+compactMoney(m.riskValue)+'</strong><span>'+m.atRisk.length+' oportunidades · '+m.overdueTasks+' tareas vencidas</span></button>'+
 '</section>'+
 '<section class="director-grid director-grid-primary">'+
  '<article class="director-panel director-team-panel"><header><div><small>EQUIPO COMERCIAL</small><h2>¿Quién necesita mi atención?</h2></div><button data-page="users">Gestionar equipo →</button></header><div class="director-team-grid">'+teamCards+'</div></article>'+
  '<article class="director-panel director-attention-panel"><header><div><small>EXCEPCIONES</small><h2>Requiere mi intervención</h2></div><span>'+m.decisions.length+' priorizadas</span></header><div class="director-exception-list">'+exceptionCards+'</div></article>'+
 '</section>'+
 '<section class="director-panel director-pipeline-panel"><header><div><small>FLUJO COMERCIAL</small><h2>Pipeline del equipo</h2></div><span>Vista agregada · no es una lista</span></header><div class="director-pipeline">'+directorPipeline+'</div></section>'+
 '<section class="director-grid director-grid-secondary">'+
  '<article class="director-panel"><header><div><small>NEGOCIOS ESTRATÉGICOS</small><h2>Oportunidades de mayor impacto</h2></div><button data-page="opportunities">Ver cartera →</button></header><div class="director-opportunity-list">'+strategicCards+'</div></article>'+
  '<article class="director-panel"><header><div><small>PRÓXIMOS HITOS</small><h2>Qué viene después</h2></div><button data-page="meetings">Abrir agenda →</button></header><div class="director-upcoming-list">'+upcomingRows+'</div></article>'+
 '</section>'+
 '<section class="director-radar-strip"><div><small>RADAR COMERCIAL</small><h2>'+radarCritical.length+' críticas · '+radarHigh.length+' alta prioridad</h2><p>'+(topSignal?'Señal destacada: '+esc(topSignal.institution_name||'Institución')+'.':'No hay una señal prioritaria destacada en este momento.')+'</p></div><button data-page="radar">Abrir Radar →</button></section>'+
 '<details class="director-intelligence"><summary>Inteligencia y analítica avanzada</summary><div class="director-intelligence-body">'+territorial+renderAnalytics(data,{now,period:analyticsPeriod,demo,failures})+'</div></details>'+
 '</div>';
}
export const EXECUTIVE_METHOD = 'Ventas ganadas: oportunidades WON cuya fecha de cierre prevista está en el mes actual; no son cobros. Margen: valor menos costo informado, admite pérdidas; sin costo no se estima. Meta: objetivo que cubre el mes completo. Proyección: ganadas del mes más cartera con cierre previsto en el mes ponderada por probabilidad manual, no es una garantía. Riesgo: oportunidades abiertas con seguimiento vencido o margen inferior al 15%; no se cuenta dos veces una oportunidad. Prioridades: primero margen bajo, luego atrasos, luego datos pendientes; dentro de cada grupo se ordena por importe. Son reglas explicables, no IA generativa. El ranking compara cumplimiento de metas de ventas, no liquida bonos. Los datos de demostración nunca se mezclan con datos reales.';

