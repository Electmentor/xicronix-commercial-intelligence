/* Production navigation. Same Supabase session/RLS; no service keys or stored customer data. */
'use strict';
const SUPABASE_URL = 'https://qzfprdhmcaucqcdqgqiz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK';
const xicronixRecoveryLink = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
const xicronixAuthLinkError = new URLSearchParams(location.hash.slice(1)).has('error') || new URLSearchParams(location.hash.slice(1)).has('error_code');
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $ = id => document.getElementById(id);
let mode='login', session=null, profile=null;
function authMode(next){ mode=next; } // Enhanced by the unchanged auth-access.js.
const modules={
 institutions:{label:'Instituciones',field:'type',hint:'Instituciones registradas. Una solicitud web puede existir antes de vincularla a una institución.',columns:['Institución','Tipo','Ciudad','Contacto'],select:'id,organization_id,name,type,city,email,phone,website,notes,created_at'},
 contacts:{label:'Contactos',field:'decision_level',hint:'Contactos vinculados al CRM. Los datos de una nueva solicitud web también están disponibles en el detalle del lead.',columns:['Contacto','Institución','Cargo','Correo / teléfono'],select:'id,organization_id,institution_id,first_name,last_name,job_title,email,phone,decision_level,notes,created_at'},
 leads:{label:'Leads',field:'status',hint:'Solicitudes y prospectos registrados. Abre un lead para consultar la solicitud original y su siguiente acción.',columns:['Solicitud','Estado','Origen','Próxima acción'],select:'id,organization_id,institution_id,contact_id,title,source,status,next_action,next_action_date,created_at'},
 opportunities:{label:'Oportunidades',field:'stage',hint:'Oportunidades registradas; recibir una solicitud no equivale a una venta confirmada.',columns:['Oportunidad','Etapa','Valor registrado','Próxima acción'],select:'id,organization_id,institution_id,contact_id,lead_id,name,stage,value,next_action,next_action_date,created_at'},
 tasks:{label:'Tareas',field:'status',hint:'Tareas guardadas en el CRM. Las fechas se muestran en hora de Lima.',columns:['Tarea','Estado','Prioridad','Fecha límite'],select:'id,organization_id,institution_id,contact_id,lead_id,opportunity_id,title,status,priority,due_at,notes,created_at'}
};
const labels={NEW:'Nuevo',RESEARCHING:'En investigación',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactado',QUALIFIED:'Calificado',DISQUALIFIED:'Descartado',CONVERTED:'Convertido',DETECTED:'Detectada',OPPORTUNITY:'Oportunidad',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida',PENDING:'Pendiente',IN_PROGRESS:'En curso',COMPLETED:'Completada',CANCELLED:'Cancelada',OVERDUE:'Vencida',LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica',SCHOOL:'Colegio',UNIVERSITY:'Universidad',INSTITUTE:'Instituto',CLINIC:'Clínica',HOSPITAL:'Hospital',COMPANY:'Empresa',GOVERNMENT:'Gobierno',RESEARCH_CENTER:'Centro de investigación',OTHER:'Otro',UNKNOWN:'Sin identificar',USER:'Usuario',INFLUENCER:'Influyente',RECOMMENDER:'Recomendador',DECISION_MAKER:'Decisor',FINAL_APPROVER:'Aprobador final',WEBSITE:'Formulario web'};
let data={}, failures={}, page='dashboard', offset=0, version=0, detailVersion=0, loading=false, enteredUser=null, selectedLead=null;
const pageSize=20;
const nameOf=r=>r.name||r.title||[r.first_name,r.last_name].filter(Boolean).join(' ')||'Sin nombre';
const text=v=>v===null||v===undefined||v===''?'—':String(v);
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const label=v=>labels[v]||text(v);
const date=v=>{if(!v)return 'Sin fecha';const d=new Date(v);return Number.isNaN(d.getTime())?'Fecha no válida':new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(d);};
const money=v=>v===null||v===undefined?'Sin registrar':new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(v));
const directlySimulated=r=>/\[SIMULADO\]|SIMULADO_XICRONIX_V1/i.test([r.name,r.title,r.first_name,r.last_name,r.notes].join(' '));
function simulated(r){
 if(directlySimulated(r))return true;
 return ['institution_id','contact_id','lead_id','opportunity_id'].some(key=>{
  const table={institution_id:'institutions',contact_id:'contacts',lead_id:'leads',opportunity_id:'opportunities'}[key];
  return r[key]&&(data[table]||[]).some(parent=>parent.id===r[key]&&directlySimulated(parent));
 });
}
const visible=table=>(data[table]||[]).filter(r=>$('includeDemo').checked||!simulated(r));
function notice(message,error=false){$('workspaceStatus').textContent=message;$('workspaceStatus').className='notice'+(error?' error':'')+(message?'':' hidden');}
function resetViews(){
 version++;detailVersion++;loading=false;enteredUser=null;data={};failures={};profile=null;
 $('recordRows').replaceChildren();$('recentLeads').replaceChildren();$('recentTasks').replaceChildren();$('detailContent').replaceChildren();$('webDetail').replaceChildren();
 for(const id of ['recordDialog','institutionDialog'])if($(id).open)$(id).close();
 for(const id of ['metricInstitutions','metricLeads','metricOpportunities','metricTasks'])$(id).textContent='—';
}
function initialPage(){
 const params=new URLSearchParams(location.search);
 const id=params.get('lead');
 selectedLead=id&&/^[0-9a-f-]{36}$/i.test(id)?id:null;
 const hash=location.hash.slice(1);
 return selectedLead?'leads':hash==='dashboard'||modules[hash]?hash:'dashboard';
}
function navigate(next,{history=true,focus=false}={}){
 if(next!=='dashboard'&&!modules[next])return;
 if(next!==page){$('search').value='';offset=0;}
 page=next;
 if(next!=='leads')selectedLead=null;
 document.querySelectorAll('[data-page]').forEach(btn=>{const active=btn.dataset.page===next;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
 $('pageTitle').textContent=next==='dashboard'?'Dashboard':modules[next].label;
 $('dashboard').classList.toggle('hidden',next!=='dashboard');$('recordsView').classList.toggle('hidden',next==='dashboard');
 $('topNew').classList.toggle('hidden',!['dashboard','institutions'].includes(next)||!profile||!['ADMIN','MANAGER','SALES'].includes(profile.role));
 if(history){const url=new URL(location.href);url.hash=next;if(!selectedLead)url.searchParams.delete('lead');window.history.pushState({page:next},'',url);}
 if(next!=='dashboard'){setFilter();$('moduleHint').textContent=modules[next].hint;$('search').placeholder='Buscar en '+modules[next].label.toLowerCase()+'…';}
 render();if(focus)$('pageTitle').focus({preventScroll:true});
}
function setFilter(){
 const field=modules[page].field, previous=$('filterType').value;
 const choices=[...new Set(visible(page).map(r=>r[field]).filter(Boolean))].sort();
 $('filterType').replaceChildren(new Option('Todos',''),...choices.map(v=>new Option(label(v),v)));
 $('filterType').value=choices.includes(previous)?previous:'';
}
function cell(row,value){const td=document.createElement('td');td.textContent=text(value);row.append(td);}
function recordButton(table,r){const b=document.createElement('button');b.type='button';b.className='text-link';b.textContent=nameOf(r)+(simulated(r)?' · Simulado':'');b.onclick=()=>showDetail(table,r);return b;}
function institutionName(r){return (data.institutions||[]).find(i=>i.id===r.institution_id)?.name||'Sin vincular';}
function renderRows(){
 const table=page;if(!modules[table])return;
 $('recordContext').classList.toggle('hidden',!(table==='leads'&&selectedLead));
 const q=normalized($('search').value), filter=$('filterType').value;
 const rows=visible(table).filter(r=>(!selectedLead||table!=='leads'||r.id===selectedLead)&&(!filter||r[modules[table].field]===filter)&&(!q||normalized(Object.values(r).join(' ')+' '+institutionName(r)).includes(q)));
 offset=Math.min(offset,Math.max(0,Math.ceil(rows.length/pageSize)-1));
 $('recordHead').replaceChildren();const head=document.createElement('tr');for(const name of modules[table].columns){const th=document.createElement('th');th.scope='col';th.textContent=name;head.append(th);}$('recordHead').append(head);
 $('recordRows').replaceChildren();
 for(const r of rows.slice(offset*pageSize,(offset+1)*pageSize)){
  const tr=document.createElement('tr'),td=document.createElement('td');td.append(recordButton(table,r));tr.append(td);
  if(table==='institutions'){cell(tr,label(r.type));cell(tr,r.city);cell(tr,[r.email,r.phone].filter(Boolean).join(' · '));}
  if(table==='contacts'){cell(tr,institutionName(r));cell(tr,r.job_title);cell(tr,[r.email,r.phone].filter(Boolean).join(' · '));}
  if(table==='leads'){cell(tr,label(r.status));cell(tr,label(r.source));cell(tr,[r.next_action,date(r.next_action_date)].filter(Boolean).join('\n'));}
  if(table==='opportunities'){cell(tr,label(r.stage));cell(tr,money(r.value));cell(tr,[r.next_action,date(r.next_action_date)].filter(Boolean).join('\n'));}
  if(table==='tasks'){cell(tr,label(r.status));cell(tr,label(r.priority));cell(tr,date(r.due_at));}
  $('recordRows').append(tr);
 }
 $('emptyRecords').classList.toggle('hidden',rows.length>0&&!failures[table]);
 $('emptyRecords').textContent=failures[table]?'No se pudieron cargar estos registros. Pulsa Actualizar para volver a intentarlo.':loading&&!data[table]?'Cargando…':q||filter||selectedLead?'No hay resultados con la selección actual.':'No hay registros visibles en esta sección.';
 $('recordCount').textContent=failures[table]?'Datos no disponibles':rows.length+' registro(s)'+($('includeDemo').checked?' · incluye simulados':' · sin registros marcados como simulados');
 $('pageNumber').textContent=(offset+1)+' / '+Math.max(1,Math.ceil(rows.length/pageSize));$('previousPage').disabled=offset===0;$('nextPage').disabled=(offset+1)*pageSize>=rows.length;
}
function renderList(id,table,rows){
 $(id).replaceChildren();if(failures[table]){$(id).textContent='No se pudieron cargar los datos.';return;}
 if(!rows.length){$(id).textContent=loading&&!data[table]?'Cargando…':'Sin registros visibles.';return;}
 for(const r of rows){const p=document.createElement('p');p.append(recordButton(table,r));const small=document.createElement('small');small.className='muted';small.textContent=table==='tasks'?' · '+date(r.due_at):' · '+label(r.status);p.append(small);$(id).append(p);}
}
function render(){
 const pending=visible('tasks').filter(r=>['PENDING','IN_PROGRESS','OVERDUE'].includes(r.status));
 for(const [id,table,count] of [['metricInstitutions','institutions',visible('institutions').length],['metricLeads','leads',visible('leads').length],['metricOpportunities','opportunities',visible('opportunities').filter(r=>!['WON','LOST'].includes(r.stage)).length],['metricTasks','tasks',pending.length]])$(id).textContent=failures[table]||!data[table]?'—':String(count);
 $('dataScope').textContent=$('includeDemo').checked?'Incluye datos de simulación; no son ventas reales':'Solo registros sin marca de simulación';
 renderList('recentLeads','leads',visible('leads').slice(0,5));renderList('recentTasks','tasks',pending.sort((a,b)=>(a.due_at||'9999').localeCompare(b.due_at||'9999')).slice(0,5));
 renderRows();
}
async function loadTable(table,org,run){
 const rows=[];
 for(let start=0;;start+=500){
  const response=await sb.from(table).select(modules[table].select).eq('organization_id',org).order('created_at',{ascending:false}).order('id').range(start,start+499);
  if(run!==version)return null;
  if(response.error)throw response.error;
  rows.push(...(response.data||[]));if((response.data||[]).length<500)return rows;
 }
}
async function reload(){
 if(!session||!profile?.organization_id||loading)return;
 const run=++version,org=profile.organization_id;loading=true;$('refreshBtn').disabled=true;notice('Actualizando registros…');
 await Promise.all(Object.keys(modules).map(async table=>{try{const rows=await loadTable(table,org,run);if(run!==version)return;data[table]=rows||[];delete failures[table];}catch{if(run!==version)return;data[table]=[];failures[table]=true;}}));
 if(run!==version)return;loading=false;$('refreshBtn').disabled=false;
 if(page!=='dashboard')setFilter();render();const failed=Object.keys(failures);
 notice(failed.length?'No se pudieron cargar: '+failed.map(k=>modules[k].label).join(', ')+'. Los errores no significan que no existan registros.':'',failed.length>0);
}
async function enterApp(s){
 if(!s?.user?.id)return;
 if(enteredUser===s.user.id&&profile){session=s;return;}
 resetViews();session=s;const run=version;
 $('authView').classList.add('hidden');$('appView').classList.remove('hidden');$('welcome').textContent=s.user.email||'';notice('Verificando acceso…');
 const result=await sb.from('profiles').select('id,organization_id,full_name,role').eq('id',s.user.id).maybeSingle();
 if(run!==version||session?.user?.id!==s.user.id)return;
 if(result.error||!result.data?.organization_id){notice('No se pudo verificar el perfil de acceso. No se han consultado registros comerciales. Recarga para volver a intentarlo.',true);$('topNew').classList.add('hidden');return;}
 profile=result.data;enteredUser=s.user.id;$('welcome').textContent=(profile.full_name||s.user.email)+' · '+s.user.email;
 navigate(initialPage(),{history:false});await reload();
}
function appendDetail(target,title,value){if(value===null||value===undefined||value==='')return;const row=document.createElement('div');row.className='detail-row';const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=String(value);row.append(h,p);$(target).append(row);}
async function showDetail(table,r){
 const run=++detailVersion;$('detailTitle').textContent=nameOf(r);$('detailContent').replaceChildren();$('webDetail').replaceChildren();$('detailStatus').textContent='';
 const fields={id:'Referencia',type:'Tipo',status:'Estado',stage:'Etapa',source:'Origen',job_title:'Cargo',email:'Correo',phone:'Teléfono',city:'Ciudad',website:'Sitio web',decision_level:'Nivel de decisión',value:'Valor registrado',priority:'Prioridad',next_action:'Próxima acción',next_action_date:'Fecha de próxima acción',due_at:'Fecha límite',notes:'Notas',created_at:'Registro'};
 for(const [key,title] of Object.entries(fields)){let value=r[key];if(['created_at','next_action_date','due_at'].includes(key)&&value)value=date(value);else if(['status','stage','type','priority','decision_level','source'].includes(key)&&value)value=label(value);else if(key==='value'&&value!==undefined)value=money(value);appendDetail('detailContent',title,value);}
 if(r.institution_id)appendDetail('detailContent','Institución',institutionName(r));
 if(!$('recordDialog').open)$('recordDialog').showModal();
 if(table!=='leads'||profile?.role!=='ADMIN')return;
 $('detailStatus').textContent='Consultando la solicitud de origen…';
 try{
  const result=await sb.from('web_leads').select('name,role,institution,email,phone,interest,message,submitted_at').eq('crm_record_id',r.id).order('created_at',{ascending:false}).limit(1);
  if(run!==detailVersion||!$('recordDialog').open)return;
  if(result.error)throw result.error;
  const original=result.data?.[0];$('detailStatus').textContent=original?'Solicitud original recibida por la web':'No hay una solicitud web vinculada a este registro.';
  if(original)for(const [key,title] of Object.entries({name:'Contacto',role:'Cargo',institution:'Institución solicitante',email:'Correo de contacto',phone:'Teléfono',interest:'Interés',message:'Solicitud completa',submitted_at:'Enviada el'}))appendDetail('webDetail',title,key==='submitted_at'?date(original[key]):original[key]);
 }catch{if(run===detailVersion)$('detailStatus').textContent='El lead está disponible, pero no se pudo consultar la solicitud original con esta sesión.';}
}
function closeInstitution(){if($('saveInstitution').disabled)return;$('institutionDialog').close();}
$('topNew').onclick=()=>{if(!profile||!['ADMIN','MANAGER','SALES'].includes(profile.role))return;$('institutionForm').reset();$('instMsg').textContent='';$('institutionDialog').showModal();};
$('cancelBtn').onclick=closeInstitution;
$('institutionForm').onsubmit=async e=>{
 e.preventDefault();if(!session||!profile||!['ADMIN','MANAGER','SALES'].includes(profile.role)||$('saveInstitution').disabled||!$('institutionForm').reportValidity())return;
 const org=profile.organization_id,user=session.user.id;$('saveInstitution').disabled=true;$('instMsg').textContent='Guardando…';
 try{
  const value=id=>$(id).value.trim()||null;
  const response=await sb.from('institutions').insert({organization_id:org,created_by:user,name:value('instName'),type:value('instType'),city:value('instCity'),phone:value('instPhone'),email:value('instEmail'),website:value('instWeb'),notes:value('instNotes')});
  if(response.error)throw response.error;
  $('institutionDialog').close();await reload();
 }catch{$('instMsg').textContent='No se pudo guardar. Comprueba los datos y tus permisos. No se ha confirmado el registro.';}
 finally{$('saveInstitution').disabled=false;}
};
$('institutionDialog').addEventListener('cancel',e=>{if($('saveInstitution').disabled)e.preventDefault();});
$('closeDetail').onclick=()=>{$('recordDialog').close();};
$('recordDialog').addEventListener('close',()=>{detailVersion++;$('webDetail').replaceChildren();$('detailContent').replaceChildren();});
$('refreshBtn').onclick=reload;
$('search').oninput=()=>{offset=0;renderRows();};$('filterType').onchange=()=>{offset=0;renderRows();};
$('includeDemo').onchange=()=>{offset=0;if(page!=='dashboard')setFilter();render();};
$('previousPage').onclick=()=>{offset=Math.max(0,offset-1);renderRows();};$('nextPage').onclick=()=>{offset++;renderRows();};
$('clearContext').onclick=()=>{selectedLead=null;navigate('leads');};
for(const button of document.querySelectorAll('[data-page]'))button.onclick=()=>navigate(button.dataset.page,{focus:true});
window.addEventListener('popstate',()=>navigate(initialPage(),{history:false}));
$('logoutBtn').onclick=async()=>{const {error}=await sb.auth.signOut({scope:'local'});if(error){notice('No se pudo cerrar la sesión. Inténtalo de nuevo.',true);return;}resetViews();session=null;$('appView').classList.add('hidden');$('authView').classList.remove('hidden');};
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')resetViews();});
