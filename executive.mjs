import {escapeHTML as esc, money} from './domain.mjs';
import {assignedUserId} from './workspace.mjs';
import {monthRange} from './demo.mjs';
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
 const open=opps.filter(row=>!closed(row)),won=opps.filter(row=>row.stage==='WON'&&inPeriod(row,period));
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
  if(filter==='won')rows=rows.filter(row=>row.stage==='WON'&&inPeriod(row,period));
  if(filter==='pipeline')rows=rows.filter(row=>!closed(row));
  if(filter==='risk')rows=rows.filter(row=>!closed(row)&&((row.next_action_date&&Date.parse(row.next_action_date)<now.getTime())||(margin(row)!==null&&amount(row)>0&&margin(row)/amount(row)<.15)));
 }
 return rows;
}
export function renderExecutive(data,{now=new Date(),demo=false,failures={}}={}){
 const m=executiveMetrics(data,now),incomplete=Object.keys(failures).length>0;
 const progress=m.attainment===null?'Sin meta':Math.round(m.attainment)+'% de la meta';
 const headline=incomplete?'Datos incompletos: actualiza antes de decidir.':m.target===null?'Define la meta para orientar al equipo.':m.attainment>=100?'Meta alcanzada. Protege el margen del siguiente cierre.':'Faltan '+compactMoney(m.gap)+' para alcanzar la meta.';
 const kpi=(label,value,hint,view,tone='')=>'<button class="ceo-kpi '+tone+'" data-ceo-view="'+view+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+esc(hint)+'</small></button>';
 const statusTitle=incomplete?'INFORMACIÓN PARCIAL':demo?'ESCENARIO SIMULADO':'LECTURA EJECUTIVA';
 const kpis=kpi('Ventas ganadas · mes',incomplete?'—':compactMoney(m.revenue),m.wonCount+' cierres · '+progress,'won')+
 kpi('Margen estimado · mes',incomplete?'—':compactMoney(m.grossMargin),m.unknownCosts?m.unknownCosts+' cierres sin costo · subtotal parcial':m.marginPercent===null?'Sin costos de cierres disponibles':m.marginPercent.toFixed(1)+'% sobre ventas con costo','won','margin')+
 kpi('Cartera abierta',incomplete?'—':compactMoney(m.pipeline),m.openCount+' oportunidades · proyección mes '+compactMoney(m.forecast),'pipeline')+
 kpi('Cartera en riesgo',incomplete?'—':compactMoney(m.riskValue),m.overdue.length+' seguimientos atrasados · '+m.overdueTasks+' tareas vencidas','risk','risk');
 const decisions=incomplete?'<p class="ceo-empty">No se generan recomendaciones con módulos incompletos.</p>':m.decisions.length?m.decisions.map((item,index)=>'<article class="ceo-decision '+item.tone+'"><div class="ceo-decision-top"><span>0'+(index+1)+' / '+item.title+'</span><strong>'+compactMoney(item.exposure)+'</strong></div><h3 title="'+esc(item.detail)+'">'+esc(item.detail)+'</h3><p>'+esc(item.reason)+'</p><button data-edit="'+esc(item.id)+'" data-table="'+item.table+'">'+item.action+' <span aria-hidden="true">↗</span></button></article>').join(''):'<div class="ceo-empty"><strong>Sin alertas según las reglas actuales.</strong><span> Revisa la cartera o registra nuevas oportunidades.</span><button data-page="leads">Ver prospectos</button></div>';
 const team=incomplete?'<p class="ceo-empty">Ranking pendiente de completar la carga.</p>':m.team.length?'<table class="ceo-team-table"><thead><tr><th>Vendedor</th><th>Ganadas</th><th>Margen</th><th>Meta</th></tr></thead><tbody>'+m.team.slice(0,5).map((row,index)=>'<tr><td><button data-ceo-seller="'+esc(row.user.id)+'"><i class="ceo-rank">'+(index+1)+'</i>'+esc(row.user.full_name)+'</button></td><td>'+compactMoney(row.sales)+'</td><td title="'+(row.unknownCost?'Subtotal: faltan costos':'Margen estimado')+'">'+compactMoney(row.margin)+(row.unknownCost?'*':'')+'</td><td><span class="ceo-mini-progress"><i style="width:'+Math.min(100,row.attainment||0)+'%"></i></span><b>'+(row.attainment===null?'Sin meta':Math.round(row.attainment)+'%')+'</b></td></tr>').join('')+'</tbody></table>':'<div class="ceo-empty">No hay vendedores vinculados. La demostración incluye cinco perfiles ficticios.</div>';
 const maxStage=Math.max(1,...m.stages.map(row=>row.value));
 const pipeline=m.stages.map((row,index)=>'<div class="ceo-stage"><span>'+row.label+'</span><b>'+row.count+'</b><strong>'+compactMoney(row.value)+'</strong><div><i style="width:'+row.value/maxStage*100+'%;--stage-color:'+['#4b8cff','#62b3e4','#a790ed','#efad55','#40bda0'][index]+'"></i></div></div>').join('');
 const activities=(data.activities||[]).slice().sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0,3);
 const activity=activities.map(row=>'<button class="ceo-event" data-edit="'+esc(row.id)+'" data-table="activities"><span class="ceo-event-dot"></span><span><strong>'+esc(row.subject||row.type)+'</strong><small>'+esc((data.users||[]).find(user=>user.id===row.created_by)?.full_name||'Equipo')+' · '+new Date(row.occurred_at).toLocaleDateString('es-PE',{day:'2-digit',month:'short'})+'</small></span><span aria-hidden="true">↗</span></button>').join('')||'<p class="ceo-empty">Aún no hay interacciones.</p>';
 return '<div class="ceo-dashboard"><section class="ceo-signal"><div><small>'+statusTitle+' · '+esc(now.toLocaleDateString('es-PE',{month:'long',year:'numeric'}))+'</small><h2>'+esc(headline)+'</h2></div><button id="ceoMethodBtn" class="ceo-method" title="Ver cómo se calculan los indicadores">Cómo se calcula</button></section>'+
 '<section class="ceo-kpis" aria-label="Indicadores ejecutivos">'+kpis+'</section>'+
 '<section class="ceo-decisions" aria-label="Decisiones prioritarias">'+decisions+'</section>'+
 '<section class="ceo-bottom"><article class="ceo-panel"><header><h2>Equipo · avance contra meta</h2><button data-page="users">Ver equipo ↗</button></header>'+team+'<p class="ceo-caption">Orden: % de meta de ventas; desempate por ventas. No calcula bonos.</p></article>'+
 '<article class="ceo-panel"><header><h2>Embudo comercial</h2><button data-page="opportunities" aria-label="Ver todas las oportunidades">↗</button></header>'+pipeline+'</article>'+
 '<article class="ceo-panel"><header><h2>Pulso comercial</h2><button data-page="activities" aria-label="Ver todas las interacciones">↗</button></header>'+activity+'<div class="ceo-target"><span>Objetivo de ventas</span><strong>'+compactMoney(m.target)+'</strong></div><button class="ceo-goals-link" data-page="goals">Ajustar metas del periodo ↗</button></article></section></div>';
}
export const EXECUTIVE_METHOD = 'Ventas ganadas: oportunidades WON cuya fecha de cierre prevista está en el mes actual; no son cobros. Margen: valor menos costo informado, admite pérdidas; sin costo no se estima. Meta: objetivo que cubre el mes completo. Proyección: ganadas del mes más cartera con cierre previsto en el mes ponderada por probabilidad manual, no es una garantía. Riesgo: oportunidades abiertas con seguimiento vencido o margen inferior al 15%; no se cuenta dos veces una oportunidad. Prioridades: primero margen bajo, luego atrasos, luego datos pendientes; dentro de cada grupo se ordena por importe. Son reglas explicables, no IA generativa. El ranking compara cumplimiento de metas de ventas, no liquida bonos. Los datos de demostración nunca se mezclan con datos reales.';

