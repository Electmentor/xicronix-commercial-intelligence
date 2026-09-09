import {escapeHTML as esc, filterRecords, money, metrics, priorities, csv, parseCsv, normalize} from './domain.mjs';

const $ = id => document.getElementById(id);
const enums = {
 type:{UNIVERSITY:'Universidad',SCHOOL:'Colegio',INSTITUTE:'Instituto',CLINIC:'Clínica',HOSPITAL:'Hospital',COMPANY:'Empresa',GOVERNMENT:'Gobierno',RESEARCH_CENTER:'Centro de investigación',OTHER:'Otro'},
 status:{NEW:'Nuevo',RESEARCHING:'En investigación',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactado',QUALIFIED:'Calificado',DISQUALIFIED:'Descartado',CONVERTED:'Convertido'},
 stage:{DETECTED:'Detectada',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactada',QUALIFIED:'Calificada',OPPORTUNITY:'Oportunidad',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida'},
 decision_level:{UNKNOWN:'Sin identificar',USER:'Usuario',INFLUENCER:'Influyente',RECOMMENDER:'Recomendador',DECISION_MAKER:'Decisor',FINAL_APPROVER:'Aprobador final'},
 taskStatus:{PENDING:'Pendiente',IN_PROGRESS:'En curso',COMPLETED:'Completada',CANCELLED:'Cancelada',OVERDUE:'Vencida'},
 priority:{LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica'},
 role:{ADMIN:'Administrador',MANAGER:'Responsable',SALES:'Comercial',VIEWER:'Solo lectura'}
};
const f=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const institution=f('institution_id','Institución','relation');
const contact=f('contact_id','Contacto','relation');
const followUp=[f('next_action','Próxima acción'),f('next_action_date','Fecha de seguimiento','datetime-local')];
const modules={
 institutions:{label:'Instituciones',singular:'institución',filter:'type',options:enums.type,fields:[f('name','Nombre','text',true),f('type','Tipo','select',true,enums.type),f('ruc','RUC'),f('city','Ciudad'),f('country','País','text',true),f('address','Dirección'),f('email','Correo','email'),f('phone','Teléfono','tel'),f('website','Sitio web','url'),f('notes','Notas','textarea')]},
 contacts:{label:'Contactos',singular:'contacto',filter:'decision_level',options:enums.decision_level,fields:[f('first_name','Nombres','text',true),f('last_name','Apellidos'),institution,f('job_title','Cargo'),f('decision_level','Nivel de decisión','select',true,enums.decision_level),f('email','Correo','email'),f('phone','Teléfono','tel'),f('notes','Notas','textarea')]},
 leads:{label:'Prospectos',singular:'prospecto',filter:'status',options:enums.status,fields:[f('title','Título','text',true),institution,contact,f('source','Fuente'),f('status','Estado','select',true,enums.status),f('estimated_value','Valor estimado (S/)','number'),f('score','Calificación manual (0–100)','number'),...followUp]},
 opportunities:{label:'Oportunidades',singular:'oportunidad',filter:'stage',options:enums.stage,fields:[f('name','Nombre','text',true),institution,contact,f('stage','Etapa','select',true,enums.stage),f('value','Valor (S/)','number'),f('probability','Probabilidad manual (%)','number'),f('expected_close_date','Cierre esperado','date'),...followUp]},
 tasks:{label:'Tareas',singular:'tarea',filter:'status',options:enums.taskStatus,fields:[f('title','Título','text',true),institution,f('status','Estado','select',true,enums.taskStatus),f('priority','Prioridad','select',true,enums.priority),f('due_at','Fecha límite','datetime-local')]},
 users:{label:'Usuarios',singular:'usuario',filter:'role',options:enums.role,fields:[f('full_name','Nombre completo','text',true),f('role','Rol','select',true,enums.role)]}
};
let sb, session=null, profile=null, data={}, failures={}, page='dashboard', pageIndex=0, editTable=null, editId=null, editingVersion=null, mode='login', recovery=false, loadVersion=0, busy=false, resetCooldownUntil=0, resetCooldownTimer=null;
const size=20;
const PUBLIC_APP_URL='https://xicronix-commercial-intelligence-git-improvemen-2952f5-xicronix.vercel.app/';
const emptyData=()=>Object.fromEntries(Object.keys(modules).map(k=>[k,[]]));
const writable=()=>profile && ['ADMIN','MANAGER','SALES'].includes(profile.role);
const canDelete=()=>profile?.role==='ADMIN';
const canManageUsers=()=>profile?.role==='ADMIN';
const authRedirectUrl=()=>/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?PUBLIC_APP_URL:location.origin+location.pathname;
const nameOf=row=>row.name || row.title || row.full_name || [row.first_name,row.last_name].filter(Boolean).join(' ');
const relatedName=row=>data.institutions?.find(i=>i.id===row.institution_id)?.name || '';
const date=value=>value?new Date(value).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
const notice=(message,error=false)=>{ $('status').hidden=!message;$('status').textContent=message;$('status').className='notice'+(error?' error':''); };
function errorText(error){
 const code=error?.code;
 if(code==='invalid_credentials')return 'Correo o contraseña incorrectos.';
 if(['otp_expired','invalid_token','bad_jwt'].includes(code))return 'El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo y ábrelo una sola vez.';
 if(code==='email_not_confirmed')return 'Confirma tu correo antes de ingresar.';
 if(code==='over_email_send_rate_limit'||error?.status===429)return 'Se alcanzó el límite de intentos. Espera unos minutos y vuelve a intentar.';
 if(code==='weak_password')return 'Usa una contraseña de al menos 6 caracteres y combina letras, números y símbolos.';
 if(code==='same_password')return 'Elige una contraseña diferente a la anterior.';
 if(code==='23505')return 'Ya existe un registro con esos datos.';
 if(code==='42501')return 'Tu cuenta no tiene permiso para esta operación.';
 if(code==='PGRST116')return 'El registro cambió o ya no está disponible. Actualiza e intenta nuevamente.';
 return 'No se pudo completar la operación. Comprueba tu conexión e inténtalo nuevamente.';
}
function setMode(next){
 mode=next; $('authForm').reset();resetPasswordVisibility();$('authMsg').textContent='';
 const reset=next==='reset', update=next==='update';
 $('authTitle').textContent={login:'Ingresar',signup:'Crear usuario',reset:'Recuperar acceso',update:'Nueva contraseña'}[next];
 $('authBtn').textContent={login:'Ingresar',signup:'Crear usuario',reset:'Enviar enlace de recuperación',update:'Guardar contraseña'}[next];
 $('authHint').textContent=reset?'Te enviaremos un enlace para cambiar tu contraseña.':update?'Elige una contraseña de al menos 6 caracteres.':'Accede con tu correo y contraseña.';
 $('authTabs').hidden=reset||update;$('forgotBtn').hidden=next!=='login';$('backLogin').hidden=!(reset||update);
 $('emailField').hidden=update;$('email').required=!update;
 $('passwordField').hidden=reset;$('password').required=!reset;$('password').minLength=6;$('confirmPassword').minLength=6;
 $('password').autocomplete=next==='login'?'current-password':'new-password';
 $('confirmField').hidden=!update;$('confirmPassword').required=update;
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
}
function togglePassword(button){
 const input=$(button.dataset.passwordToggle);if(!input)return;
 const show=input.type==='password';input.type=show?'text':'password';
 button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña');
 button.querySelectorAll('[data-eye-open]').forEach(node=>node.hidden=show);
 button.querySelectorAll('[data-eye-closed]').forEach(node=>node.hidden=!show);
}
function resetPasswordVisibility(){
 document.querySelectorAll('[data-password-toggle]').forEach(button=>{
  const input=$(button.dataset.passwordToggle);if(!input)return;
  input.type='password';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Mostrar contraseña');
  button.querySelectorAll('[data-eye-open]').forEach(node=>node.hidden=false);
  button.querySelectorAll('[data-eye-closed]').forEach(node=>node.hidden=true);
 });
}
function clearSession(){
 loadVersion++;session=null;profile=null;data=emptyData();failures={};page='dashboard';pageIndex=0;
 if($('editor').open)$('editor').close();$('appView').hidden=true;$('authView').hidden=false;$('dashboard').replaceChildren();$('recordList').replaceChildren();
}
async function allRows(table,org){
 const rows=[];for(let offset=0;;offset+=500){
 const {data:batch,error}=await sb.from(table).select('*').eq('organization_id',org).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
 if(error)throw error;rows.push(...batch);if(batch.length<500)return rows;
 }
}
async function reload(){
 if(!session||recovery)return;
 const version=++loadVersion;const userId=session.user.id;
 $('refreshBtn').disabled=true;$('newBtn').disabled=true;notice('Cargando información…');
 try{
 const result=await sb.from('profiles').select('id,organization_id,full_name,role').eq('id',userId).maybeSingle();
 if(version!==loadVersion)return;
 if(result.error)throw result.error;
 profile=result.data;
 if(!profile){data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice('Tu cuenta está autenticada, pero aún no está vinculada a Xicronix. Un administrador debe asignarte una organización y un rol.',true);return;}
 $('userRole').textContent=enums.role[profile.role]||'Sin rol';$('welcome').textContent=profile.full_name||session.user.email;
 const results=await Promise.allSettled(Object.keys(modules).map(k=>allRows(k,profile.organization_id)));
 if(version!==loadVersion)return;
 data=emptyData();failures={};Object.keys(modules).forEach((k,i)=>{if(results[i].status==='fulfilled')data[k]=results[i].value;else failures[k]=true;});
 render();const bad=Object.keys(failures);notice(bad.length?'No se pudo cargar: '+bad.map(k=>modules[k].label).join(', ')+'. Pulsa Actualizar para reintentar.':'',!!bad.length);
 }catch(error){if(version===loadVersion){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice(errorText(error),true);}}
 finally{if(version===loadVersion){$('refreshBtn').disabled=false;$('newBtn').disabled=!writable()||!!failures[page==='dashboard'?'institutions':page];}}
}
function navigate(next){page=next;pageIndex=0;$('search').value='';const config=modules[page];$('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(config?.options||{}).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');render();}
function badge(value,table){return `<span class="badge ${['WON','COMPLETED'].includes(value)?'success':['OVERDUE','CRITICAL'].includes(value)?'warn':''}">${esc(modules[table]?.options[value]||enums.priority[value]||value||'—')}</span>`;}
function render(){
 $('dashboard').hidden=page!=='dashboard';$('records').hidden=page==='dashboard';$('pageTitle').textContent=page==='dashboard'?'Resumen comercial':modules[page].label;
 const target=page==='dashboard'?'institutions':page,managingUsers=target==='users';
 const usersNav=document.querySelector('[data-page="users"]');if(usersNav)usersNav.hidden=!canManageUsers();
 if(managingUsers&&!canManageUsers()){page='dashboard';return render();}
 $('newBtn').hidden=managingUsers;$('newBtn').textContent='+ Crear '+modules[target].singular;$('newBtn').disabled=managingUsers||!writable()||!!failures[target];
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(page==='dashboard')renderDashboard();else renderRecords();
}
function renderDashboard(){
 const m=metrics(data),failed=Object.keys(failures),opportunities=data.opportunities||[];
 const cards=[
  ['Leads activos',failures.leads?'—':m.leads,'En investigación o contacto'],
  ['Pipeline abierto',failures.opportunities?'—':money(m.pipeline),'Oportunidades abiertas'],
  ['Forecast ponderado',failures.opportunities?'—':money(m.weighted),'Según probabilidad manual'],
  ['Acciones vencidas',failed.some(key=>['tasks','leads','opportunities'].includes(key))?'—':m.overdue,'Requieren atención']
 ];
 const agenda=priorities(data).slice(0,5);
 const stages=Object.entries(enums.stage).map(([key,label])=>{
  const rows=opportunities.filter(row=>row.stage===key);
  return {label,count:rows.length,value:rows.reduce((sum,row)=>sum+Number(row.value||0),0)};
 });
 const maxStage=Math.max(1,...stages.map(stage=>stage.count));
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),tomorrow=new Date(start),dayAfter=new Date(start);
 tomorrow.setDate(tomorrow.getDate()+1);dayAfter.setDate(dayAfter.getDate()+2);
 const tasks=(data.tasks||[]).filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&row.due_at);
 const taskCount=(from,to)=>tasks.filter(row=>{const due=Date.parse(row.due_at);return due>=from.getTime()&&due<to.getTime();}).length;
 const overdueTasks=tasks.filter(row=>Date.parse(row.due_at)<now.getTime()).length;
 const priorityMarkup=agenda.map((row,index)=>{
  const value=row.value??row.estimated_value;
  const score=row.score??row.probability;
  const meta=[relatedName(row)||modules[row.table].label,value!==undefined&&value!==null?money(value):'',score!==undefined&&score!==null?'Score '+score:''].filter(Boolean).join(' · ');
  const overdue=Date.parse(row.due)<now.getTime();
  const action=row.next_action||row.title||row.name||modules[row.table].label;
  return `<div class="priority-row"><div class="priority-rank">${index+1}</div><div class="priority-main"><strong>${esc(nameOf(row))}</strong><small>${esc(meta)}</small><span class="priority-action">${esc(action)}</span></div><div class="priority-side"><span class="badge ${overdue?'warn':''}">${overdue?'Vencida':esc(date(row.due))}</span><button data-edit="${row.id}" data-table="${row.table}">Ver</button></div></div>`;
 }).join('');
 const stageMarkup=stages.map(stage=>`<div class="stage-row"><span>${stage.label}</span><div class="bar"><i style="width:${stage.count/maxStage*100}%"></i></div><b>${stage.count}</b><small>${money(stage.value)}</small></div>`).join('');
 $('dashboard').innerHTML=`<div class="cards">${cards.map(([label,value,hint])=>`<article class="card"><small>${label}</small><strong>${value}</strong><small>${hint}</small></article>`).join('')}</div><div class="grid"><article class="panel"><div class="panel-head"><h2>Prioridades comerciales</h2><button data-page="opportunities">Ver oportunidades</button></div>${priorityMarkup||'<div class="empty">No hay seguimientos con fecha. Agrega una próxima acción para priorizarla.</div>'}</article><article class="panel"><div class="panel-head"><h2>Pipeline por etapa</h2><button data-page="opportunities">Ver todo</button></div>${failures.opportunities?'<p class="error">No disponible</p>':stageMarkup}</article></div><article class="panel task-summary"><div class="panel-head"><h2>Próximas tareas</h2><button data-page="tasks">Ver tareas</button></div><div class="task-summary-grid"><div><small>Hoy</small><strong>${failures.tasks?'—':taskCount(start,tomorrow)}</strong></div><div><small>Mañana</small><strong>${failures.tasks?'—':taskCount(tomorrow,dayAfter)}</strong></div><div class="task-summary-overdue"><small>Vencidas</small><strong>${failures.tasks?'—':overdueTasks}</strong></div></div></article>${failed.length?'<p class="error">Algunos módulos no están disponibles. Pulsa Actualizar para reintentar.</p>':''}`;
}
function filtered(){const config=modules[page];return filterRecords(data[page]||[],$('search').value,config.filter,$('filter').value,relatedName);}
function renderRecords(){
 const isUsers=page==='users';$('importBtn').hidden=isUsers;$('importHelp').hidden=isUsers;
 const rows=filtered();const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures[page]?'Información no disponible':`${rows.length} registros`;
 $('exportBtn').disabled=!!failures[page]||!rows.length;
 $('pageNumber').textContent=`Página ${pageIndex+1} de ${max}`;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 const config=modules[page];
 $('recordList').innerHTML=failures[page]?'<div class="panel empty">No pudimos cargar estos registros. Pulsa Actualizar.</div>':!rows.length?`<div class="panel empty">${$('search').value||$('filter').value?'No hay coincidencias. Cambia la búsqueda o el filtro.':'Aún no hay registros. Crea el primero con el botón superior.'}</div>`:`<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>${isUsers?'Rol':page==='institutions'?'Ciudad':'Institución'}</th><th>Estado / tipo</th><th>${['leads','opportunities'].includes(page)?'Valor estimado':'Detalle'}</th><th>Acción</th></tr></thead><tbody>${rows.slice(pageIndex*size,(pageIndex+1)*size).map(row=>`<tr><td><strong>${esc(nameOf(row))}</strong><small>${esc(row.email||row.next_action||row.job_title||'')}</small></td><td>${isUsers?badge(row.role,page):esc(page==='institutions'?row.city||'—':relatedName(row)||'Sin vincular')}</td><td>${badge(row[config.filter],page)}</td><td>${page==='opportunities'?money(row.value):page==='leads'?money(row.estimated_value):page==='tasks'?esc(date(row.due_at)):esc(row.phone||'—')}</td><td><div class="row-actions"><button data-edit="${row.id}" data-table="${page}">${(isUsers?canManageUsers():writable())?'Editar':'Ver'}</button>${!isUsers&&canDelete()?`<button class="danger-text" data-delete="${row.id}" data-table="${page}">Eliminar</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function localDateTime(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function importValue(source,field){
 const keys=[normalize(field.key),normalize(field.label)];
 const key=keys.find(candidate=>Object.hasOwn(source,candidate));
 const raw=String(key?source[key]??'':'').trim();
 if(!raw)return '';
 if(field.options){
  const found=Object.entries(field.options).find(([option,label])=>normalize(option)===normalize(raw)||normalize(label)===normalize(raw));
  return found?found[0]:raw;
 }
 if(field.type==='relation'){
  const table=field.key==='institution_id'?'institutions':'contacts';
  const found=(data[table]||[]).find(row=>row.id===raw||normalize(nameOf(row))===normalize(raw));
  return found?.id||'__missing__:'+raw;
 }
 if(field.type==='number'){
  const normalized=raw.replace(/[^0-9,.-]/g,'').replace(/,(?=.*[,])/g,'').replace(',','.');
  return normalized===''?0:Number(normalized);
 }
 if(field.type==='datetime-local'||field.type==='date'){
  const parsed=new Date(raw);
  return Number.isFinite(parsed.getTime())?(field.type==='date'?parsed.toISOString().slice(0,10):parsed.toISOString()):raw;
 }
 return raw;
}
function buildImport(table,rows){
 const errors=[],payloads=[];
 rows.forEach((source,index)=>{
  const payload={},prefix='Fila '+(index+2)+': ';
  for(const field of modules[table].fields){
   const value=importValue(source,field);
   if(String(value).startsWith('__missing__:'))errors.push(prefix+'no se encontró '+field.label+' “'+String(value).slice(12)+'”.');
   if(field.required&&!String(value).trim())errors.push(prefix+'falta '+field.label+'.');
   payload[field.key]=value===''?null:value;
  }
  if(!errors.some(error=>error.startsWith(prefix)))payloads.push(payload);
 });
 return {errors,payloads};
}
async function importCsvFile(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 if(!profile||!writable()){notice('Solo un usuario con permisos de escritura puede importar registros.',true);return;}
 const text=await file.text(),rows=parseCsv(text);
 if(!rows.length){notice('El CSV está vacío o no tiene encabezados.',true);return;}
 const result=buildImport(page,rows);
 if(result.errors.length){notice(result.errors.slice(0,3).join(' ')+(result.errors.length>3?' Se encontraron más errores. Corrige el archivo y vuelve a intentarlo.':''),true);return;}
 if(!window.confirm('Se importarán '+result.payloads.length+' registros en '+modules[page].label+'. ¿Continuar?'))return;
 $('importBtn').disabled=true;notice('Importando '+result.payloads.length+' registros…');
 try{
  const {error}=await sb.from(page).insert(result.payloads.map(row=>({...row,organization_id:profile.organization_id,created_by:session.user.id})));
  if(error)throw error;
  await reload();notice('Se importaron '+result.payloads.length+' registros correctamente.');
 }catch(error){notice(errorText(error),true);}
 finally{$('importBtn').disabled=false;}
}
async function removeRecord(table,id){
 if(table==='users'||!canDelete()||busy)return;
 const row=data[table]?.find(item=>item.id===id);if(!row)return;
 if(!window.confirm('¿Eliminar '+nameOf(row)+'? Esta acción no se puede deshacer.'))return;
 busy=true;notice('Eliminando…');
 try{
  const {error}=await sb.from(table).delete().eq('id',id).eq('organization_id',profile.organization_id);
  if(error)throw error;
  await reload();notice('Registro eliminado correctamente.');
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;}
}
function openEditor(table,id=null){
 if(!profile||failures[table])return; if(table==='users'&&(!id||!canManageUsers()))return; if(!id&&!writable())return;
 const dependencies=modules[table].fields.filter(f=>f.type==='relation').map(f=>f.key==='institution_id'?'institutions':'contacts');
 if(dependencies.some(k=>failures[k])){notice('Actualiza los módulos vinculados antes de abrir este formulario para conservar las relaciones del registro.',true);return;}
 const row=id?data[table].find(r=>r.id===id):{};if(!row)return;
 editTable=table;editId=id;editingVersion=row.updated_at||null;
 $('editorTitle').textContent=`${id?(writable()?'Editar':'Ver'):'Crear'} ${modules[table].singular}`;$('formMsg').textContent='';
 $('fields').innerHTML=modules[table].fields.map(field=>{
 let value=row[field.key]??({country:'Peru',type:'OTHER',priority:'MEDIUM',score:0,value:0,estimated_value:0,probability:10}[field.key]??'');if(field.type==='datetime-local')value=localDateTime(value);
 let options=field.options;if(field.type==='relation'){const source=field.key==='institution_id'?'institutions':'contacts';options=Object.fromEntries((data[source]||[]).map(r=>[r.id,nameOf(r)]));}
 let input;
 const attrs=`id="field-${field.key}" name="${field.key}" ${field.required?'required':''} ${!(editTable==='users'?canManageUsers():writable())?'disabled':''}`;
 if(options)input=`<select ${attrs}>${field.type==='relation'?'<option value="">Sin vincular</option>':''}${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
 else if(field.type==='textarea')input=`<textarea ${attrs}>${esc(value)}</textarea>`;
 else input=`<input ${attrs} type="${field.type}" value="${esc(value)}" ${field.type==='number'?`min="0" step="${['score','probability'].includes(field.key)?1:'0.01'}" ${['score','probability'].includes(field.key)?'max="100"':''}`:''} ${field.key==='ruc'?'pattern="[0-9]{11}" title="Ingresa 11 dígitos"':''}>`;
 return `<div class="${field.type==='textarea'?'full':''}"><label for="field-${field.key}">${field.label}${field.required?' *':''}</label>${input}</div>`;
 }).join('');$('saveBtn').hidden=!writable();$('saveBtn').disabled=false;$('editor').showModal();
}
async function saveRecord(event){
 event.preventDefault();const canEdit=editTable==='users'?canManageUsers():writable();if(busy||!canEdit)return;
 const payload={}, form=new FormData($('recordForm'));
 for(const field of modules[editTable].fields){let value=String(form.get(field.key)??'').trim();
 if(field.required&&!value){$('formMsg').textContent='Completa los campos obligatorios.';return;}
 if(field.type==='number')value=value===''?0:Number(value);
 else if(field.type==='datetime-local')value=value?new Date(value).toISOString():null;
 else value=value||null;payload[field.key]=value;
 }
 if(payload.contact_id){const selected=data.contacts.find(c=>c.id===payload.contact_id);if(!selected||selected.institution_id&&selected.institution_id!==payload.institution_id){$('formMsg').textContent='El contacto debe pertenecer a la institución seleccionada.';return;}}
 busy=true;$('saveBtn').disabled=true;$('formMsg').textContent='Guardando…';
 const table=editTable,id=editId,org=profile.organization_id,userId=session.user.id,version=loadVersion;
 try{
 let query;if(id){if(table!=='users'){payload.updated_at=new Date().toISOString();}query=sb.from(table).update(payload).eq('id',id).eq('organization_id',org);if(table!=='users'&&editingVersion)query=query.eq('updated_at',editingVersion);}
 else if(table!=='users')query=sb.from(table).insert({...payload,organization_id:org,created_by:userId});else throw {code:'42501'};
 const {error}=await query.select('id').single();if(error)throw error;
 if(!session||session.user.id!==userId||version!==loadVersion)return;
 $('editor').close();await reload();if(!failures[table])notice('Registro guardado correctamente.');
 }catch(error){$('formMsg').textContent=errorText(error);$('formMsg').className='error';}
 finally{busy=false;$('saveBtn').disabled=false;}
}
async function authenticate(event){
 event.preventDefault();if(!sb)return;$('authBtn').disabled=true;$('authMsg').className='';$('authMsg').textContent='Procesando…';
 const email=$('email').value.trim(),password=$('password').value;
 try{let result;
 if(mode==='reset'){
 if(Date.now()<resetCooldownUntil){$('authMsg').textContent='Espera unos segundos antes de solicitar otro enlace.';return;}
 result=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});if(result.error)throw result.error;
 startResetCooldown(60);$('authMsg').textContent='Si el correo tiene una cuenta, recibirás un enlace. Revisa también la carpeta de spam.';return;
 }
 if(mode==='update'){
 if(password!==$('confirmPassword').value){$('authMsg').textContent='Las contraseñas no coinciden.';return;}
 result=await sb.auth.updateUser({password});if(result.error)throw result.error;
 recovery=false;history.replaceState(null,'',location.pathname);$('authForm').reset();await sb.auth.signOut();clearSession();setMode('login');$('authMsg').textContent='Contraseña actualizada. Ya puedes ingresar.';return;
 }
 result=mode==='login'?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});
 if(result.error)throw result.error;
 $('authMsg').textContent=mode==='signup'?'Si el registro procede, recibirás un correo de confirmación. Después, un administrador debe vincular tu cuenta.':'';
 }catch(error){if(mode==='reset'&&(error?.status===429||error?.code==='over_email_send_rate_limit'))startResetCooldown(60);$('authMsg').className='error';$('authMsg').textContent=errorText(error);}
 finally{$('authBtn').disabled=mode==='reset'&&Date.now()<resetCooldownUntil;}
}
function startResetCooldown(seconds){
 resetCooldownUntil=Date.now()+seconds*1000;clearInterval(resetCooldownTimer);
 const update=()=>{const remaining=Math.max(0,Math.ceil((resetCooldownUntil-Date.now())/1000));if(mode==='reset')$('authBtn').textContent=remaining?'Espera '+remaining+' s':'Enviar enlace de recuperación';if(!remaining){clearInterval(resetCooldownTimer);$('authBtn').disabled=false;}};
 update();resetCooldownTimer=setInterval(update,1000);
}
function handleAuth(event,current){
 if(event==='PASSWORD_RECOVERY'){clearSession();session=current;recovery=true;setMode('update');return;}
 if(!current){recovery=false;clearSession();return;}
 if(recovery)return;
 if(session?.user.id===current.user.id){session=current;return;}
 clearSession();session=current;$('authView').hidden=true;$('appView').hidden=false;
 // Run data requests outside the auth callback lock.
 setTimeout(()=>{if(session?.user.id===current.user.id&&!recovery)reload();},0);
}
function init(){
 $('navigation').innerHTML=[['dashboard','Resumen'],...Object.entries(modules).map(([k,v])=>[k,v.label])].map(([k,v],i)=>`<button data-page="${k}"><span class="nav-index">0${i+1}</span>${v}</button>`).join('');
 $('dateLabel').textContent=new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long'});
 document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.passwordToggle){togglePassword(b);return;}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.edit)openEditor(b.dataset.table,b.dataset.edit);if(b.dataset.delete)removeRecord(b.dataset.table,b.dataset.delete);if(b.dataset.mode)setMode(b.dataset.mode);});
 $('forgotBtn').onclick=()=>setMode('reset');$('backLogin').onclick=async()=>{if(recovery){await sb.auth.signOut();clearSession();recovery=false;}setMode('login');};
 $('authForm').onsubmit=authenticate;$('recordForm').onsubmit=saveRecord;$('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=importCsvFile;
 $('refreshBtn').onclick=reload;$('newBtn').onclick=()=>openEditor(page==='dashboard'?'institutions':page);
 $('search').oninput=$('filter').onchange=()=>{pageIndex=0;renderRecords();};
 $('previous').onclick=()=>{pageIndex--;renderRecords();};$('next').onclick=()=>{pageIndex++;renderRecords();};
 const close=()=>{if(!busy)$('editor').close();};$('closeEditor').onclick=$('cancelEditor').onclick=close;$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('logoutBtn').onclick=async()=>{const {error}=await sb.auth.signOut();if(error){notice(errorText(error),true);return;}clearSession();setMode('login');};
 $('exportBtn').onclick=()=>{const columns=modules[page].fields.map(field=>({key:field.key,label:field.label}));const rows=filtered().map(row=>Object.fromEntries(columns.map(c=>{const field=modules[page].fields.find(f=>f.key===c.key);return [c.key,field.type==='relation'?(c.key==='institution_id'?relatedName(row):nameOf(data.contacts.find(r=>r.id===row.contact_id)||{})):field.options?.[row[c.key]]||row[c.key]];})));const url=URL.createObjectURL(new Blob([csv(rows,columns)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`xicronix-${page}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!window.supabase){$('authMsg').textContent='No se pudo cargar el servicio de acceso. Comprueba tu conexión y recarga la página.';$('authBtn').disabled=true;return;}
 sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK');
 sb.auth.onAuthStateChange(handleAuth);
 const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}
}
// Both the SDK's defer script and module execution finish before DOMContentLoaded.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
