import {analyticsMetrics, businessDay} from './analytics.mjs';
import {escapeHTML as esc} from './domain.mjs';
import {renderAnalytics, salesChart, expenseChart, profitChart} from './analytics-view.mjs?v=2.46.6';

export const performancePages={overview:'Rendimiento del negocio',sales:'Ventas',budget:'Presupuesto',profit:'Rentabilidad',forecast:'Proyecciones'};
const numeric=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))?Number(v):null;
const money=v=>v===null||v===undefined?'Sin datos suficientes':'S/ '+v.toLocaleString('es-PE',{maximumFractionDigits:2});
const pct=v=>v===null?'Sin datos suficientes':v.toLocaleString('es-PE',{maximumFractionDigits:1})+'%';
const pen=r=>!r.currency||String(r.currency).toUpperCase()==='PEN';
const categoryName=v=>({PERSONNEL:'Personal',OPERATIONS:'Operaciones',TECHNOLOGY:'Tecnología',MARKETING:'Marketing',OTHER:'Otros'}[v]||v||'Sin categoría');
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const isReal=r=>!r.is_simulated&&!JSON.stringify(r).includes('[SIMULADO]');
const cell=v=>'"'+String(v??'').replace(typeof v==='number'?/$^/:/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
const link=(page,label)=>'<button type="button" data-performance-page="'+page+'">'+esc(label)+'</button>';
const record=(table,r,label)=>'<button type="button" data-performance-record="'+esc(r.id)+'" data-performance-table="'+table+'">'+esc(label)+'</button>';

export function performanceModel(input,{now=new Date(),period='year',demo=false,failures={},filters={},adjustment=20}={}){
 const data=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,Array.isArray(v)?v.filter(r=>demo||isReal(r)):v]));
 const m=analyticsMetrics(data,{now,period});
 const [year,month,day]=m.period.cutoff.split('-').map(Number);
 const previousDate=new Date(Date.UTC(year-1,month-1,Math.min(day,new Date(Date.UTC(year-1,month,0)).getUTCDate()),17));
 const previous=analyticsMetrics(data,{now:previousDate,period});
 const trend=!failures.opportunities&&previous.totals.wonCount>0&&previous.totals.sales>0?(m.totals.sales/previous.totals.sales-1)*100:null;
 const institution=r=>r.institution_id||(data.leads||[]).find(l=>l.id===r.lead_id)?.institution_id;
 const name=r=>(data.institutions||[]).find(i=>i.id===institution(r))?.name||'Sin institución vinculada';
 const owner=r=>(data.users||[]).find(u=>u.id===r.owner_user_id)?.full_name||'Sin responsable identificado';
 const inPeriod=d=>validDate(d)&&d>=m.period.start&&d<=m.period.cutoff;
 const won=(data.opportunities||[]).filter(r=>r.stage==='WON'&&pen(r)&&numeric(r.value)!==null&&Number(r.value)>=0&&inPeriod(r.expected_close_date));
 const allSales=won.map(r=>({...r,institutionName:name(r),ownerName:owner(r),institutionKey:institution(r)||'',productName:(data.catalog_products||[]).find(p=>p.id===r.catalog_product_id)?.name||'Sin producto vinculado'}));
 const sales=allSales.filter(r=>(!filters.institution||r.institutionKey===filters.institution)&&(!filters.owner||r.owner_user_id===filters.owner)&&(!filters.product||r.catalog_product_id===filters.product));
 const expenses=(data.expenses||[]).filter(r=>pen(r)&&numeric(r.amount)!==null&&Number(r.amount)>=0&&inPeriod(r.expense_date)&&(!filters.category||r.category===filters.category));
 const open=(data.opportunities||[]).filter(r=>!['WON','LOST'].includes(r.stage));
 const end30=businessDay(new Date(now.getTime()+30*86400000));
 const upcoming=open.filter(r=>validDate(r.expected_close_date)&&r.expected_close_date>=m.period.cutoff&&r.expected_close_date<=end30);
 const base=!failures.opportunities&&m.period.elapsedDays>=7&&m.totals.sales>0?m.totals.sales/m.period.elapsedDays*m.period.totalDays:null;
 const spread=Math.min(50,Math.max(0,numeric(adjustment)??20))/100;
 const remaining=base===null?null:Math.max(0,base-m.totals.sales);
 const scenarios=base===null?null:{conservative:m.totals.sales+remaining*(1-spread),base,optimistic:m.totals.sales+remaining*(1+spread)};
 const alerts=[];
 const add=(title,severity,area,page,action,row=null,table=null,date=m.period.cutoff)=>alerts.push({title,severity,area,page,action,row,table,date});
 if(!failures.expenses&&!failures.goals&&m.progress.expensesVariance>0)add('Gasto excedido al corte: '+money(m.progress.expensesVariance),'Alta','Finanzas','budget','Revisar gastos y presupuesto');
 if(!failures.opportunities&&!failures.goals&&m.progress.salesVariance<0)add('Ventas por debajo del plan: '+money(-m.progress.salesVariance),'Media','Ventas','sales','Revisar cierres y meta');
 if(!failures.opportunities&&m.quality.unknownCosts)add(m.quality.unknownCosts+' cierres sin costo directo','Media','Finanzas','profit','Completar costos de los cierres');
 if(!failures.opportunities&&!failures.expenses&&m.totals.operatingResult<0)add('Resultado operativo negativo','Alta','Finanzas','profit','Revisar operaciones con pérdida');
 if(!failures.goals&&(m.targets.sales===null||m.targets.expenses===null))add('Planificación incompleta para el periodo','Media','Dirección',null,'Revisar metas y presupuesto',null,'goals');
 if(!failures.tasks)for(const r of data.tasks||[]){const d=String(r.due_at||'').slice(0,10);if(validDate(d)&&d<m.period.cutoff&&!['COMPLETED','CANCELLED'].includes(r.status))add(r.title||'Tarea comercial vencida','Alta','Comercial',null,'Atender tarea vencida',r,'tasks',d);}
 if(!failures.opportunities)for(const r of open){const d=String(r.updated_at||r.created_at||'').slice(0,10);if(validDate(d)&&(Date.parse(m.period.cutoff)-Date.parse(d))/86400000>30&&['PROPOSAL','NEGOTIATION'].includes(r.stage))add((r.name||r.title||'Oportunidad')+': sin actualización en más de 30 días','Media','Pipeline',null,'Revisar seguimiento pendiente',r,'opportunities',d);}
 return {data,m,trend,sales,allSales,expenses,open,upcoming,alerts,scenarios,spread,failures,provenance:{sales:failures.opportunities?'NO DISPONIBLE':'REAL',result:failures.opportunities||failures.expenses||m.totals.operatingResult===null?'NO DISPONIBLE':'CALCULADA',forecast:scenarios?'PROYECTADA':'NO DISPONIBLE'}};
}

function table(headers,rows){
 const cls=i=>/PEN|Importe|Ventas|Venta|Costo|Gasto|Margen|Resultado|Participación|Cumplimiento|Cierre del periodo/.test(headers[i])?' class="performance-number"':'';
 return '<section class="performance-table-card"><div class="performance-table-toolbar"><strong>Detalle · '+rows.length+' registros</strong><div><span>Desplaza para ver todas las columnas</span><button type="button" data-performance-scroll="-1" aria-label="Desplazar tabla a la izquierda">Anterior</button><button type="button" data-performance-scroll="1" aria-label="Desplazar tabla a la derecha">Siguiente</button></div></div><div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Tabla de detalle, desplazable horizontal y verticalmente"><table class="analytics-table"><thead><tr>'+headers.map((h,i)=>'<th scope="col"'+cls(i)+'>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map((c,i)=>'<td'+cls(i)+'>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+(!rows.length?'<p class="performance-empty">Sin registros para estos filtros.</p>':'')+'</div></section>';
}
function select(field,label,values,selected){return '<label>'+label+'<select data-performance-filter="'+field+'"><option value="">Todos</option>'+values.map(([v,n])=>'<option value="'+esc(v)+'"'+(selected===v?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>';}
const unique=rows=>[...new Map(rows.filter(([key])=>key)).entries()];
const metric=(label,value,tone='',page=null)=>'<article class="analytics-kpi '+tone+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+(page?link(page,'Ver detalle'):'')+'</article>';
function decisions(model){
 const {alerts,failures}=model;
 const target=(a,label)=>a.row?record(a.table,a.row,label):a.table?'<button data-page="'+a.table+'">'+esc(label)+'</button>':link(a.page,label);
 const missing=failures.tasks||failures.opportunities||failures.expenses||failures.goals;
 return '<div class="performance-decisions"><article class="analytics-chart performance-alerts"><h3>Alertas clave <small>'+alerts.length+'</small></h3>'+(!alerts.length?'<p>'+(missing?'Información parcial: no se puede evaluar todas las alertas.':'Sin alertas con los datos cargados.')+'</p>':alerts.map(a=>'<div class="performance-alert"><span class="performance-severity '+(a.severity==='Alta'?'danger':'warning')+'">'+a.severity+'</span><div>'+target(a,a.title)+'<small>'+esc(a.area)+' · '+esc(a.date)+'</small></div></div>').join(''))+'</article><article class="analytics-chart performance-actions"><h3>Acciones recomendadas</h3>'+alerts.map(a=>'<div class="performance-action">'+target(a,a.action)+'<small>'+esc(a.title)+'</small></div>').join('')+(!alerts.length?'<p>No hay acciones derivadas de las reglas evaluadas.</p>':'')+'</article></div>';
}
function summary(model){
 const {open,upcoming,failures}=model,known=!failures.opportunities;
 const value=known&&upcoming.every(r=>pen(r)&&numeric(r.value)!==null)?upcoming.reduce((s,r)=>s+Number(r.value),0):null;
 return '<article class="analytics-chart performance-summary"><header><h3>Resumen ejecutivo</h3><button data-page="opportunities">Ver oportunidades</button></header><div class="analytics-kpis">'+metric('Oportunidades activas',known?String(open.length):'Sin datos')+metric('En etapa Propuesta',known?String(open.filter(r=>r.stage==='PROPOSAL').length):'Sin datos')+metric('Negociaciones activas',known?String(open.filter(r=>r.stage==='NEGOTIATION').length):'Sin datos')+metric('Cierres previstos · próximos 30 días',known?upcoming.length+' · '+money(value):'Sin datos','forecast')+'</div></article>';
}

export function renderPerformance(data,options={}){
 const page=Object.hasOwn(performancePages,options.page)?options.page:'overview',filters=options.filters||{},model=performanceModel(data,options),{m,failures,scenarios}=model;
 const header='<header class="analytics-header"><div><button data-performance-page="'+(page==='overview'?'direction':'overview')+'">Volver a '+(page==='overview'?'Dirección':'Rendimiento')+'</button><h2 tabindex="-1" id="performance-heading">'+performancePages[page]+'</h2><p>Visión integral del desempeño comercial, financiero y operativo.</p><small>'+esc(m.period.label)+' · '+m.period.start+' a '+m.period.end+' · Corte '+m.period.cutoff+'</small></div><div class="analytics-controls"><span class="analytics-source '+(options.demo?'demo':'live')+'">'+(options.demo?'DEMOSTRACIÓN · datos simulados':'Datos reales · PEN')+'</span><div class="analytics-periods">'+Object.entries({month:'Mes',quarter:'Trimestre',year:'Año'}).map(([key,label])=>'<button data-analytics-period="'+key+'" aria-pressed="'+(m.period.key===key)+'">'+label+'</button>').join('')+'</div><button data-performance-export'+(Object.values(failures).some(Boolean)?' disabled':'')+'>Exportar CSV</button></div></header>';
 const nav='<nav class="performance-nav" aria-label="Rendimiento">'+Object.entries(performancePages).map(([key,label])=>'<button data-performance-page="'+key+'" aria-current="'+(key===page?'page':'false')+'">'+(key==='overview'?'Resumen':label)+'</button>').join('')+'</nav>';
 let body='';
 if(page==='overview'){
  body=renderAnalytics(model.data,options).replace(/<header class="analytics-header">[\s\S]*?<\/header>/,'').replace('aria-labelledby="analytics-heading"','aria-label="Indicadores de rendimiento"');
  body=body.replace(/<svg class="analytics-sales-svg"[\s\S]*?<\/svg>/,salesChart(m,!failures.opportunities,!failures.goals,true).match(/<svg[\s\S]*?<\/svg>/)?.[0]||'');
  body=body.replace(/<svg class="analytics-bar-svg"[^>]*aria-labelledby="analytics-profit-title[\s\S]*?<\/svg>/,profitChart(m,!failures.opportunities,!failures.expenses,true));
  body=body.replace('Objetivo futuro</span>','Objetivo futuro</span><span class="performance-projection-label">Proyección lineal · violeta</span>').replace('Resultado ≥ 0','Resultado operativo').replace('Pérdida &lt; 0','Costos directos · coral</span><span>Ventas · azul');
  body=body.replace('Ventas vs meta a la fecha</span>','Ventas vs meta a la fecha</span><small>'+ (model.trend===null?'':pct(model.trend)+' vs. mismo corte del año anterior')+'</small>');
  const destinations=['sales','budget','profit','forecast'];let index=0;
  body=body.replace(/<article class="analytics-kpi ([^"]*)">([\s\S]*?)<\/article>/g,(_,tone,inner)=>'<article class="analytics-kpi '+tone+'">'+inner+link(destinations[index++],'Ver detalle')+'</article>');
  body=body.replace('<h3>Ventas y objetivo</h3>','<h3>'+link('sales','Ventas y objetivo')+'</h3>').replace('<h3>Gastos y presupuesto</h3>','<h3>'+link('budget','Gastos y presupuesto')+'</h3>').replace('<h3>Rentabilidad</h3>','<h3>'+link('profit','Rentabilidad')+'</h3>');
  body=body.replace(/<div class="analytics-alerts"[\s\S]*?<\/div>|<div class="analytics-stable">[\s\S]*?<\/div>/,'');
  body=body.replace('<details class="analytics-details">',decisions(model)+summary(model)+'<details class="analytics-details">');
 } else if(page==='sales'){
  body='<div class="performance-filters">'+select('institution','Institución',unique(model.allSales.map(r=>[r.institutionKey,r.institutionName])),filters.institution)+select('owner','Ejecutivo',unique(model.allSales.map(r=>[r.owner_user_id,r.ownerName])),filters.owner)+select('product','Producto / solución',unique(model.allSales.map(r=>[r.catalog_product_id,r.productName])),filters.product)+'</div>';
  const total=failures.opportunities?null:model.sales.reduce((s,r)=>s+Number(r.value),0);
  body+='<div class="analytics-kpis">'+metric('Ventas filtradas',money(total),'positive')+metric('Meta organizacional del periodo',money(failures.goals?null:m.targets.sales))+metric('Cumplimiento global de la meta',pct(failures.goals||failures.opportunities?null:m.progress.periodSalesPct))+metric('Cierres filtrados',failures.opportunities?'Sin datos':String(model.sales.length))+'</div>';
  const filteredMetrics=analyticsMetrics({...model.data,opportunities:model.sales},{now:options.now,period:options.period});
  body+='<article class="analytics-chart"><h3>Ventas acumuladas · filtros aplicados</h3>'+salesChart(filteredMetrics,!failures.opportunities,!failures.goals&&!filters.owner&&!filters.institution&&!filters.product)+'</article>';
  body+=failures.opportunities?'<p>Ventas pendientes de carga.</p>':table(['Cierre previsto','Operación','Institución','Ejecutivo','Producto / solución','Venta · PEN'],model.sales.map(r=>[esc(r.expected_close_date),record('opportunities',r,r.name||r.title||'Abrir cierre'),esc(r.institutionName),esc(r.ownerName),esc(r.productName),esc(money(Number(r.value)))]));
 } else if(page==='budget'){
  body='<div class="performance-filters">'+select('category','Categoría',m.expenseCategories.map(r=>[r.category,categoryName(r.category)]),filters.category)+'<button data-page="expenses">Gestionar gastos</button><button data-page="goals">Gestionar presupuesto</button></div>';
  const total=failures.expenses?null:model.expenses.reduce((s,r)=>s+Number(r.amount),0);
  body+='<div class="analytics-kpis">'+metric('Presupuesto del periodo',money(failures.goals?null:m.targets.expenses))+metric('Gasto filtrado',money(total))+metric('Consumo global del presupuesto',pct(failures.goals||failures.expenses||!m.targets.expenses?null:m.totals.expenses/m.targets.expenses*100))+metric('Desviación global al corte',money(failures.goals||failures.expenses?null:m.progress.expensesVariance),'danger')+'</div><article class="analytics-chart"><h3>Gastos y presupuesto · organización</h3>'+expenseChart(m,!failures.expenses,!failures.goals)+'</article>';
  body+=failures.expenses?'<p>Gastos pendientes de carga.</p>':table(['Categoría','Gasto global','Participación'],m.expenseCategories.map(r=>[esc(categoryName(r.category)),esc(money(r.amount)),esc(pct(r.sharePct))]))+table(['Fecha','Concepto','Categoría','Importe'],model.expenses.map(r=>[esc(r.expense_date),record('expenses',r,r.description||r.concept||'Abrir gasto'),esc(categoryName(r.category)),esc(money(Number(r.amount)))]));
 } else if(page==='profit'){
  const loaded=!failures.opportunities&&!failures.expenses;
  body='<div class="analytics-kpis">'+metric('Ventas registradas',money(failures.opportunities?null:m.totals.sales))+metric('Costos directos estimados',money(failures.opportunities?null:m.totals.directCosts))+metric('Gastos registrados',money(failures.expenses?null:m.totals.expenses))+metric('Resultado operativo estimado',money(loaded?m.totals.operatingResult:null),'positive')+'</div><article class="analytics-chart"><header><h3>Evolución del resultado</h3><strong>Margen operativo: '+pct(loaded?m.totals.operatingMarginPercent:null)+'</strong></header>'+profitChart(m,!failures.opportunities,!failures.expenses)+'</article>';
  body=body.replace(/<svg class="analytics-bar-svg"[\s\S]*?<\/svg>/,profitChart(m,!failures.opportunities,!failures.expenses,true));
  body+='<p>Ventas · azul / Costos directos · coral / Resultado · verde (pérdidas en coral).</p><p>Margen por operación = venta − costo directo estimado. Los gastos generales no se asignan a instituciones sin una base de distribución.</p>';
  body+=failures.opportunities?'<p>Ventas pendientes de carga.</p>':table(['Operación','Institución','Ventas','Costo directo','Margen bruto','Estado'],model.allSales.map(r=>{const cost=numeric(r.estimated_cost),margin=cost!==null&&cost>=0?Number(r.value)-cost:null;return [record('opportunities',r,r.name||r.title||'Abrir cierre'),esc(r.institutionName),esc(money(Number(r.value))),esc(money(cost!==null&&cost>=0?cost:null)),esc(money(margin)),margin===null?'Costo pendiente':margin<0?'Pérdida':Number(r.value)>0&&margin/Number(r.value)<.1?'Margen menor a 10%':'Margen ≥ 10% o venta cero'];}));
  body+=table(['Mes','Ventas','Costos directos','Gastos','Resultado','Margen'],m.series.filter(r=>!r.isFuture).map(r=>[esc(r.label),esc(money(failures.opportunities?null:r.sales)),esc(money(failures.opportunities?null:r.directCosts)),esc(money(failures.expenses?null:r.expenses)),esc(money(loaded?r.operatingResult:null)),esc(pct(loaded?r.operatingMarginPercent:null))]));
 } else {
  body='<p class="performance-projection-label">Proyección / escenario · no garantiza cierres</p>';
  if(!scenarios)body+='<div class="performance-empty">Sin datos suficientes: se requieren ventas cargadas, ventas positivas y al menos siete días transcurridos.</div>';
  else body+='<label class="performance-scenario-control">Variación del ritmo futuro (%)<input type="number" min="0" max="50" step="1" data-performance-adjustment value="'+model.spread*100+'"></label><button data-performance-calculate>Calcular escenario</button><div class="analytics-kpis">'+metric('Realizado al corte',money(m.totals.sales),'positive')+metric('Escenario conservador',money(scenarios.conservative),'forecast')+metric('Escenario base',money(scenarios.base),'forecast')+metric('Escenario optimista',money(scenarios.optimistic),'forecast')+'</div>'+table(['Escenario proyectado','Cierre del periodo','Cumplimiento de meta'],Object.entries(scenarios).map(([k,v])=>[esc({conservative:'Conservador',base:'Base',optimistic:'Optimista'}[k]),esc(money(v)),esc(pct(!failures.goals&&m.targets.sales>0?v/m.targets.sales*100:null))]))+'<details><summary>Fórmulas del escenario</summary><p>Base = ventas realizadas ÷ días transcurridos × días del periodo. Conservador y optimista mantienen lo realizado y varían solo el tramo futuro en ±'+model.spread*100+'%. Hipótesis uniforme, sin estacionalidad ni probabilidad de cierre.</p></details>';
 }
 if(page==='overview'&&m.totals.wonCount===0&&!failures.opportunities)body=body.replace(/<svg class="analytics-sales-svg"[\s\S]*?<\/svg>/,'<div class="performance-empty">Sin ventas ganadas registradas en este periodo.</div>');
 if(page==='overview'&&m.totals.wonCount===0&&m.totals.expenses===0&&!failures.opportunities&&!failures.expenses)body=body.replace(/<svg class="analytics-bar-svg"[^>]*aria-labelledby="analytics-profit-title[\s\S]*?<\/svg>/,'<div class="performance-empty">Sin actividad financiera registrada en este periodo.</div>');
 if(page==='forecast'&&scenarios)body+='<article class="analytics-chart"><h3>Ventas reales y escenarios futuros</h3><p>Conservador · coral / Base · violeta / Optimista · turquesa</p>'+salesChart(m,!failures.opportunities,!failures.goals,scenarios)+'</article>';
 return '<section class="performance-workspace" aria-labelledby="performance-heading" data-performance-workspace>'+header+nav+(Object.values(failures).some(Boolean)?'<p class="analytics-data-notice">Información parcial: hay fuentes pendientes de carga.</p>':'')+body+'</section>';
}

export function performanceCSV(data,options={}){
 const model=performanceModel(data,options);if(Object.values(model.failures).some(Boolean))return null;
 let rows,headers;
 if(options.page==='sales'){headers=['Fecha','Operación','Institución','Ejecutivo','Producto / solución','Venta PEN','Clasificación'];rows=model.sales.map(r=>[r.expected_close_date,r.name||r.title,r.institutionName,r.ownerName,r.productName,Number(r.value),'REAL']);}
 else if(options.page==='budget'){headers=['Fecha','Concepto','Categoría','Gasto PEN','Clasificación'];rows=model.expenses.map(r=>[r.expense_date,r.description||r.concept,r.category,Number(r.amount),'REAL']);}
 else if(options.page==='forecast'){headers=['Escenario','Cierre PEN','Clasificación'];rows=Object.entries(model.scenarios||{}).map(([k,v])=>[k,v,'PROYECTADA']);}
 else {headers=['Mes','Ventas PEN','Costos directos PEN','Gastos PEN','Resultado PEN','Margen %','Clasificación'];rows=model.m.series.map(r=>[r.key,r.sales,r.directCosts,r.expenses,r.operatingResult,r.operatingMarginPercent,r.isFuture?'NO DISPONIBLE':'CALCULADA']);}
 return '\uFEFF'+[headers.concat(['Origen','Corte Lima']),...rows.map(r=>r.concat([options.demo?'DEMOSTRACIÓN':'DATOS REALES',model.m.period.cutoff]))].map(r=>r.map(cell).join(',')).join('\r\n');
}
