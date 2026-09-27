import {escapeHTML as esc, money} from './domain.mjs';
import {analyticsMetrics, businessDay} from './analytics.mjs';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const rank={ACTION_NOW:5,RESEARCH_FIRST:4,STRATEGIC_WATCH:3,REVALIDATE:2,MONITOR:1};
const buckets={ACTION_NOW:'Acción ahora',RESEARCH_FIRST:'Investigar',STRATEGIC_WATCH:'Vigilancia',REVALIDATE:'Revalidar',MONITOR:'Monitorear'};
const stages={NEW:'Nuevo',RESEARCHING:'Investigación',DETECTED:'Detectada',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactado',QUALIFIED:'Calificado',OPPORTUNITY:'Oportunidad',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida',CONVERTED:'Convertido',DISQUALIFIED:'Descartado'};
const colors=['#287bea','#39a9ec','#e8b728','#ed8e39','#f06273','#14b890'];
const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
const empty=text=>'<p class="director-insight-empty">'+esc(text)+'</p>';
const panel=(title,action,body)=>'<article class="director-panel director-insight-panel"><header><h2>'+title+'</h2>'+action+'</header>'+body+'</article>';

export function directorGeography(data){
 const aggregates=data.territorialDepartment||[];
 const source=aggregates.length?'territorial':(data.prospects||[]).length?'prospects':'institutions';
 const counts=new Map();
 const rows=source==='territorial'?aggregates:source==='prospects'?data.prospects:data.institutions||[];
 for(const row of rows){
  const label=normalize(source==='territorial'?row.group_key:row.department||row.region)||'SIN REGIÓN';
  const count=source==='territorial'?Math.max(0,numeric(row.physical_accounts)):1;
  counts.set(label,(counts.get(label)||0)+count);
 }
 const total=[...counts.values()].reduce((a,b)=>a+b,0);
 return {source,total,unit:source==='territorial'?'sedes procesadas':source==='prospects'?'candidatos':'instituciones',regions:[...counts].map(([label,count])=>({label,count,percent:total?count/total*100:0})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))};
}

export function directorPriorityProspects(data){
 return [...(data.prospects||[])].sort((a,b)=>(rank[b.operating_bucket]||0)-(rank[a.operating_bucket]||0)||numeric(b.xwin_score)-numeric(a.xwin_score)||numeric(b.xpps_score)-numeric(a.xpps_score)).slice(0,5).map(row=>{
  const lead=(data.leads||[]).find(lead=>lead.id===row.lead_id)||(row.institution_id?(data.leads||[]).find(lead=>lead.institution_id===row.institution_id&&!['CONVERTED','DISQUALIFIED'].includes(lead.status)):null);
  const opp=(data.opportunities||[]).filter(opp=>!['WON','LOST'].includes(opp.stage)&&((lead&&opp.lead_id===lead.id)||(row.institution_id&&opp.institution_id===row.institution_id))).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0];
  return {row,stage:stages[opp?.stage||lead?.status]||'Sin etapa CRM'};
 });
}

export function directorRecentSignals(data,now=new Date()){
 const cutoff=businessDay(now);
 const validDate=value=>value&&Number.isFinite(Date.parse(value))?businessDay(new Date(String(value).length===10?value+'T12:00:00Z':value)):null;
 return (data.radar||[]).filter(row=>row.classification!=='DISCARD').map(row=>({row,day:validDate(row.signal_date||row.created_at)})).filter(item=>!item.day||item.day<=cutoff).sort((a,b)=>(b.day||'').localeCompare(a.day||'')||numeric(b.row.weighted_score)-numeric(a.row.weighted_score)).slice(0,4);
}

export function renderDirectorInsights(data,{now=new Date(),failures={},pipeline=[]}={}){
 const analytics=analyticsMetrics(data,{now,period:'month'});
 const stageMissing=!!(failures.leads||failures.opportunities);
 const max=Math.max(1,...pipeline.map(([,count])=>count));
 const bars=stageMissing?empty('Etapas pendientes de cargar. Actualiza los datos.'):'<div class="director-stage-chart" role="img" aria-label="Volumen por etapa: '+esc(pipeline.map(([label,count])=>label+' '+count).join(', '))+'">'+pipeline.map(([label,count],i)=>'<div class="director-stage-column"><div class="director-stage-track"><span style="height:'+Math.max(count?3:0,count/max*100)+'%;--stage-color:'+colors[i]+'"><b>'+count+'</b></span></div><small>'+esc(label)+'</small></div>').join('')+'</div><p class="director-insight-note">Mismos conteos del pipeline superior. Ganadas del mes; las primeras etapas incluyen prospectos.</p>';
 const series=analytics.series,width=520,height=208,left=65,right=22,top=24,bottom=36;
 const salesMax=Math.max(1000,...series.map(row=>row.sales||0))*1.15;
 const x=i=>left+i*(width-left-right)/5,y=value=>top+(1-value/salesMax)*(height-top-bottom);
 const points=series.map((row,i)=>x(i)+','+y(row.sales||0)).join(' ');
 const ticks=Array.from({length:4},(_,i)=>salesMax*i/3);
 const chart=failures.opportunities?empty('Ventas pendientes de cargar. No se representan como cero.'):'<svg class="director-sales-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Ventas ganadas en soles, últimos seis meses"><title>Ventas ganadas por mes</title>'+ticks.map(v=>'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="director-chart-grid"/><text x="'+(left-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+(v>=1000?'S/ '+(v/1000).toLocaleString('es-PE',{maximumFractionDigits:1})+' mil':'S/ '+Math.round(v))+'</text>').join('')+'<polygon class="director-sales-area" points="'+left+','+y(0)+' '+points+' '+x(5)+','+y(0)+'"/><polyline class="director-sales-line" points="'+points+'"/>'+series.map((row,i)=>'<circle cx="'+x(i)+'" cy="'+y(row.sales||0)+'" r="4" tabindex="0"><title>'+esc(row.label+': '+money(row.sales||0))+'</title></circle><text x="'+x(i)+'" y="'+(height-10)+'" text-anchor="middle">'+esc(row.label)+'</text>').join('')+'</svg><p class="director-insight-note">Ventas ganadas según cierre previsto · PEN · mes actual al '+esc(businessDay(now))+'. No son cobros.</p><details class="director-insight-data"><summary>Ver importes mensuales</summary><dl>'+series.map(row=>'<div><dt>'+esc(row.label)+'</dt><dd>'+esc(money(row.sales||0))+'</dd></div>').join('')+'</dl></details>';
 const prospectMissing=!!(failures.prospects||failures.leads||failures.opportunities);
 const priorities=directorPriorityProspects(data);
 const prospects=prospectMissing?empty('Prospectos o etapas pendientes de cargar.'):!priorities.length?empty('No hay candidatos registrados en Prospect Intelligence.'):'<div class="director-insight-table"><table><thead><tr><th>Institución</th><th>Ubicación</th><th>Etapa</th><th>Prioridad</th></tr></thead><tbody>'+priorities.map(({row,stage})=>'<tr><td><button data-director-prospect="'+esc(row.id)+'">'+esc(row.name||row.institution_name||row.canonical_name||'Sin nombre')+'</button></td><td>'+esc(row.district||row.city||row.department||row.region||'Sin ubicación')+'</td><td>'+esc(stage)+'</td><td><span class="director-insight-priority '+(row.operating_bucket==='ACTION_NOW'?'high':'review')+'">'+esc(buckets[row.operating_bucket]||'Sin clasificar')+'</span></td></tr>').join('')+'</tbody></table></div><p class="director-insight-note">Prioridad operativa de Prospect Intelligence; etapa solo cuando existe un registro CRM vinculado.</p>';
 const geography=directorGeography(data),geoMissing=!!failures[geography.source];
 const regions=geography.regions.slice(0,5),rest=geography.regions.slice(5).reduce((sum,row)=>sum+row.count,0);
 if(rest)regions.push({label:'OTRAS REGIONES',count:rest,percent:rest/geography.total*100});
 const geographyBody=geoMissing?empty('Distribución territorial pendiente de cargar.'):!geography.total?empty('No hay registros con los que calcular la distribución.'):'<div class="director-geography"><div id="directorCoverageMap" class="director-coverage-map" aria-label="Mapa de cobertura por departamento"><span>El detalle regional está disponible en la lista.</span></div><ul>'+regions.map(row=>'<li><span>'+esc(row.label)+'</span><strong>'+row.percent.toLocaleString('es-PE',{maximumFractionDigits:1})+'%</strong><small>'+row.count.toLocaleString('es-PE')+'</small></li>').join('')+'</ul></div><p class="director-insight-note">'+geography.total.toLocaleString('es-PE')+' '+geography.unit+' · cobertura registrada, no cuota de mercado. Ubicaciones aproximadas por departamento.</p>';
 const signals=directorRecentSignals(data,now);
 const signalBody=failures.radar?empty('Señales pendientes de cargar.'):!signals.length?empty('No hay señales vigentes registradas.'):'<div class="director-recent-signals">'+signals.map(({row,day})=>'<button data-director-signal="'+esc(row.id)+'"><i class="'+(row.classification==='CRITICAL'?'critical':'')+'" aria-hidden="true"></i><span><strong>'+esc(row.signal_summary||row.institution_name||'Señal comercial')+'</strong><small>'+esc(row.institution_name||'Institución sin identificar')+'</small></span><span>'+esc(row.source_name||row.source_type||'Radar comercial')+'</span><time'+(day?' datetime="'+day+'"':'')+'>'+esc(day===businessDay(now)?'Hoy':day||'Sin fecha')+'</time></button>').join('')+'</div>';
 return '<section class="director-desktop-insights" aria-label="Inteligencia comercial de Dirección"><div class="director-insight-grid">'+
 panel('Oportunidades por etapa','<button data-page="opportunities">Ver detalle →</button>',bars)+
 panel('Ventas <small>(últimos 6 meses)</small>','<button data-director-target="analytics">Ver reporte →</button>',chart)+
 panel('Prospectos prioritarios','<button data-page="prospects">Ver todos →</button>',prospects)+
 panel('Distribución geográfica','<button data-director-target="territory">Ver mapa →</button>',geographyBody)+
 '</div>'+panel('Señales y oportunidades recientes','<button data-page="radar">Ver todas las señales →</button>',signalBody)+'</section>';
}
