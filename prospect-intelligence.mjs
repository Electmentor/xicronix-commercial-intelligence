import {PI_STATE_LABELS,DIMENSIONS,EVIDENCE_LABELS,dimensionScore,confidenceScore,canTransition} from './prospect-intelligence-domain.mjs';
import {createPiRepository} from './prospect-intelligence-supabase.mjs';
import {escapeText as esc,safeUrl,sourceLink,filterCases,RESOLUTION_LABELS,dateLabel} from './pi-discovery-view.mjs';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('demo')==='1';
let repo,context,rows=[],selected=null,view='organizations',editing=null,pending=null,busy=false;
const canWrite=()=>!demo&&['ADMIN','MANAGER','SALES'].includes(context?.profile?.role);
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function selectedCase(){return rows.find(r=>r.id===selected);}
function score(row){return dimensionScore({dimensions:row.dimensions});}
function confidence(row){return confidenceScore({dimensions:row.dimensions,evidence:row.evidence.map(e=>({type:e.evidence_type,source:e.source,url:e.source_url,critical:e.critical}))});}
function badge(state){return '<span class="badge">'+esc(PI_STATE_LABELS[state]||state)+'</span>';}
const demoRows=[{id:'demo-1',state:'RESEARCHING',organization_name:'[SIMULADO] Instituto Horizonte',organization_type:'INSTITUTE',organization_city:'Lima',organization_country:'Perú',sector:'Educación',hypothesis:'Podría necesitar renovar su laboratorio. Pendiente de validación.',dimensions:{F:3,N:2,C:0,T:1,A:0,E:1},next_action:'Verificar alcance y presupuesto',signals:[{label:'Ejemplo de anuncio de renovación',source:'Fuente ficticia',source_url:'',observed_at:'2026-09-21',metadata:{published_on:'2026-09-20'}}],evidence:[{evidence_type:'HYPOTHESIS',note:'Ejemplo didáctico sin respaldo de una organización real.',source:'Demostración',source_url:'',created_at:'2026-09-21'}]}];
async function reload(){
 $('newCase').disabled=true;
 try{
  if(demo){rows=demoRows;status('DEMOSTRACIÓN · Datos ficticios. No se guardan ni se transfieren al CRM.');}
  else{
   repo??=createPiRepository(window.supabase,{url:'https://rmximatxuaczhpqbcuho.supabase.co',publishableKey:'sb_publishable_pqqyMTcBovUi4sbp2Cn6yw_sL0_Xs__'});
   context=await repo.currentContext();
   if(!context?.profile){rows=[];selected=null;render();status('Inicia sesión en CRM DEV y vuelve a esta página. También puedes explorar la demostración de solo lectura.');$('caseList').innerHTML='<p class="empty"><a href="index.html">Ingresar a CRM DEV</a><br><br><a href="?demo=1">Ver demostración</a></p>';return;}
   const cases=await repo.listCases(context.profile.organization_id);
   rows=await Promise.all(cases.map(async row=>({...row,signals:await repo.listSignals(row.id),evidence:await repo.listEvidence(row.id)})));
   status('CRM DEV conectado · '+(context.profile.full_name||'Tu cuenta')+' · Investigación separada de ejemplos simulados.');
  }
  $('newCase').disabled=!canWrite();render();
 }catch(error){rows=[];selected=null;render();status('No se pudieron cargar los datos. '+(error.message||'Vuelve a intentarlo.'),true);}
}
function visible(){return filterCases(rows,$('search').value,$('stateFilter').value,demo?'synthetic':$('kindFilter').value);}
function render(){
 const filtered=visible();
 if(!filtered.some(r=>r.id===selected))selected=filtered[0]?.id||null;
 $('kpis').innerHTML=[['Organizaciones',filtered.length],['Señales documentadas',filtered.reduce((n,r)=>n+r.signals.length,0)],['Transferidas al CRM',filtered.filter(r=>r.state==='TRANSFERRED').length]].map(([l,n])=>'<article class="metric"><span>'+l+'</span><strong>'+n+'</strong><small>Según filtros actuales</small></article>').join('');
 $('resultCount').textContent=filtered.length+' resultados';
 $('viewTitle').textContent=view==='signals'?'Señales del mercado':'Descubrir oportunidades';
 $('listTitle').textContent=view==='signals'?'Fuentes que merecen atención':'Organizaciones';
 $('orgView').classList.toggle('active',view==='organizations');$('signalView').classList.toggle('active',view==='signals');
 const entries=view==='signals'?filtered.flatMap(r=>r.signals.map(s=>({r,s}))).sort((a,b)=>new Date(b.s.observed_at)-new Date(a.s.observed_at)):filtered.map(r=>({r}));
 $('caseList').innerHTML=entries.map(({r,s})=>'<button class="prospect-row '+(selected===r.id?'selected':'')+'" data-case="'+esc(r.id)+'"><span class="row-top"><b>'+esc(r.organization_name)+'</b>'+badge(r.state)+'</span><small>'+esc([r.sector,r.organization_city].filter(Boolean).join(' · '))+'</small><p>'+esc(s?s.label:r.hypothesis||'Hipótesis pendiente')+'</p><span class="row-bottom">'+(s?esc(s.source||'Fuente pendiente')+' · '+dateLabel(s.observed_at):r.signals.length+' señales · '+r.evidence.length+' evidencias')+'</span></button>').join('')||'<p class="empty">No hay resultados. Prueba otros filtros o registra una organización.</p>';
 document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>{selected=b.dataset.case;render();});
 renderDetail();
}
function renderDetail(){
 const r=selectedCase();if(!r){$('detail').innerHTML='<p class="empty">Selecciona una organización para revisar su evidencia.</p>';return;}
 const editable=canWrite()&&r.state!=='TRANSFERRED';
 const missing=r.evidence.filter(e=>e.evidence_type==='MISSING_DATA');
 $('detail').innerHTML='<header class="org-head"><div><div class="eyebrow">EXPEDIENTE DE INVESTIGACIÓN</div><h2>'+esc(r.organization_name)+'</h2><p>'+esc([r.sector,r.organization_city,r.organization_country].filter(Boolean).join(' · '))+'</p>'+sourceLink(r.organization_website,'Sitio institucional')+'</div>'+badge(r.state)+'</header><div class="detail-body">'+
 '<section class="callout"><span class="chip HYPOTHESIS">Hipótesis comercial · por validar</span><h3>¿Por qué investigar esta organización?</h3><p>'+esc(r.hypothesis||'Aún no se registró una hipótesis.')+'</p></section>'+
 '<div class="inline-actions"><button class="btn" id="editCase" '+(!editable?'disabled':'')+'>Editar análisis</button><button class="btn" id="addSignal" '+(!editable?'disabled':'')+'>+ Registrar señal</button><button class="btn" id="addEvidence" '+(!editable?'disabled':'')+'>+ Añadir evidencia</button></div>'+
 '<section><h3>Señales y fuentes</h3><div class="source-list">'+r.signals.map(s=>'<article class="evidence-item"><b>'+esc(s.label)+'</b><p>'+esc(s.source||'Sin fuente')+'</p><small>Fecha de publicación: '+dateLabel(s.metadata?.published_on)+' · Observada: '+dateLabel(s.observed_at)+'</small><p>'+sourceLink(s.source_url)+'</p></article>').join('')+(r.signals.length?'':'<p class="muted">Registra una señal con fuente y fecha.</p>')+'</div></section>'+
 '<section><h3>Evidencia y límites de lo que sabemos</h3><div class="source-list">'+r.evidence.map(e=>'<article class="evidence-item"><header><span class="chip '+esc(e.evidence_type)+'">'+esc(EVIDENCE_LABELS[e.evidence_type]||e.evidence_type)+'</span><small>'+dateLabel(e.created_at)+'</small></header><p>'+esc(e.note)+'</p><small>'+esc(e.source||'Sin fuente')+'</small><p>'+sourceLink(e.source_url)+'</p>'+(e.critical?'<b class="danger">Contradicción crítica pendiente</b>':'')+'</article>').join('')+(r.evidence.length?'':'<p class="muted">No hay evidencia registrada.</p>')+'</div></section>'+
 '<details><summary>Evaluación explicable · F / N / C / T / A / E</summary><p class="muted">Evaluación manual de 0 a 5. Cero significa sin evaluar o sin sustento. Los índices son reglas orientativas, no probabilidades de venta.</p><div class="dimensions">'+Object.entries(DIMENSIONS).map(([key,d])=>'<article class="dimension"><header><b>'+key+'</b><span>'+esc(d.label)+'</span></header><strong>'+Number(r.dimensions?.[key]||0)+'/5</strong><small>'+esc(d.description)+'</small></article>').join('')+'</div><p>Índice de potencial: '+score(r)+'/100 · Índice de sustento: '+confidence(r)+'/100</p><p class="muted">Regla v0.1: potencial = F 25 %, N 20 %, C 15 %, T 15 %, A 10 %, E 15 %. Sustento = 20 + hasta 30 por fuentes trazables + hasta 20 por hechos/confirmaciones + E × 12 − 30 por contradicción crítica; limitado a 0–100. No mide independencia entre fuentes.</p></details>'+
 '<section class="callout"><h3>Antes de activar el seguimiento</h3><p>'+esc(r.next_action||'Define una siguiente acción.')+'</p><p>Fecha propuesta: '+dateLabel(r.next_action_date)+'</p><p>Datos faltantes: '+esc(missing.map(e=>e.note).join(' · ')||'Revisar y registrar lo que falta confirmar.')+'</p></section>'+
 '<div class="actions"><select id="nextState" aria-label="Cambiar estado" '+(!editable?'disabled':'')+'>'+Object.entries(PI_STATE_LABELS).filter(([k])=>k===r.state||(canTransition(r.state,k)&&!['READY_FOR_CRM','TRANSFERRED'].includes(k))).map(([k,v])=>'<option value="'+k+'" '+(k===r.state?'selected':'')+'>'+v+'</option>').join('')+'</select><button id="changeState" class="btn" '+(!editable?'disabled':'')+'>Actualizar estado</button><button id="prepare" class="btn primary" '+(!editable?'disabled':'')+'>Revisar transferencia al CRM</button></div>'+
 (r.state==='TRANSFERRED'?'<p>Transferencia registrada. '+(r.crm_lead_id?'<a href="index.html?lead='+encodeURIComponent(r.crm_lead_id)+'">Abrir prospecto en CRM</a>':'<a href="index.html">Abrir CRM DEV</a>')+'</p>':'')+'</div>';
 $('editCase').onclick=()=>openEditor('case',r);$('addSignal').onclick=()=>openEditor('signal',r);$('addEvidence').onclick=()=>openEditor('evidence',r);
 $('changeState').onclick=()=>perform(async()=>{await repo.transition(r.id,$('nextState').value);await reload();});
 $('prepare').onclick=()=>prepare(r);
}
async function perform(action){if(busy)return;busy=true;try{await action();}catch(e){status(e.message||'No se pudo guardar.',true);}finally{busy=false;}}
function input(name,label,value='',type='text',required=false){return '<label>'+esc(label)+(required?' *':'')+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?'required':'')+'></label>';}
function textarea(name,label,value='',required=false){return '<label class="full">'+esc(label)+(required?' *':'')+'<textarea name="'+name+'" '+(required?'required':'')+'>'+esc(value)+'</textarea></label>';}
function openEditor(kind,row=null){
 if(!canWrite())return;editing={kind,id:kind==='case'?row?.id:null,caseId:row?.id};$('formStatus').textContent='';
 $('editorTitle').textContent=kind==='case'?(row?'Editar análisis':'Registrar organización'):kind==='signal'?'Registrar una señal':'Añadir evidencia';
 if(kind==='case'){
  $('formFields').innerHTML=input('organization_name','Organización',row?.organization_name,'text',true)+'<label>Tipo de organización<select name="organization_type">'+Object.entries({UNIVERSITY:'Universidad',SCHOOL:'Colegio',INSTITUTE:'Instituto',CLINIC:'Clínica',HOSPITAL:'Hospital',COMPANY:'Empresa',GOVERNMENT:'Gobierno',RESEARCH_CENTER:'Centro de investigación',OTHER:'Otro'}).map(([k,v])=>'<option value="'+k+'" '+(k===(row?.organization_type||'OTHER')?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+input('sector','Sector',row?.sector||'Educación')+input('organization_country','País',row?.organization_country||'Perú')+input('organization_city','Ciudad',row?.organization_city)+input('organization_website','Sitio institucional',row?.organization_website,'url')+textarea('hypothesis','Hipótesis comercial, aún por validar',row?.hypothesis)+textarea('next_action','Siguiente acción propuesta',row?.next_action)+input('next_action_date','Fecha de seguimiento',row?.next_action_date?new Date(new Date(row.next_action_date).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'','datetime-local')+textarea('transfer_reason','Motivo para transferir al CRM',row?.transfer_reason)+'<fieldset class="full"><legend>Evaluación manual · 0 = sin evaluar</legend>'+Object.entries(DIMENSIONS).map(([k,d])=>'<label>'+k+' · '+esc(d.label)+'<input name="dim_'+k+'" type="number" min="0" max="5" step="1" value="'+Number(row?.dimensions?.[k]||0)+'" required></label>').join('')+'</fieldset>';
 }else if(kind==='signal'){
  $('formFields').innerHTML=textarea('label','Qué publicó o anunció la organización','',true)+input('source','Nombre de la fuente','','text',true)+input('source_url','Enlace a la publicación','','url',true)+input('published_on','Fecha de publicación','','date',true)+'<p class="muted full">El registro conserva por separado la fecha de publicación y la fecha en que observaste la señal. Registrar una señal no confirma una intención de compra.</p>';
 }else{
  $('formFields').innerHTML='<label>Tipo de afirmación<select name="evidence_type">'+Object.entries(EVIDENCE_LABELS).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>'+input('source','Fuente o autor del análisis')+textarea('note','Afirmación y límites de la evidencia','',true)+input('source_url','Enlace de respaldo','','url')+'<label>¿Contradicción crítica?<select name="critical"><option value="false">No</option><option value="true">Sí, impide transferir</option></select></label><p class="muted full">Un hecho o confirmación necesita fuente y enlace. Una hipótesis expresa algo que todavía hay que comprobar.</p>';
 }
 $('editor').showModal();
}
$('editForm').onsubmit=async e=>{
 e.preventDefault();if(busy||!canWrite())return;busy=true;$('save').disabled=true;$('formStatus').textContent='Guardando…';
 try{
  const f=Object.fromEntries(new FormData(e.currentTarget));for(const k of Object.keys(f))f[k]=f[k].trim();
  if(editing.kind==='case'){
   const dimensions=Object.fromEntries(Object.keys(DIMENSIONS).map(k=>[k,Number(f['dim_'+k])]));
   if(Object.values(dimensions).some(n=>!Number.isInteger(n)||n<0||n>5))throw Error('Revisa los valores de evaluación.');
   const values={organization_name:f.organization_name,organization_type:f.organization_type,organization_country:f.organization_country,sector:f.sector,organization_city:f.organization_city,organization_website:f.organization_website||null,hypothesis:f.hypothesis,next_action:f.next_action,next_action_date:f.next_action_date?new Date(f.next_action_date).toISOString():null,transfer_reason:f.transfer_reason,dimensions};
   const saved=await repo.saveCase(values,editing.id);selected=saved.id;
  }else if(editing.kind==='signal'){
   if(!safeUrl(f.source_url))throw Error('Usa un enlace HTTP o HTTPS válido.');
   await repo.addObservation('pi_signals',editing.caseId,{label:f.label,source:f.source,source_url:f.source_url,observed_at:new Date().toISOString(),metadata:{published_on:f.published_on}});
  }else{
   if(['FACT','CONFIRMATION'].includes(f.evidence_type)&&(!f.source||!safeUrl(f.source_url)))throw Error('Un hecho o confirmación necesita fuente y enlace válido.');
   if(f.source_url&&!safeUrl(f.source_url))throw Error('Enlace no válido.');
   await repo.addObservation('pi_evidence',editing.caseId,{evidence_type:f.evidence_type,note:f.note,source:f.source||null,source_url:f.source_url||null,critical:f.evidence_type==='CONTRADICTION'&&f.critical==='true'});
  }
  $('editor').close();await reload();status('Registro guardado en CRM DEV.');
 }catch(err){$('formStatus').textContent=err.message||'No se pudo guardar. Tus datos siguen en el formulario.';}
 finally{busy=false;$('save').disabled=false;}
};
async function prepare(r){
 if(!canWrite()||busy)return;busy=true;
 try{
  const gate=await repo.readiness(r.id);
  const labels={identity:'Identidad',hypothesis:'Hipótesis',need:'Necesidad ≥ 3',evidence:'Evidencia trazable',fit:'Encaje ≥ 3',potential:'Potencial ≥ 60',confidence:'Sustento ≥ 60',next_action:'Siguiente acción',contradiction:'Sin contradicción crítica',duplicate:'Identidad sin ambigüedad'};
  if(!gate.ready||!['PRIORITIZED','READY_FOR_CRM'].includes(r.state)||!r.next_action_date||!r.transfer_reason){
   pending=null;$('execute').disabled=true;
   $('transferSummary').innerHTML='<p>Completa la investigación antes de transferir.</p><ul class="checklist">'+Object.entries(gate.checks).map(([k,ok])=>'<li>'+ (ok?'✓ ':'Pendiente: ')+esc(labels[k]||k)+'</li>').join('')+'</ul><p>Además: estado Priorizado, fecha de seguimiento y motivo de transferencia.</p>';
  }else{
   const result=await repo.prepareTransfer(r.id);pending=result.transfer_id;const p=result.payload;
   $('execute').disabled=false;
   $('transferSummary').innerHTML='<h3>'+esc(p.organization_identity.name)+'</h3><p><b>Hipótesis:</b> '+esc(p.commercial_hypothesis)+'</p><p><b>Qué ocurrirá:</b> '+esc(RESOLUTION_LABELS[p.duplicate_resolution.action]||p.duplicate_resolution.action)+'</p><p><b>Responsable de la tarea:</b> '+esc(context.profile.full_name||context.session.user.email)+'</p><p><b>Siguiente acción:</b> '+esc(p.suggested_next_action)+' · '+dateLabel(p.suggested_next_action_date)+'</p><p><b>Motivo:</b> '+esc(p.transfer_reason)+'</p><h4>Evidencia que conservará el CRM</h4><ul>'+p.evidence.map(e=>'<li>'+esc(EVIDENCE_LABELS[e.evidence_type]||e.evidence_type)+': '+esc(e.note)+' '+sourceLink(e.source_url)+'</li>').join('')+'</ul><p class="muted">Confirma solo si el caso merece seguimiento comercial. No se enviarán mensajes a la organización.</p>';
  }
  $('transferStatus').textContent='';$('transfer').showModal();
 }catch(e){status(e.message,true);}finally{busy=false;}
}
$('execute').onclick=async()=>{
 if(busy||!pending||!canWrite())return;busy=true;$('execute').disabled=true;
 try{await repo.executeTransfer(pending);pending=null;$('transfer').close();await reload();status('Transferencia completada en CRM DEV. Se conservó la evidencia y se creó la tarea de seguimiento.');}
 catch(e){$('transferStatus').textContent=e.message||'No se pudo transferir. Cierra y revisa nuevamente el caso.';}
 finally{busy=false;}
};
$('closeEditor').onclick=()=>$('editor').close();$('closeTransfer').onclick=()=>{$('transfer').close();pending=null;};
$('newCase').onclick=()=>openEditor('case');$('reload').onclick=reload;
$('search').oninput=render;$('stateFilter').onchange=render;$('kindFilter').onchange=render;
$('stateFilter').innerHTML+=[...Object.entries(PI_STATE_LABELS)].map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');
$('orgView').onclick=()=>{view='organizations';render();};$('signalView').onclick=()=>{view='signals';render();};
if(demo){$('kindFilter').value='synthetic';$('kindFilter').disabled=true;}
reload();
