import {escapeHTML as esc, filterRecords, money, metrics, priorities, csv, parseCsv, normalize} from './domain.mjs';

import {ADMIN, SELLER, effectiveWorkspace, workspaceKey, canAccessPage, canWriteModule, assignedUserId, scopeWorkspaceData} from './workspace.mjs';

const $ = id => document.getElementById(id);
const enums = {
 type:{UNIVERSITY:'Universidad',SCHOOL:'Colegio',INSTITUTE:'Instituto',CLINIC:'Clínica',HOSPITAL:'Hospital',COMPANY:'Empresa',GOVERNMENT:'Gobierno',RESEARCH_CENTER:'Centro de investigación',OTHER:'Otro'},
 status:{NEW:'Nuevo',RESEARCHING:'En investigación',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactado',QUALIFIED:'Calificado',DISQUALIFIED:'Descartado',CONVERTED:'Convertido'},
 stage:{DETECTED:'Detectada',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactada',QUALIFIED:'Calificada',OPPORTUNITY:'Oportunidad',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida'},
 decision_level:{UNKNOWN:'Sin identificar',USER:'Usuario',INFLUENCER:'Influyente',RECOMMENDER:'Recomendador',DECISION_MAKER:'Decisor',FINAL_APPROVER:'Aprobador final'},
 taskStatus:{PENDING:'Pendiente',IN_PROGRESS:'En curso',COMPLETED:'Completada',CANCELLED:'Cancelada',OVERDUE:'Vencida'},
 priority:{LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica'},
 role:{ADMIN:'Administrador',MANAGER:'Responsable',SALES:'Comercial',VIEWER:'Solo lectura'},
 activityType:{CALL:'Llamada',WHATSAPP:'WhatsApp',EMAIL:'Correo',MEETING:'Reunión',VISIT:'Visita',DEMO:'Demostración',PROPOSAL_SENT:'Propuesta enviada',FOLLOW_UP:'Seguimiento',NOTE:'Nota',OTHER:'Otro'},
 activityOutcome:{INTERESTED:'Interesado',FOLLOW_UP:'Requiere seguimiento',NO_RESPONSE:'Sin respuesta',NOT_INTERESTED:'No interesado',QUALIFIED:'Calificado',DISQUALIFIED:'No califica'}
};
const f=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const institution=f('institution_id','Institución','relation');
const contact=f('contact_id','Contacto','relation');
const followUp=[f('next_action','Próxima acción'),f('next_action_date','Fecha de seguimiento','datetime-local')];
const owner=f('owner_user_id','Responsable','relation');owner.adminOnly=true;
const assignee=f('assigned_to','Responsable','relation');assignee.adminOnly=true;
const cost=f('estimated_cost','Costo estimado (S/)','number');cost.adminOnly=true;
const modules={
 institutions:{label:'Instituciones',singular:'institución',filter:'type',options:enums.type,fields:[f('name','Nombre','text',true),f('type','Tipo','select',true,enums.type),f('ruc','RUC'),f('city','Ciudad'),f('country','País','text',true),f('address','Dirección'),f('email','Correo','email'),f('phone','Teléfono','tel'),f('website','Sitio web','url'),f('notes','Notas','textarea')]},
 contacts:{label:'Contactos',singular:'contacto',filter:'decision_level',options:enums.decision_level,fields:[f('first_name','Nombres','text',true),f('last_name','Apellidos'),institution,f('job_title','Cargo'),f('decision_level','Nivel de decisión','select',true,enums.decision_level),f('email','Correo','email'),f('phone','Teléfono','tel'),f('notes','Notas','textarea')]},
 leads:{label:'Prospectos',singular:'prospecto',filter:'status',options:enums.status,fields:[f('title','Título','text',true),institution,contact,f('source','Fuente'),f('status','Estado','select',true,enums.status),f('estimated_value','Valor estimado (S/)','number'),f('score','Calificación manual (0–100)','number'),owner,...followUp]},
 opportunities:{label:'Oportunidades',singular:'oportunidad',filter:'stage',options:enums.stage,fields:[f('name','Nombre','text',true),institution,contact,f('stage','Etapa','select',true,enums.stage),f('value','Valor (S/)','number'),cost,owner,f('probability','Probabilidad manual (%)','number'),f('expected_close_date','Cierre esperado','date'),...followUp]},
 tasks:{label:'Tareas',singular:'tarea',filter:'status',options:enums.taskStatus,fields:[f('title','Título','text',true),institution,f('status','Estado','select',true,enums.taskStatus),f('priority','Prioridad','select',true,enums.priority),f('due_at','Fecha límite','datetime-local'),assignee]},
 activities:{label:'Interacciones',singular:'interacción',filter:'type',options:enums.activityType,fields:[f('lead_id','Prospecto','relation',true),institution,contact,f('type','Canal','select',true,enums.activityType),f('subject','Asunto','text',true),f('outcome','Resultado','select',false,enums.activityOutcome),f('need_summary','Necesidad detectada','textarea'),f('decision_timeline','Horizonte de decisión'),f('budget_signal','Señal de presupuesto'),f('notes','Notas','textarea'),f('occurred_at','Fecha y hora','datetime-local',true),f('next_action','Próxima acción'),f('next_action_date','Fecha de seguimiento','datetime-local')]},
 goals:{label:'Metas',singular:'meta',fields:[owner,f('period_start','Inicio del periodo','date',true),f('period_end','Fin del periodo','date',true),f('target_margin','Meta de margen (S/)','number',true),f('target_won_value','Meta de ventas ganadas (S/)','number',true),f('notes','Notas','textarea')]},
 users:{label:'Usuarios',singular:'usuario',filter:'role',options:enums.role,fields:[f('full_name','Nombre completo','text',true),f('role','Rol','select',true,enums.role)]}
};
let sb, session=null, profile=null, data={}, failures={}, page='dashboard', pageIndex=0, editTable=null, editId=null, editingVersion=null, mode='login', recovery=false, loadVersion=0, busy=false, resetCooldownUntil=0, resetCooldownTimer=null;
const size=20;
const PUBLIC_APP_URL='https://xicronix-commercial-intelligence-git-improvemen-2952f5-xicronix.vercel.app/';
const emptyData=()=>Object.fromEntries([...Object.keys(modules),'scores'].map(k=>[k,[]]));
const writable=()=>profile && ['ADMIN','MANAGER','SALES'].includes(profile.role);
let workspace=SELLER, workspaceIdentity=null, loading=false;
const isAdminAccount=()=>profile?.role==='ADMIN';
const canViewDashboard=()=>!!profile && effectiveWorkspace(profile,workspace)===ADMIN;
const canManageUsers=canViewDashboard;
const canManageGoals=canViewDashboard;
const canDelete=canViewDashboard;
const accessible=table=>canAccessPage(profile,workspace,table);
const writableFor=table=>canWriteModule(profile,workspace,table);
const fieldsFor=table=>(modules[table]?.fields||[]).filter(field=>!field.adminOnly||canViewDashboard());
const databaseTable=table=>({users:'profiles',goals:'commercial_goals'})[table]||table;
function restoreWorkspace(){
 const identity=workspaceKey(session.user.id,profile.organization_id);
 if(workspaceIdentity!==identity){
  let saved=ADMIN;try{saved=localStorage.getItem(identity)||ADMIN;}catch(_error){}
  workspace=effectiveWorkspace(profile,saved);workspaceIdentity=identity;
 }else workspace=effectiveWorkspace(profile,workspace);
}
function renderWorkspaceControls(){
 const admin=canViewDashboard();
 $('workspaceControls').hidden=!profile;
 $('adminModeBtn').hidden=!isAdminAccount();
 $('adminModeBtn').setAttribute('aria-pressed',String(admin));
 $('sellerModeBtn').setAttribute('aria-pressed',String(!admin));
 $('adminModeBtn').disabled=$('sellerModeBtn').disabled=loading||busy;
 $('workspaceHint').textContent=admin?'Visión global: resultados, margen, metas y equipo.':'Mi cartera: prospectos, potencial, interacciones y próximas acciones.';
 $('workspaceLabel').textContent=admin?'DIRECCIÓN COMERCIAL':'MI ESPACIO DE VENTAS';
 $('appView').dataset.workspace=admin?ADMIN:SELLER;
 const labels=admin?{}:{leads:'Mi cartera',opportunities:'Mis oportunidades',tasks:'Mis tareas',activities:'Mis interacciones',institutions:'Mis instituciones',contacts:'Mis contactos'};
 const keys=admin?['dashboard',...Object.keys(modules)]:['leads','tasks','activities','opportunities','institutions','contacts'];
 $('navigation').innerHTML=keys.filter(accessible).map((key,index)=>'<button data-page="'+key+'"><span class="nav-index">'+String(index+1).padStart(2,'0')+'</span>'+(labels[key]||modules[key]?.label||'Resumen ejecutivo')+'</button>').join('');
}
async function setWorkspace(next){
 if(![ADMIN,SELLER].includes(next)||!profile||busy||loading)return;
 if(next===ADMIN&&!isAdminAccount()){notice('El modo administrador requiere una cuenta con ese rol.',true);return;}
 if($('editor').open){notice('Guarda o cancela el formulario antes de cambiar de modo.',true);return;}
 if(next===workspace)return;
 workspace=effectiveWorkspace(profile,next);
 try{localStorage.setItem(workspaceIdentity,workspace);}catch(_error){}
 data=emptyData();failures={};$('dashboard').replaceChildren();$('recordList').replaceChildren();$('sellerSummary').replaceChildren();
 navigate(workspace===ADMIN?'dashboard':'leads');
 await reload();
}
const THEME_STORAGE_KEY='xicronix-theme';
const authRedirectUrl=()=>/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?PUBLIC_APP_URL:location.origin+location.pathname;
const nameOf=row=>row.name || row.title || row.full_name || [row.first_name,row.last_name].filter(Boolean).join(' ');
const relatedName=row=>data.institutions?.find(i=>i.id===row.institution_id)?.name || '';
const relationTable=key=>({institution_id:'institutions',contact_id:'contacts',lead_id:'leads',opportunity_id:'opportunities',owner_user_id:'users',assigned_to:'users'})[key];
const relationName=(key,row)=>{const table=relationTable(key);return table?nameOf((data[table]||[]).find(item=>item.id===row[key])||{}):'';};
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
 loadVersion++;session=null;profile=null;data=emptyData();failures={};page='dashboard';pageIndex=0;workspace=SELLER;workspaceIdentity=null;loading=false;editTable=null;editId=null;editingVersion=null;
 $('fields').replaceChildren();$('sellerSummary').replaceChildren();$('navigation').replaceChildren();$('workspaceControls').hidden=true;
 if($('editor').open)$('editor').close();$('appView').hidden=true;$('authView').hidden=false;$('dashboard').replaceChildren();$('recordList').replaceChildren();
}
function rowQuery(table,org){
 let query=sb.from(databaseTable(table)).select('*').eq('organization_id',org);
 if(!canViewDashboard()&&['leads','opportunities','tasks'].includes(table)){
  const ownerColumn=table==='tasks'?'assigned_to':'owner_user_id';
  query=query.or(ownerColumn+'.eq.'+session.user.id+',and('+ownerColumn+'.is.null,created_by.eq.'+session.user.id+')');
 }
 return query;
}
async function allRows(table,org){
 const rows=[];const orderColumn=table==='scores'?'calculated_at':'created_at';for(let offset=0;;offset+=500){
 const {data:batch,error}=await rowQuery(table,org).order(orderColumn,{ascending:false}).order('id').range(offset,offset+499);
 if(error)throw error;rows.push(...batch);if(batch.length<500)return rows;
 }
}
async function reload(){
 if(!session||recovery||busy)return;
 const version=++loadVersion;const userId=session.user.id;loading=true;renderWorkspaceControls();
 $('refreshBtn').disabled=true;$('newBtn').disabled=true;notice('Cargando información…');
 try{
 const result=await sb.from('profiles').select('id,organization_id,full_name,role').eq('id',userId).maybeSingle();
 if(version!==loadVersion)return;
 if(result.error)throw result.error;
 profile=result.data;
 if(!profile?.organization_id){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice('Tu cuenta está autenticada, pero aún no está vinculada a Xicronix. Un administrador debe asignarte una organización y un rol.',true);return;}
 restoreWorkspace();
 $('userRole').textContent=enums.role[profile.role]||'Sin rol';$('welcome').textContent=profile.full_name||session.user.email;
 const tables=[...Object.keys(modules).filter(accessible),'scores'];
 const results=await Promise.allSettled(tables.map(k=>allRows(k,profile.organization_id)));
 if(version!==loadVersion)return;
 data=emptyData();failures={};tables.forEach((k,i)=>{if(results[i].status==='fulfilled')data[k]=results[i].value;else failures[k]=true;});
 data=scopeWorkspaceData(data,profile,userId,workspace);
 render();const bad=Object.keys(failures);notice(bad.length?'No se pudo cargar: '+bad.map(k=>modules[k]?.label||k).join(', ')+'. Pulsa Actualizar para reintentar.':'',!!bad.length);
 }catch(error){if(version===loadVersion){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice(errorText(error),true);}}
 finally{if(version===loadVersion){loading=false;$('refreshBtn').disabled=false;render();}}
}
function applyTheme(theme,persist=false){
 const night=theme==='night';document.documentElement.dataset.theme=night?'night':'day';
 const button=$('themeToggle');if(button){button.textContent=night?'☀️ Modo diurno':'🌙 Modo nocturno';button.setAttribute('aria-pressed',String(night));button.setAttribute('aria-label',night?'Cambiar a modo diurno':'Cambiar a modo nocturno');button.title=night?'Usar fondo claro':'Usar fondo oscuro';}
 if(persist){try{localStorage.setItem(THEME_STORAGE_KEY,night?'night':'day');}catch(_error){}}
}
function initTheme(){let stored='';try{stored=localStorage.getItem(THEME_STORAGE_KEY)||'';}catch(_error){}applyTheme(stored==='night'?'night':'day');}
function navigate(next){
 if(busy||$('editor').open)return;
 if(!accessible(next))next=canViewDashboard()?'dashboard':'leads';
 page=next;pageIndex=0;$('search').value='';
 const config=modules[page];$('filter').dataset.page=page;
 $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(config?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 render();
}
function badge(value,table){return `<span class="badge ${['WON','COMPLETED'].includes(value)?'success':['OVERDUE','CRITICAL'].includes(value)?'warn':''}">${esc(modules[table]?.options?.[value]||enums.priority[value]||value||'—')}</span>`;}
function render(){
 renderWorkspaceControls();
 if(!accessible(page)){page=canViewDashboard()?'dashboard':'leads';pageIndex=0;$('search').value='';$('filter').value='';}
 if($('filter').dataset.page!==page){
  $('filter').dataset.page=page;
  $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(modules[page]?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 }
 const admin=canViewDashboard();
 $('dashboard').hidden=page!=='dashboard';$('records').hidden=page==='dashboard';
 $('pageTitle').textContent=page==='dashboard'?'Resumen ejecutivo':!admin&&page==='leads'?'Mi cartera de prospectos':modules[page].label;
 const target=page==='dashboard'?'institutions':page;
 $('newBtn').hidden=target==='users'||!writableFor(target);
 $('newBtn').textContent='+ Crear '+modules[target].singular;
 $('newBtn').disabled=loading||busy||!writableFor(target)||!!failures[target];
 $('refreshBtn').disabled=loading||busy;
 document.querySelectorAll('[data-page]').forEach(button=>{
  button.classList.toggle('active',button.dataset.page===page);
  if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 if(!admin)$('dashboard').replaceChildren();
 if(page==='dashboard')renderDashboard();else renderRecords();
}
function opportunityMargin(row){
 const value=Number(row.value);
 const cost=row.estimated_cost;
 if(!Number.isFinite(value)||cost===null||cost===undefined||cost==='')return null;
 const numericCost=Number(cost);
 return Number.isFinite(numericCost)?Math.max(0,value-numericCost):null;
}
function stageWeight(stage){return {DETECTED:10,CONTACT_PENDING:15,CONTACTED:25,QUALIFIED:40,OPPORTUNITY:55,PROPOSAL:70,NEGOTIATION:85,WON:100,LOST:0}[stage]??0;}
function leadQuality(lead){
 const checks=[lead.title,lead.institution_id,lead.contact_id,lead.status,lead.next_action,lead.next_action_date];
 return Math.round(checks.filter(Boolean).length/checks.length*100);
}
function currentPeriod(){
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+1,0);
 return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
function currentGoal(){
 const period=currentPeriod();
 return (data.goals||[]).filter(goal=>!goal.owner_user_id&&goal.period_start<=period.end&&goal.period_end>=period.start).sort((a,b)=>String(b.period_start).localeCompare(String(a.period_start)))[0]||null;
}
function sellerPerformanceRows(){
 const users=(data.users||[]).filter(user=>user.role!=='ADMIN');
 const leads=data.leads||[],opportunities=data.opportunities||[],tasks=data.tasks||[],activities=data.activities||[],scores=data.scores||[];
 const wonMargins=opportunities.filter(row=>row.stage==='WON').map(opportunityMargin).filter(value=>value!==null);
 const organizationWonMargin=wonMargins.reduce((sum,value)=>sum+value,0);
 return users.map(user=>{
  const ownedLeads=leads.filter(row=>assignedUserId(row)===user.id);
  const ownedOpps=opportunities.filter(row=>assignedUserId(row)===user.id);
  const ownedTasks=tasks.filter(row=>assignedUserId(row)===user.id);
  const ownedActivities=activities.filter(row=>row.created_by===user.id);
  const scoreValues=ownedLeads.map(lead=>scores.find(score=>score.lead_id===lead.id)?.total_score).filter(value=>value!==undefined&&value!==null).map(Number);
  const potential=scoreValues.length?scoreValues.reduce((sum,value)=>sum+value,0)/scoreValues.length:null;
  const wonKnown=ownedOpps.filter(row=>row.stage==='WON').map(opportunityMargin).filter(value=>value!==null);
  const wonMargin=wonKnown.length?wonKnown.reduce((sum,value)=>sum+value,0):null;
  const openOpps=ownedOpps.filter(row=>!['WON','LOST'].includes(row.stage));
  const pipeline=openOpps.reduce((sum,row)=>sum+Number(row.value||0),0);
  const openMargins=openOpps.map(opportunityMargin).filter(value=>value!==null);
  const openMargin=openMargins.length?openMargins.reduce((sum,value)=>sum+value,0):null;
  const progress=ownedOpps.length?Math.round(ownedOpps.reduce((sum,row)=>sum+stageWeight(row.stage),0)/ownedOpps.length):0;
  const quality=ownedLeads.length?Math.round(ownedLeads.reduce((sum,row)=>sum+leadQuality(row),0)/ownedLeads.length):0;
  const completed=ownedTasks.filter(row=>row.status==='COMPLETED').length;
  const followup=ownedTasks.length?Math.round(completed/ownedTasks.length*100):0;
  const collaboration=Math.min(100,ownedActivities.length*10);
  const result=organizationWonMargin&&wonMargin!==null?Math.min(100,Math.round(wonMargin/organizationWonMargin*100)):0;
  const performance=Math.round(result*.4+progress*.2+quality*.15+followup*.15+collaboration*.1);
  const rate=performance>=90?.03:performance>=75?.02:performance>=60?.01:0;
  const bonusBase=wonMargin===null?null:wonMargin;
  const bonus=bonusBase===null?null:Math.round(bonusBase*rate*100)/100;
  return {user,ownedLeads,ownedOpps,ownedTasks,ownedActivities,potential,wonMargin,openMargin,pipeline,progress,quality,followup,collaboration,performance,rate,bonusBase,bonus};
 });
}
function renderAdminHighLevel(){
 if(!canViewDashboard())return '';
 const rows=sellerPerformanceRows(),opportunities=data.opportunities||[];
 const open=opportunities.filter(row=>!['WON','LOST'].includes(row.stage));
 const openMargins=open.map(opportunityMargin).filter(value=>value!==null);
 const won=opportunities.filter(row=>row.stage==='WON').map(opportunityMargin).filter(value=>value!==null);
 const openMargin=openMargins.length?openMargins.reduce((sum,value)=>sum+value,0):null;
 const wonMargin=won.length?won.reduce((sum,value)=>sum+value,0):null;
 const goal=currentGoal(),goalValue=goal?Number(goal.target_margin||0):0;
 const goalProgress=goalValue?Math.min(999,Math.round((wonMargin||0)/goalValue*100)):null;
 const top=rows.filter(row=>row.performance!==null).sort((a,b)=>b.performance-a.performance).slice(0,3);
 const topMarkup=top.length?top.map((row,index)=>'<div class="top-seller-row"><span class="top-seller-rank">'+(index+1)+'</span><div><strong>'+esc(row.user.full_name||'Sin nombre')+'</strong><small>'+esc(enums.role[row.user.role]||row.user.role||'')+' · '+row.performance+'% desempeño</small></div><b>'+money(row.wonMargin||0)+'</b></div>').join(''):'<div class="empty">Aún no hay suficientes datos para ordenar vendedores.</div>';
 const goalMarkup=goal?'<div class="goal-progress"><div class="panel-head"><strong>Meta de margen del periodo</strong><b>'+goalProgress+'%</b></div><div class="score-track"><i style="width:'+Math.min(100,goalProgress)+'%"></i></div><small>'+money(wonMargin||0)+' de '+money(goalValue)+' · '+goal.period_start+' a '+goal.period_end+'</small></div>':'<div class="empty">No hay una meta general definida para el periodo. Usa “Metas” para crearla.</div>';
 return '<article class="panel admin-high-level"><div class="panel-head"><div><h2>Visión administrativa</h2><p class="muted">Resultados, prioridades, metas, margen y desempeño del equipo.</p></div><button data-page="goals">Gestionar metas</button></div><div class="admin-kpi-grid"><div><small>Margen ganado</small><strong>'+(wonMargin===null?'—':money(wonMargin))+'</strong><span>'+(wonMargin===null?'Falta costo estimado en oportunidades ganadas':'Oportunidades WON')+'</span></div><div><small>Margen abierto estimado</small><strong>'+(openMargin===null?'—':money(openMargin))+'</strong><span>'+open.length+' oportunidades abiertas</span></div><div><small>Meta del periodo</small><strong>'+(goal?money(goalValue):'—')+'</strong><span>'+(goal?'Margen objetivo':'Sin meta configurada')+'</span></div><div><small>Vendedores evaluados</small><strong>'+rows.length+'</strong><span>Evaluación preliminar</span></div></div><div class="admin-high-level-grid"><section><h3>Mejores vendedores</h3>'+topMarkup+'</section><section><h3>Avance de metas</h3>'+goalMarkup+'</section></div></article>';
}
function renderCollaboratorPerformance(){
 if(!canManageUsers())return '';
 if(failures.users)return '<article class="panel team-performance"><div class="panel-head"><h2>Desempeño del equipo</h2></div><p class="error">No se pudo cargar el equipo. Pulsa Actualizar para reintentar.</p></article>';
 const rows=sellerPerformanceRows();
 if(!rows.length)return '<article class="panel team-performance"><div class="panel-head"><h2>Desempeño del equipo</h2></div><div class="empty">Aún no hay colaboradores o vendedores vinculados a esta organización.</div></article>';
 const markup=rows.sort((a,b)=>b.performance-a.performance).map(item=>'<tr><td><strong>'+esc(item.user.full_name||'Sin nombre')+'</strong><small>'+esc(enums.role[item.user.role]||item.user.role||'Sin rol')+'</small></td><td>'+item.ownedLeads.length+'</td><td>'+item.ownedOpps.length+'<small>'+money(item.pipeline)+'</small></td><td>'+(item.wonMargin===null?'—':money(item.wonMargin))+'<small>'+(item.openMargin===null?'Margen pendiente':money(item.openMargin)+' abierto')+'</small></td><td>'+item.ownedTasks.length+'<small>'+item.followup+'% completadas</small></td><td><div class="team-score"><div class="score-track"><i style="width:'+item.performance+'%"></i></div><strong>'+item.performance+'%</strong><small>Desempeño preliminar</small></div></td><td><strong>'+(item.bonus===null?'—':money(item.bonus))+'</strong><small>'+(item.rate*100).toFixed(0)+'% referencial · pendiente de cierre</small></td></tr>').join('');
 return '<article class="panel team-performance"><div class="panel-head"><div><h2>Desempeño del equipo</h2><p class="muted">Seguimiento administrativo; el bono es referencial y no constituye una orden de pago.</p></div></div><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Leads</th><th>Oportunidades</th><th>Margen</th><th>Tareas</th><th>Desempeño</th><th>Bono referencial</th></tr></thead><tbody>'+markup+'</tbody></table></div><p class="muted">La evaluación combina resultado 40%, avance 20%, calidad de datos 15%, seguimiento 15% y colaboración 10%. Si una oportunidad ganada no tiene costo estimado, su margen y bono permanecen pendientes.</p></article>';
}
function renderDashboard(){
 if(!canViewDashboard()){$('dashboard').replaceChildren();return;}
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
 const alerts=priorities(data).filter(row=>Date.parse(row.due)<now.getTime()).slice(0,5);
 const alertMarkup=alerts.map(row=>{
  const value=row.value??row.estimated_value;
  const meta=[value!==undefined&&value!==null?money(value):'',row.score!==undefined&&row.score!==null?'Score '+row.score:'',date(row.due)].filter(Boolean).join(' · ');
  const action=row.recommendation||row.next_action||row.title||row.name||modules[row.table].label;
  return '<div class="alert-row"><span class="alert-icon">!</span><div><strong>'+esc(nameOf(row))+'</strong><small>'+esc(meta)+'</small><b>Acción recomendada: '+esc(action)+'</b></div></div>';
 }).join('');
 const priorityMarkup=agenda.map((row,index)=>{
  const value=row.value??row.estimated_value;
  const score=row.derived_score??row.score??row.probability;
  const meta=[relatedName(row)||modules[row.table].label,value!==undefined&&value!==null?money(value):'',score!==undefined&&score!==null?'Score '+score:''].filter(Boolean).join(' · ');
  const overdue=Date.parse(row.due)<now.getTime();
  const action=row.recommendation||row.next_action||row.title||row.name||modules[row.table].label;
  return `<div class="priority-row"><div class="priority-rank">${index+1}</div><div class="priority-main"><strong>${esc(nameOf(row))}</strong><small>${esc(meta)}</small><span class="priority-action">${esc(action)}</span></div><div class="priority-side"><span class="badge ${overdue?'warn':''}">${overdue?'Vencida':esc(date(row.due))}</span><button data-edit="${row.id}" data-table="${row.table}">Ver</button></div></div>`;
 }).join('');
 const stageMarkup=stages.map(stage=>`<div class="stage-row"><span>${stage.label}</span><div class="bar"><i style="width:${stage.count/maxStage*100}%"></i></div><b>${stage.count}</b><small>${money(stage.value)}</small></div>`).join('');
 const adminHighLevel=renderAdminHighLevel();
 $('dashboard').innerHTML=`${adminHighLevel}<div class="cards">${cards.map(([label,value,hint])=>`<article class="card"><small>${label}</small><strong>${value}</strong><small>${hint}</small></article>`).join('')}</div><div class="grid"><article class="panel"><div class="panel-head"><h2>Prioridades comerciales</h2><button data-page="opportunities">Ver oportunidades</button></div>${priorityMarkup||'<div class="empty">No hay seguimientos con fecha. Agrega una próxima acción para priorizarla.</div>'}</article><article class="panel"><div class="panel-head"><h2>Pipeline por etapa</h2><button data-page="opportunities">Ver todo</button></div>${failures.opportunities?'<p class="error">No disponible</p>':stageMarkup}</article></div><article class="panel task-summary"><div class="panel-head"><h2>Próximas tareas</h2><button data-page="tasks">Ver tareas</button></div><div class="task-summary-grid"><div><small>Hoy</small><strong>${failures.tasks?'—':taskCount(start,tomorrow)}</strong></div><div><small>Mañana</small><strong>${failures.tasks?'—':taskCount(tomorrow,dayAfter)}</strong></div><div class="task-summary-overdue"><small>Vencidas</small><strong>${failures.tasks?'—':overdueTasks}</strong></div></div></article><article class="panel alerts-panel"><div class="panel-head"><h2>Alertas</h2><button data-page="tasks">Ver seguimientos</button></div>${alertMarkup||'<div class="empty">No hay alertas activas.</div>'}</article>${failed.length?'<p class="error">Algunos módulos no están disponibles. Pulsa Actualizar para reintentar.</p>':''}${renderCollaboratorPerformance()}`;
}
function scopedRows(table){
 if(!accessible(table)&&table!=='scores')return [];
 return scopeWorkspaceData(data,profile,session?.user?.id,workspace)[table]||[];
}
function renderSellerWorkspaceSummary(){
 if(canViewDashboard()||page!=='leads')return '';
 const rows=scopedRows('leads'),scores=data.scores||[],now=Date.now();
 const active=rows.filter(row=>!['DISQUALIFIED','CONVERTED'].includes(row.status)).length;
 const due=rows.filter(row=>row.next_action_date&&Date.parse(row.next_action_date)<=now+7*86400000).length;
 const high=rows.filter(row=>Number(scores.find(score=>score.lead_id===row.id)?.total_score||0)>=75).length;
 return '<article class="seller-focus panel"><div><h2>Mi operación comercial</h2><p>Prioriza tus prospectos, registra cada interacción y trabaja la próxima acción sugerida.</p></div><div class="seller-focus-metrics"><span><b>'+active+'</b><small>Leads activos</small></span><span><b>'+high+'</b><small>Potencial alto</small></span><span><b>'+due+'</b><small>Seguimientos próximos</small></span></div></article>';
}
function filtered(){const config=modules[page];return filterRecords(scopedRows(page),$('search').value,config.filter,$('filter').value,relatedName);}
function scoreCell(row){
 const score=(data.scores||[]).find(item=>item.lead_id===row.id);
 const value=score?Math.max(0,Math.min(100,Number(score.total_score)||0)):0;
 return '<div class="score-cell" aria-label="Potencial '+(score?value+'%':'pendiente')+'"><div class="score-track"><i style="width:'+value+'%"></i></div><strong>'+(score?value+'%':'—')+'</strong><small>'+esc(score?.recommendation||'Pendiente de interacción')+'</small></div>';
}
function openActivityForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 openEditor('activities',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',type:'CALL',subject:'Primer contacto',outcome:'FOLLOW_UP',occurred_at:localDateTime(new Date().toISOString())});
}
function renderRecords(){
 const isUsers=page==='users',isGoals=page==='goals';
 $('importBtn').hidden=isUsers||isGoals||!writableFor(page);$('importBtn').disabled=loading||busy||!!failures[page];$('importHelp').hidden=isUsers||isGoals;
 $('sellerSummary').hidden=canViewDashboard()||page!=='leads';$('sellerSummary').innerHTML=renderSellerWorkspaceSummary();
 const rows=filtered();const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures[page]?'Información no disponible':rows.length+' registros';
 $('exportBtn').disabled=!!failures[page]||!rows.length;
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 const config=modules[page],canEdit=writableFor(page);
 const secondHeader=isUsers?'Rol':isGoals?'Responsable':page==='institutions'?'Ciudad':'Institución';
 const detailHeader=isGoals?'Meta de margen':(['leads','opportunities'].includes(page)?'Valor estimado':'Detalle');
 const rowsMarkup=rows.slice(pageIndex*size,(pageIndex+1)*size).map(row=>{
  const secondCell=isUsers?badge(row.role,page):isGoals?esc(relationName('owner_user_id',row)||'Organización'):esc(page==='institutions'?row.city||'—':relatedName(row)||'Sin vincular');
  const stateCell=isGoals?'<span class="badge success">Meta definida</span>':badge(row[config.filter],page);
  const detail=page==='goals'?money(row.target_margin):page==='opportunities'?money(row.value):page==='leads'?money(row.estimated_value):page==='tasks'?esc(date(row.due_at)):page==='activities'?esc(date(row.occurred_at)):esc(row.phone||'—');
  const actionLabel=canEdit?'Editar':'Ver';
  return '<tr><td><strong>'+esc(nameOf(row)||('Meta '+row.period_start))+'</strong><small>'+esc(isGoals?(row.period_start+' → '+row.period_end):(row.email||row.next_action||row.job_title||''))+'</small></td><td>'+secondCell+'</td><td>'+stateCell+'</td><td>'+detail+'</td>'+(page==='leads'?'<td>'+scoreCell(row)+'</td>':'')+'<td><div class="row-actions"><button data-edit="'+row.id+'" data-table="'+page+'">'+actionLabel+'</button>'+(page==='leads'&&writable()?'<button data-activity-lead="'+row.id+'">Registrar interacción</button>':'')+(!isUsers&&canDelete()?'<button class="danger-text" data-delete="'+row.id+'" data-table="'+page+'">Eliminar</button>':'')+'</div></td></tr>';
 }).join('');
 $('recordList').innerHTML=failures[page]?'<div class="panel empty">No pudimos cargar estos registros. Pulsa Actualizar.</div>':!rows.length?`<div class="panel empty">${$('search').value||$('filter').value?'No hay coincidencias. Cambia la búsqueda o el filtro.':'Aún no hay registros. Crea el primero con el botón superior.'}</div>`:`<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>${secondHeader}</th><th>Estado / tipo</th><th>${detailHeader}</th>${page==='leads'?'<th>Potencial</th>':''}<th>Acción</th></tr></thead><tbody>${rowsMarkup}</tbody></table></div>`;
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
  const table=relationTable(field.key);
  const found=scopedRows(table).find(row=>row.id===raw||normalize(nameOf(row))===normalize(raw));
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
  for(const field of fieldsFor(table)){
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
 const table=page,version=loadVersion,userId=session?.user?.id,org=profile?.organization_id;
 if(busy||loading||!writableFor(table)||['users','goals'].includes(table)||failures[table])return;
 const text=await file.text();
 if(version!==loadVersion||page!==table||userId!==session?.user?.id||!writableFor(table))return;
 const rows=parseCsv(text);
 if(!rows.length){notice('El CSV está vacío o no tiene encabezados.',true);return;}
 const result=buildImport(table,rows);
 if(result.errors.length){notice(result.errors.slice(0,3).join(' '),true);return;}
 if(!window.confirm('Se importarán '+result.payloads.length+' registros en '+modules[table].label+'. ¿Continuar?'))return;
 busy=true;render();notice('Importando '+result.payloads.length+' registros…');
 try{
  const {error}=await sb.from(databaseTable(table)).insert(result.payloads.map(row=>({...row,organization_id:org,created_by:userId})));
  if(error)throw error;
  if(version!==loadVersion||userId!==session?.user?.id)return;
  busy=false;await reload();notice('Se importaron '+result.payloads.length+' registros correctamente.');
 }catch(error){if(version===loadVersion)notice(errorText(error),true);}
 finally{busy=false;render();}
}
async function removeRecord(table,id){
 if(table==='users'||!accessible(table)||!canDelete()||busy||loading)return;
 const row=scopedRows(table).find(item=>item.id===id);if(!row)return;
 if(!window.confirm('¿Eliminar '+nameOf(row)+'? Esta acción no se puede deshacer.'))return;
 busy=true;notice('Eliminando…');
 try{
  const {error}=await sb.from(databaseTable(table)).delete().eq('id',id).eq('organization_id',profile.organization_id);
  if(error)throw error;
  busy=false;await reload();notice('Registro eliminado correctamente.');
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;render();}
}
function openEditor(table,id=null,initialValues={}){
 if(!accessible(table)||loading||busy||failures[table])return; if(table==='users'&&(!id||!canManageUsers()))return; if(table==='goals'&&!canManageGoals())return; if(!id&&!writableFor(table))return;
 const dependencies=fieldsFor(table).filter(f=>f.type==='relation').map(f=>relationTable(f.key));
 if(dependencies.some(k=>failures[k])){notice('Actualiza los módulos vinculados antes de abrir este formulario para conservar las relaciones del registro.',true);return;}
 const row=id?scopedRows(table).find(r=>r.id===id):{owner_user_id:table==='goals'?null:session.user.id,assigned_to:session.user.id,...initialValues};if(!row)return;
 editTable=table;editId=id;editingVersion=row.updated_at||null;
 $('editorTitle').textContent=`${id?(writableFor(table)?'Editar':'Ver'):'Crear'} ${modules[table].singular}`;$('formMsg').textContent='';
 $('fields').innerHTML=fieldsFor(table).map(field=>{
 let value=row[field.key]??({country:'Peru',type:'OTHER',priority:'MEDIUM',score:0,value:0,estimated_value:0,estimated_cost:'',probability:10,target_margin:0,target_won_value:0}[field.key]??'');if(field.type==='datetime-local')value=localDateTime(value);
 let options=field.options;if(field.type==='relation'){const source=relationTable(field.key);options=Object.fromEntries(scopedRows(source).map(r=>[r.id,nameOf(r)]));}
 let input;
 const attrs=`id="field-${field.key}" name="${field.key}" ${field.required?'required':''} ${!writableFor(editTable)?'disabled':''}`;
 if(options)input=`<select ${attrs}>${field.type==='relation'?'<option value="">Sin vincular</option>':''}${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
 else if(field.type==='textarea')input=`<textarea ${attrs}>${esc(value)}</textarea>`;
 else input=`<input ${attrs} type="${field.type}" value="${esc(value)}" ${field.type==='number'?`min="0" step="${['score','probability'].includes(field.key)?1:'0.01'}" ${['score','probability'].includes(field.key)?'max="100"':''}`:''} ${field.key==='ruc'?'pattern="[0-9]{11}" title="Ingresa 11 dígitos"':''}>`;
 return `<div class="${field.type==='textarea'?'full':''}"><label for="field-${field.key}">${field.label}${field.required?' *':''}</label>${input}</div>`;
 }).join('');
 const leadScore=id&&table==='leads'?(data.scores||[]).find(item=>item.lead_id===id):null;
 if(table==='leads'){
  const scoreValue=leadScore?Math.max(0,Math.min(100,Number(leadScore.total_score)||0)):0;
  $('fields').insertAdjacentHTML('beforeend','<section class="score-insight full" aria-live="polite"><div class="score-insight-head"><strong>Potencial calculado</strong><b>'+(leadScore?scoreValue+'%':'Pendiente')+'</b></div><div class="score-track"><i style="width:'+scoreValue+'%"></i></div><p>'+(esc(leadScore?.recommendation||'Se calculará al guardar el lead y registrar su primera interacción.'))+'</p><small>Motor explicable v1 · Fuente: '+(esc(leadScore?.recommendation_source||'RULES_V1'))+'</small></section>');
 }
 $('saveBtn').hidden=!writableFor(table);$('saveBtn').disabled=false;$('editor').showModal();
}
async function saveRecord(event){
 event.preventDefault();const canEdit=writableFor(editTable);if(busy||loading||!canEdit)return;
 if(editId&&!scopedRows(editTable).some(row=>row.id===editId))return;
 const payload={}, form=new FormData($('recordForm'));
 for(const field of fieldsFor(editTable)){let value=String(form.get(field.key)??'').trim();
 if(field.required&&!value){$('formMsg').textContent='Completa los campos obligatorios.';return;}
 if(field.type==='number')value=value===''?(field.key==='estimated_cost'?null:0):Number(value);
 else if(field.type==='datetime-local')value=value?new Date(value).toISOString():null;
 else value=value||null;payload[field.key]=value;
 }
 for(const field of fieldsFor(editTable)){
  const value=payload[field.key];
  if(field.type==='number'&&value!==null&&(!Number.isFinite(value)||value<0||(['score','probability'].includes(field.key)&&value>100))){
   $('formMsg').textContent='Revisa el valor de '+field.label+'.';return;
  }
  if(field.type==='relation'&&value&&!scopedRows(relationTable(field.key)).some(row=>row.id===value)){
   $('formMsg').textContent='Selecciona un registro disponible para '+field.label+'.';return;
  }
 }
 if(editTable==='goals'&&payload.period_start>payload.period_end){$('formMsg').textContent='El fin del periodo debe ser posterior o igual al inicio.';return;}
 if(payload.contact_id){const selected=data.contacts.find(c=>c.id===payload.contact_id);if(!selected||selected.institution_id&&selected.institution_id!==payload.institution_id){$('formMsg').textContent='El contacto debe pertenecer a la institución seleccionada.';return;}}
 busy=true;$('saveBtn').disabled=true;$('formMsg').textContent='Guardando…';
 const table=editTable,id=editId,org=profile.organization_id,userId=session.user.id,version=loadVersion;
 try{
 let query;if(id){if(table!=='users'&&table!=='activities'){payload.updated_at=new Date().toISOString();}query=sb.from(databaseTable(table)).update(payload).eq('id',id).eq('organization_id',org);if(table!=='users'&&table!=='activities'&&editingVersion)query=query.eq('updated_at',editingVersion);}
 else if(table!=='users')query=sb.from(databaseTable(table)).insert({...payload,organization_id:org,created_by:userId});else throw {code:'42501'};
 const {error}=await query.select('id').single();if(error)throw error;
 if(!session||session.user.id!==userId||version!==loadVersion)return;
 $('editor').close();busy=false;await reload();if(!failures[table])notice('Registro guardado correctamente.');
 }catch(error){$('formMsg').textContent=errorText(error);$('formMsg').className='error';}
 finally{busy=false;$('saveBtn').disabled=false;renderWorkspaceControls();}
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
 initTheme();
 $('adminModeBtn').onclick=()=>setWorkspace(ADMIN);$('sellerModeBtn').onclick=()=>setWorkspace(SELLER);renderWorkspaceControls();
 $('dateLabel').textContent=new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long'});
 $('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='night'?'day':'night',true);
 document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.passwordToggle){togglePassword(b);return;}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.activityLead){openActivityForLead(b.dataset.activityLead);return;}if(b.dataset.edit)openEditor(b.dataset.table,b.dataset.edit);if(b.dataset.delete)removeRecord(b.dataset.table,b.dataset.delete);if(b.dataset.mode)setMode(b.dataset.mode);});
 $('forgotBtn').onclick=()=>setMode('reset');$('backLogin').onclick=async()=>{if(recovery){await sb.auth.signOut();clearSession();recovery=false;}setMode('login');};
 $('authForm').onsubmit=authenticate;$('recordForm').onsubmit=saveRecord;$('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=importCsvFile;
 $('refreshBtn').onclick=reload;$('newBtn').onclick=()=>openEditor(page==='dashboard'?'institutions':page);
 $('search').oninput=$('filter').onchange=()=>{pageIndex=0;renderRecords();};
 $('previous').onclick=()=>{pageIndex--;renderRecords();};$('next').onclick=()=>{pageIndex++;renderRecords();};
 const close=()=>{if(!busy)$('editor').close();};$('closeEditor').onclick=$('cancelEditor').onclick=close;$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('logoutBtn').onclick=async()=>{const {error}=await sb.auth.signOut();if(error){notice(errorText(error),true);return;}clearSession();setMode('login');};
 $('exportBtn').onclick=()=>{if(!accessible(page)||loading||busy||failures[page])return;const columns=fieldsFor(page).map(field=>({key:field.key,label:field.label}));const rows=filtered().map(row=>Object.fromEntries(columns.map(c=>{const field=modules[page].fields.find(f=>f.key===c.key);return [c.key,field.type==='relation'?relationName(c.key,row):field.options?.[row[c.key]]||row[c.key]];})));const url=URL.createObjectURL(new Blob([csv(rows,columns)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`xicronix-${page}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!window.supabase){$('authMsg').textContent='No se pudo cargar el servicio de acceso. Comprueba tu conexión y recarga la página.';$('authBtn').disabled=true;return;}
 sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK');
 sb.auth.onAuthStateChange(handleAuth);
 const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}
}
// Both the SDK's defer script and module execution finish before DOMContentLoaded.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
