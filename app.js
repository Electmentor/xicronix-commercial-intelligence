import {escapeHTML as esc, filterRecords, money, metrics, priorities, taskUrgency, sortTasksByUrgency, csv, parseCsv, normalize} from './domain.mjs';

import {ADMIN, SELLER, effectiveWorkspace, workspaceKey, canAccessPage, canWriteModule, assignedUserId, scopeWorkspaceData} from './workspace.mjs';

import {DEMO_VERSION, DEMO_SELLERS, createDemoData, upgradeDemoData, mutateDemo, realOnly, localDay} from './demo.mjs';
import {renderExecutive, filterExecutiveRows, EXECUTIVE_METHOD} from './executive.mjs';
import {analyticsCSV} from './analytics.mjs';
import {catalogDisplayName, calculateQuote} from './catalog.mjs';
import {MILESTONE_META,MOVEMENT_ACTIONS,ACTION_MILESTONE,milestoneLabel,milestonePercent,movementMilestoneHelp,renderMilestoneRail} from './commercial-core.mjs';

const $ = id => document.getElementById(id);
const enums = {
 type:{UNIVERSITY:'Universidad',SCHOOL:'Colegio',INSTITUTE:'Instituto',CLINIC:'Clínica',HOSPITAL:'Hospital',COMPANY:'Empresa',GOVERNMENT:'Gobierno',RESEARCH_CENTER:'Centro de investigación',OTHER:'Otro'},
 status:{NEW:'Nuevo',RESEARCHING:'En investigación',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactado',QUALIFIED:'Calificado',DISQUALIFIED:'Descartado',CONVERTED:'Convertido'},
 stage:{DETECTED:'Detectada',CONTACT_PENDING:'Por contactar',CONTACTED:'Contactada',QUALIFIED:'Calificada',OPPORTUNITY:'Oportunidad',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida'},
 decision_level:{UNKNOWN:'Sin identificar',USER:'Usuario',INFLUENCER:'Influyente',RECOMMENDER:'Recomendador',DECISION_MAKER:'Decisor',FINAL_APPROVER:'Aprobador final'},
 taskStatus:{PENDING:'Pendiente',IN_PROGRESS:'En curso',COMPLETED:'Completada',CANCELLED:'Cancelada',OVERDUE:'Vencida'},
 meetingStatus:{SCHEDULED:'Programada',CONFIRMED:'Confirmada',COMPLETED:'Realizada',CANCELLED:'Cancelada'},
 attendeeStatus:{NOT_SENT:'Sin invitación',NEEDS_ACTION:'Pendiente de respuesta',ACCEPTED:'Aceptada',TENTATIVE:'Tentativa',DECLINED:'Rechazada'},
 meetingMode:{ONLINE:'Virtual',ONSITE:'Presencial',PHONE:'Llamada'},
 deliverableDirection:{XICRONIX_TO_CLIENT:'Xicronix → cliente',CLIENT_TO_XICRONIX:'Cliente → Xicronix'},
 deliverableStatus:{PENDING:'Pendiente',DELIVERED:'Entregado',RECEIVED:'Recibido',CANCELLED:'Cancelado'},
 documentCategory:{REQUEST_DIAGNOSIS:'Solicitud y diagnóstico',PROPOSALS_QUOTES:'Propuestas y cotizaciones',CONTRACTS_AUTHORIZATIONS:'Contratos y autorizaciones',BILLING_PAYMENTS:'Facturación y pagos',IMPLEMENTATION_DELIVERY:'Implementación y entrega',MANUALS_POSTSALE:'Manuales y postventa'},
 documentStatus:{DRAFT:'Borrador',CURRENT:'Vigente',SENT:'Enviado',SIGNED:'Firmado',REPLACED:'Reemplazado'},
 priority:{LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica'},
 role:{ADMIN:'Administrador',MANAGER:'Responsable',SALES:'Comercial',VIEWER:'Solo lectura'},
 activityType:{WEB_FORM:'Formulario web',CALL:'Llamada',WHATSAPP:'WhatsApp',EMAIL:'Correo',MEETING:'Reunión',VISIT:'Visita',DEMO:'Demostración',PROPOSAL_SENT:'Propuesta enviada',FOLLOW_UP:'Seguimiento',NOTE:'Nota',OTHER:'Otro'},
 leadSource:{WEBSITE:'Formulario web',EMAIL:'Correo',WHATSAPP:'WhatsApp',CALL:'Llamada',REFERRAL:'Referido',EVENT:'Evento',OTHER:'Otro'},
 activityOutcome:{INTERESTED:'Interesado',FOLLOW_UP:'Requiere seguimiento',NO_RESPONSE:'Sin respuesta',NOT_INTERESTED:'No interesado',QUALIFIED:'Calificado',DISQUALIFIED:'No califica'},
 movementAction:MOVEMENT_ACTIONS,
 expenseCategory:{PERSONNEL:'Personal',MARKETING:'Marketing',OPERATIONS:'Operaciones',TECHNOLOGY:'Tecnología',OTHER:'Otros'}
};
const f=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const transientFile={key:'_file',label:'Archivo / nueva versión',type:'file',required:false,transient:true};
const institution=f('institution_id','Institución','relation');
const contact=f('contact_id','Contacto','relation');
const followUp=[f('next_action','Próxima acción'),f('next_action_date','Fecha de seguimiento','datetime-local')];
const owner=f('owner_user_id','Responsable','relation');owner.adminOnly=true;
const assignee=f('assigned_to','Responsable','relation');assignee.adminOnly=true;
const cost=f('estimated_cost','Costo estimado (S/)','number');cost.adminOnly=true;
const catalogPrice=f('supplier_unit_price','Precio proveedor (USD)','number');
const costRateKeys=new Set(['ad_valorem_rate','igv_rate','perception_rate','contingency_rate']);
const catalogProduct=f('catalog_product_id','Producto de catálogo','relation');
const costProfile=f('cost_profile_id','Perfil de costos','relation');costProfile.adminOnly=true;
const quantity=f('quantity','Cantidad','number');
const discount=f('discount_pct','Descuento negociado (%)','number');
const negotiatedPrice=f('negotiated_unit_price','Precio unitario negociado (USD)','number');
const modules={
 institutions:{label:'Instituciones',singular:'institución',filter:'type',options:enums.type,fields:[f('name','Nombre','text',true),f('type','Tipo','select',true,enums.type),f('ruc','RUC'),f('city','Ciudad'),f('country','País','text',true),f('address','Dirección'),f('email','Correo','email'),f('phone','Teléfono','tel'),f('website','Sitio web','url'),f('notes','Notas','textarea')]},
 contacts:{label:'Contactos',singular:'contacto',filter:'decision_level',options:enums.decision_level,fields:[f('first_name','Nombres','text',true),f('last_name','Apellidos'),institution,f('job_title','Cargo'),f('decision_level','Nivel de decisión','select',true,enums.decision_level),f('email','Correo','email'),f('phone','Teléfono','tel'),f('notes','Notas','textarea')]},
 leads:{label:'Prospectos',singular:'prospecto',filter:'status',options:enums.status,fields:[f('title','Título','text',true),institution,contact,f('source','Canal de origen','select',false,enums.leadSource),f('status','Estado','select',true,enums.status),f('estimated_value','Valor estimado (S/)','number'),f('score','Calificación manual (0–100)','number'),owner,...followUp]},
 opportunities:{label:'Oportunidades',singular:'oportunidad',filter:'stage',options:enums.stage,fields:[f('name','Nombre','text',true),institution,contact,catalogProduct,costProfile,quantity,discount,negotiatedPrice,f('stage','Etapa','select',true,enums.stage),f('value','Valor (S/)','number'),cost,owner,f('probability','Probabilidad manual (%)','number'),f('expected_close_date','Cierre esperado','date'),...followUp]},
 tasks:{label:'Tareas',singular:'tarea',filter:'status',options:enums.taskStatus,fields:[f('title','Título','text',true),f('lead_id','Prospecto','relation'),institution,contact,f('status','Estado','select',true,enums.taskStatus),f('priority','Importancia manual','select',true,enums.priority),f('due_at','Fecha límite','datetime-local'),assignee]},
 meetings:{label:'Agenda',singular:'reunión',filter:'status',options:enums.meetingStatus,fields:[f('title','Título','text',true),f('lead_id','Prospecto','relation'),institution,contact,f('status','Estado','select',true,enums.meetingStatus),f('attendee_status','Confirmación del cliente','select',true,enums.attendeeStatus),f('mode','Modalidad','select',true,enums.meetingMode),f('start_at','Inicio','datetime-local',true),f('end_at','Fin','datetime-local',true),f('location','Lugar / enlace'),owner,f('notes','Notas','textarea')]},
 deliverables:{label:'Entregables',singular:'entregable',filter:'status',options:enums.deliverableStatus,fields:[f('title','Entregable','text',true),f('lead_id','Prospecto','relation',true),institution,contact,f('direction','Responsable de entrega','select',true,enums.deliverableDirection),f('status','Estado','select',true,enums.deliverableStatus),f('due_at','Fecha comprometida','datetime-local'),f('completed_at','Fecha de entrega / recepción','datetime-local'),f('notes','Notas','textarea')]},
 documents:{label:'Documentos',singular:'documento',filter:'status',options:enums.documentStatus,fields:[f('title','Documento','text',true),f('lead_id','Prospecto','relation',true),institution,contact,f('category','Carpeta','select',true,enums.documentCategory),f('status','Estado documental','select',true,enums.documentStatus),f('document_date','Fecha del documento','date'),f('notes','Notas','textarea'),transientFile]},
 activities:{label:'Movimientos',singular:'movimiento',filter:'action_code',options:MOVEMENT_ACTIONS,fields:[f('lead_id','Prospecto','relation',true),institution,contact,f('action_code','Acción realizada','select',false,MOVEMENT_ACTIONS),f('type','Canal','select',true,enums.activityType),f('subject','Asunto','text',true),f('outcome','Resultado','select',false,enums.activityOutcome),f('need_summary','Necesidad detectada','textarea'),f('decision_timeline','Horizonte de decisión'),f('budget_signal','Señal de presupuesto'),f('evidence_note','Evidencia / referencia','textarea'),f('notes','Notas','textarea'),f('occurred_at','Fecha y hora','datetime-local',true),f('next_action','Próxima acción'),f('next_action_date','Fecha de seguimiento','datetime-local')]},
 catalog_products:{label:'Catálogo',singular:'producto',filter:'category',options:{Fisica:'Física','Educacion STEM':'Educación STEM',Optica:'Óptica',Quimica:'Química',Robotica:'Robótica'},fields:[f('supplier_name','Proveedor','text',true),f('supplier_sku','SKU proveedor','text',true),f('name','Producto','text',true),f('category','Categoría','text',true),f('currency','Moneda','text',true),catalogPrice,f('price_valid_from','Vigencia desde','date'),f('price_valid_until','Vigencia hasta','date'),f('origin_country','País de origen','text',true),f('tariff_code','Subpartida peruana validada'),f('weight_kg','Peso (kg)','number'),f('volume_m3','Volumen (m³)','number'),f('reference_url','Referencia oficial','url'),f('active','Activo','checkbox'),f('notes','Fuente y condiciones','textarea')]},
 cost_profiles:{label:'Costos de importación',singular:'perfil de costos',filter:'destination_country',options:{Peru:'Perú'},fields:[f('name','Nombre','text',true),f('origin_country','Origen','text',true),f('destination_country','Destino','text',true),f('currency','Moneda','text',true),f('exchange_rate','Tipo de cambio','number',true),f('freight_international','Flete internacional','number'),f('insurance','Seguro','number'),f('ad_valorem_rate','Ad valorem (%)','number'),f('igv_rate','IGV (%)','number'),f('perception_rate','Percepción (%)','number'),f('customs_broker_fee','Agente de aduanas','number'),f('terminal_fee','Terminal','number'),f('storage_fee','Almacenaje','number'),f('inland_transport','Transporte interno','number'),f('installation_fee','Instalación','number'),f('contingency_rate','Contingencia (%)','number'),f('valid_from','Vigencia desde','date'),f('valid_until','Vigencia hasta','date'),f('notes','Notas','textarea')]},
 expenses:{label:'Gastos operativos',singular:'gasto operativo',filter:'category',options:enums.expenseCategory,fields:[f('description','Concepto','text',true),f('expense_date','Fecha del gasto','date',true),f('category','Categoría','select',true,enums.expenseCategory),f('amount','Importe (S/)','number',true),f('currency','Moneda','select',true,{PEN:'Soles (PEN)'}),f('notes','Notas','textarea')]},
 goals:{label:'Metas',singular:'meta',fields:[owner,f('period_start','Inicio del periodo','date',true),f('period_end','Fin del periodo','date',true),f('target_margin','Meta de margen bruto (S/)','number',true),f('target_won_value','Meta de ventas ganadas (S/)','number',true),f('target_expenses','Presupuesto de gastos operativos (S/)','number'),f('notes','Notas','textarea')]},
 users:{label:'Usuarios',singular:'usuario',filter:'role',options:enums.role,fields:[f('full_name','Nombre completo','text',true),f('role','Rol','select',true,enums.role)]}
};
let sb, session=null, profile=null, data={}, failures={}, page='dashboard', pageIndex=0, editTable=null, editId=null, editingVersion=null, mode='login', recovery=false, loadVersion=0, busy=false, resetCooldownUntil=0, resetCooldownTimer=null;
const size=20;
const PUBLIC_APP_URL='https://xicronix-commercial-intelligence.vercel.app/';
const CRM_RELEASE='2026-09-18-v2.8';
const REMEMBER_EMAIL_KEY='xicronix.crm.remembered-email';
const RECOVERY_KEY='xicronix.crm.password-recovery';
let entryRoute=readEntryRoute();
const emptyData=()=>Object.fromEntries([...Object.keys(modules),'scores','document_versions'].map(k=>[k,[]]));
const writable=()=>profile && ['ADMIN','MANAGER','SALES'].includes(profile.role);
let workspace=SELLER, workspaceIdentity=null, loading=false;
let dataSource='live', sourceIdentity=null, demoData=null, demoSeller=DEMO_SELLERS[0].id, demoSaved=true, executiveFilter='', executiveOwner='';
let analyticsPeriod='year';
const currentActor=()=>dataSource==='demo'?demoSeller:session?.user?.id;
const sourceKey=()=>workspaceIdentity+':source-v'+DEMO_VERSION;
const demoKey=()=>workspaceIdentity+':demo-v'+DEMO_VERSION;
function restoreSource(){
 if(sourceIdentity===workspaceIdentity)return;
 sourceIdentity=workspaceIdentity;demoData=null;demoSeller=DEMO_SELLERS[0].id;
 let saved;try{saved=localStorage.getItem(sourceKey());}catch(_error){}
 dataSource=entryRoute?.lead?'live':saved==='demo'?'demo':'live';
}
function loadDemo(){
 if(!demoData){
  try{const saved=JSON.parse(localStorage.getItem(demoKey())||'null');if(saved&&Object.keys(emptyData()).filter(key=>key!=='expenses').every(key=>Array.isArray(saved[key])&&saved[key].every(row=>row&&row.organization_id===profile.organization_id))&&(!saved.expenses||Array.isArray(saved.expenses)&&saved.expenses.every(row=>row&&row.organization_id===profile.organization_id)))demoData=saved;}catch(_error){}
  if(!demoData)demoData=createDemoData(profile.organization_id);
  upgradeDemoData(demoData,profile.organization_id);persistDemo();
 }
 data=scopeWorkspaceData(demoData,profile,currentActor(),workspace);failures={};
}
function persistDemo(){
 demoSaved=true;try{localStorage.setItem(demoKey(),JSON.stringify(demoData));}catch(_error){demoSaved=false;}
}
function demoSavedMessage(){return demoSaved?'Simulación guardada en este navegador; no modifica datos reales.':'Simulación guardada solo en esta sesión: el navegador no permitió conservarla.';}
function clearWorkspaceViews(){
 closeLeadDetails(false);
 $('fields').replaceChildren();editTable=null;editId=null;editingVersion=null;
 data=emptyData();failures={};executiveFilter='';executiveOwner='';
 $('dashboard').replaceChildren();$('recordList').replaceChildren();$('sellerSummary').replaceChildren();
}
async function setDataSource(next){
 if(!['live','demo'].includes(next)||!profile||busy||loading)return;
 if($('editor').open){notice('Guarda o cancela el formulario antes de cambiar de datos.',true);return;}
 if(next===dataSource)return;
 dataSource=next;try{localStorage.setItem(sourceKey(),next);}catch(_error){}
 clearWorkspaceViews();navigate(canViewDashboard()?'dashboard':'leads');await reload();
}
function resetDemo(){
 if(dataSource!=='demo'||busy||loading||$('editor').open)return;
 if(!window.confirm('¿Restablecer los casos simulados? Solo se perderán los cambios de la demostración en este navegador. Los datos reales no se modifican.'))return;
 demoData=createDemoData(profile.organization_id);persistDemo();clearWorkspaceViews();loadDemo();render();notice('Demostración restablecida.');
}
function selectDemoSeller(){
 const next=$('demoSeller').value;
 if(busy||loading||$('editor').open||!isAdminAccount()||dataSource!=='demo'||!DEMO_SELLERS.some(row=>row.id===next)){$('demoSeller').value=demoSeller;return;}
 demoSeller=next;clearWorkspaceViews();loadDemo();navigate('leads');
}
function openExecutiveView(view,owner=''){
 if(!canViewDashboard())return;
 navigate('opportunities');executiveFilter=view;executiveOwner=owner;renderRecords();
}
const isAdminAccount=()=>profile?.role==='ADMIN';
const canViewDashboard=()=>!!profile && effectiveWorkspace(profile,workspace)===ADMIN;
const canManageUsers=canViewDashboard;
const canManageGoals=canViewDashboard;
const canDelete=canViewDashboard;
const accessible=table=>canAccessPage(profile,workspace,table);
const writableFor=table=>canWriteModule(profile,workspace,table);
const fieldsFor=table=>(modules[table]?.fields||[]).filter(field=>!field.adminOnly||canViewDashboard());
const databaseTable=table=>({users:'profiles',goals:'commercial_goals',expenses:'commercial_expenses'})[table]||table;
function restoreWorkspace(){
 const identity=workspaceKey(session.user.id,profile.organization_id);
 if(workspaceIdentity!==identity){
  let saved=ADMIN;try{saved=localStorage.getItem(identity)||ADMIN;}catch(_error){}
  workspace=effectiveWorkspace(profile,saved);workspaceIdentity=identity;
 }else workspace=effectiveWorkspace(profile,workspace);
}
function renderWorkspaceControls(){
 const admin=canViewDashboard();
 $('sourceToggle').textContent=dataSource==='demo'?'Ver datos reales':'Ver demostración';
 $('sourceToggle').disabled=$('resetDemoBtn').disabled=loading||busy;
 $('sourceBadge').textContent=dataSource==='demo'?'DEMOSTRACIÓN · SIN PAGOS':'DATOS REALES';
 $('sourceBadge').className='source-badge '+(dataSource==='demo'?'demo':'live');
 $('resetDemoBtn').hidden=dataSource!=='demo';
 $('demoSellerField').hidden=dataSource!=='demo'||admin||!isAdminAccount();
 $('demoSeller').innerHTML=DEMO_SELLERS.map(row=>'<option value="'+row.id+'">'+esc(row.full_name)+' (demo)</option>').join('');$('demoSeller').value=demoSeller;
 $('demoSeller').disabled=loading||busy;
 $('workspaceControls').hidden=!profile;
 $('complaintsLink').hidden=!admin||dataSource!=='live';
 $('adminModeBtn').hidden=!isAdminAccount();
 $('adminModeBtn').setAttribute('aria-pressed',String(admin));
 $('sellerModeBtn').setAttribute('aria-pressed',String(!admin));
 $('adminModeBtn').disabled=$('sellerModeBtn').disabled=loading||busy;
 $('workspaceHint').textContent=admin?'Visión global: resultados, margen, metas y equipo.':'Mi cartera: prospectos, potencial, interacciones y próximas acciones.';
 $('workspaceLabel').textContent=admin?'DIRECCIÓN COMERCIAL':'MI ESPACIO DE VENTAS';
 $('appView').dataset.workspace=admin?ADMIN:SELLER;
 const labels=admin?{}:{leads:'Mi cartera',opportunities:'Mis oportunidades',tasks:'Mis tareas',meetings:'Mi agenda',deliverables:'Mis entregables',documents:'Mis documentos',activities:'Mis movimientos',institutions:'Mis instituciones',contacts:'Mis contactos',catalog_products:'Catálogo de productos'};
 const keys=admin?['dashboard',...Object.keys(modules)]:['leads','tasks','meetings','deliverables','documents','activities','opportunities','catalog_products','institutions','contacts'];
 $('navigation').innerHTML=keys.filter(accessible).map((key,index)=>'<button data-page="'+key+'"><span class="nav-index">'+String(index+1).padStart(2,'0')+'</span>'+(labels[key]||modules[key]?.label||'Resumen ejecutivo')+'</button>').join('');
}
async function setWorkspace(next){
 if(![ADMIN,SELLER].includes(next)||!profile||busy||loading)return;
 if(next===ADMIN&&!isAdminAccount()){notice('El modo administrador requiere una cuenta con ese rol.',true);return;}
 if($('editor').open){notice('Guarda o cancela el formulario antes de cambiar de modo.',true);return;}
 if(next===workspace)return;
 workspace=effectiveWorkspace(profile,next);
 try{localStorage.setItem(workspaceIdentity,workspace);}catch(_error){}
 clearWorkspaceViews();
 navigate(workspace===ADMIN?'dashboard':'leads');
 await reload();
}
const THEME_STORAGE_KEY='xicronix-theme';
const SIDEBAR_STORAGE_KEY='xicronix-sidebar-collapsed';
const authRedirectUrl=()=>PUBLIC_APP_URL;
const nameOf=row=>row.name || row.title || row.subject || row.description || row.full_name || [row.first_name,row.last_name].filter(Boolean).join(' ');
const relatedName=row=>data.institutions?.find(i=>i.id===row.institution_id)?.name || '';
const relationTable=key=>({institution_id:'institutions',contact_id:'contacts',lead_id:'leads',opportunity_id:'opportunities',owner_user_id:'users',assigned_to:'users',catalog_product_id:'catalog_products',cost_profile_id:'cost_profiles'})[key];
const relationName=(key,row)=>{const table=relationTable(key);return table?nameOf((data[table]||[]).find(item=>item.id===row[key])||{}):'';};
const date=value=>value?new Date(value).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
const catalogMoney=value=>'USD '+new Intl.NumberFormat('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
const notice=(message,error=false)=>{ $('status').hidden=!message;$('status').textContent=message;$('status').className='notice'+(error?' error':''); };
function errorText(error){
 const code=error?.code;
 if(code==='invalid_credentials')return 'Correo o contraseña incorrectos.';
 if(['otp_expired','invalid_token','bad_jwt'].includes(code))return 'El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo y ábrelo una sola vez.';
 if(code==='email_not_confirmed')return 'Confirma tu correo antes de ingresar.';
 if(code==='over_email_send_rate_limit'||error?.status===429)return 'Se alcanzó el límite de intentos. Espera unos minutos y vuelve a intentar.';
 if(code==='weak_password')return 'Usa una contraseña única de al menos 12 caracteres.';
 if(code==='same_password')return 'Elige una contraseña diferente a la anterior.';
 if(code==='23505')return 'Ya existe un registro con esos datos.';
 if(code==='42501')return 'Tu cuenta no tiene permiso para esta operación.';
 if(code==='PGRST116')return 'El registro cambió o ya no está disponible. Actualiza e intenta nuevamente.';
 return 'No se pudo completar la operación. Comprueba tu conexión e inténtalo nuevamente.';
}
function setMode(next){
 const previousEmail=$('email').value,previousRemember=$('rememberEmail').checked;
 mode=next; $('authForm').reset();restoreRememberedEmail(previousEmail);$('rememberEmail').checked=previousRemember||$('rememberEmail').checked;resetPasswordVisibility();$('authMsg').textContent='';
 const reset=next==='reset', update=next==='update';
 $('authTitle').textContent={login:'Ingresar',signup:'Crear usuario',reset:'Recuperar acceso',update:'Nueva contraseña'}[next];
 $('authBtn').textContent={login:'Ingresar',signup:'Crear usuario',reset:'Enviar enlace de recuperación',update:'Guardar contraseña'}[next];
 $('authHint').textContent=reset?'Te enviaremos un enlace para cambiar tu contraseña.':update?'Elige una contraseña única de al menos 12 caracteres.':'Accede con tu correo y contraseña.';
 $('authTabs').hidden=reset||update;$('forgotBtn').hidden=next!=='login';$('backLogin').hidden=!(reset||update);
 $('emailField').hidden=false;$('email').required=!update;$('email').readOnly=update;if(update)$('email').value=session?.user.email||previousEmail;
 $('rememberEmailLabel').hidden=update;$('recoveryHelp').hidden=!reset;
 $('passwordField').hidden=reset;$('password').required=!reset;$('password').disabled=reset;$('password').minLength=next==='login'?6:12;$('confirmPassword').minLength=12;
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
 closeLeadDetails(false);
 loadVersion++;session=null;profile=null;data=emptyData();failures={};page='dashboard';pageIndex=0;workspace=SELLER;workspaceIdentity=null;loading=false;dataSource='live';sourceIdentity=null;demoData=null;executiveFilter='';executiveOwner='';editTable=null;editId=null;editingVersion=null;
 $('fields').replaceChildren();$('sellerSummary').replaceChildren();$('navigation').replaceChildren();$('workspaceControls').hidden=true;
 if($('editor').open)$('editor').close();$('appView').hidden=true;$('authView').hidden=false;$('dashboard').replaceChildren();$('recordList').replaceChildren();
}
function rowQuery(table,org){
 let query=sb.from(databaseTable(table)).select('*').eq('organization_id',org);
 if(!canViewDashboard()&&['leads','opportunities','tasks','meetings'].includes(table)){
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
 restoreWorkspace();restoreSource();
 $('userRole').textContent=enums.role[profile.role]||'Sin rol';$('welcome').textContent=profile.full_name||session.user.email;
 if(dataSource==='demo'){loadDemo();notice('');render();return;}
 const tables=[...Object.keys(modules).filter(accessible),'scores',...(accessible('documents')?['document_versions']:[])];
 const results=await Promise.allSettled(tables.map(k=>allRows(k,profile.organization_id)));
 if(version!==loadVersion)return;
 data=emptyData();failures={};tables.forEach((k,i)=>{if(results[i].status==='fulfilled')data[k]=results[i].value;else failures[k]=true;});
 data=scopeWorkspaceData(realOnly(data),profile,userId,workspace);
 render();const bad=Object.keys(failures);notice(bad.length?'No se pudo cargar: '+bad.map(k=>modules[k]?.label||k).join(', ')+'. Pulsa Actualizar para reintentar.':'',!!bad.length);
 }catch(error){if(version===loadVersion){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice(errorText(error),true);}}
 finally{if(version===loadVersion){loading=false;$('refreshBtn').disabled=false;render();applyEntryRoute();}}
}
function applyTheme(theme,persist=false){
 const night=theme==='night';document.documentElement.dataset.theme=night?'night':'day';
 const button=$('themeToggle');if(button){button.textContent=night?'☀️ Modo diurno':'🌙 Modo nocturno';button.setAttribute('aria-pressed',String(night));button.setAttribute('aria-label',night?'Cambiar a modo diurno':'Cambiar a modo nocturno');button.title=night?'Usar fondo claro':'Usar fondo oscuro';}
 if(persist){try{localStorage.setItem(THEME_STORAGE_KEY,night?'night':'day');}catch(_error){}}
}
function initTheme(){let stored='';try{stored=localStorage.getItem(THEME_STORAGE_KEY)||'';}catch(_error){}applyTheme(stored==='night'?'night':'day');}
function applySidebar(collapsed,persist=false){
 const app=$('appView'),button=$('sidebarToggle');if(!app||!button)return;
 app.classList.toggle('sidebar-collapsed',collapsed);button.textContent=collapsed?'›':'‹';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Mostrar navegación':'Ocultar navegación');button.title=collapsed?'Mostrar navegación':'Ocultar navegación';
 if(persist){try{localStorage.setItem(SIDEBAR_STORAGE_KEY,collapsed?'1':'0');}catch(_error){}}
}
function initSidebar(){let stored='';try{stored=localStorage.getItem(SIDEBAR_STORAGE_KEY)||'';}catch(_error){}applySidebar(stored==='1');}
function navigate(next){
 if(busy||$('editor').open)return;
 if(!accessible(next))next=canViewDashboard()?'dashboard':'leads';
 page=next;pageIndex=0;executiveFilter='';executiveOwner='';$('search').value='';
 rememberPage();
 const config=modules[page];$('filter').dataset.page=page;
 $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(config?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 render();
}
function badge(value,table){return `<span class="badge ${['WON','COMPLETED'].includes(value)?'success':['OVERDUE','CRITICAL'].includes(value)?'warn':''}">${esc(modules[table]?.options?.[value]||enums.priority[value]||value||'—')}</span>`;}
function attentionRows(){
 return scopedRows('leads').filter(row=>row.source==='WEBSITE'&&!['DISQUALIFIED','CONVERTED'].includes(row.status)&&!row.first_human_response_at).sort((a,b)=>{
  const ad=Date.parse(a.attention_due_at||a.next_action_date||a.created_at),bd=Date.parse(b.attention_due_at||b.next_action_date||b.created_at);
  return ad-bd;
 });
}
function waitLabel(row){
 const start=Date.parse(row.created_at),now=Date.now();if(!Number.isFinite(start))return 'Tiempo no disponible';
 const mins=Math.max(0,Math.floor((now-start)/60000));
 if(mins<60)return mins+' min esperando';
 const hours=Math.floor(mins/60),rem=mins%60;if(hours<24)return hours+' h '+rem+' min esperando';
 const days=Math.floor(hours/24);return days+' d '+(hours%24)+' h esperando';
}
function renderAttentionButton(){
 const rows=attentionRows();const button=$('attentionBtn'),count=$('attentionCount');if(!button||!count)return;
 count.textContent=String(rows.length);button.classList.toggle('has-alerts',rows.length>0);
 button.setAttribute('aria-label',rows.length?rows.length+' solicitudes requieren atención':'Sin solicitudes pendientes de primera respuesta');
}
function renderAttentionCenter(){
 const rows=attentionRows(),target=$('attentionContent');if(!target)return;
 if(!rows.length){target.innerHTML='<div class="panel empty">No hay solicitudes web pendientes de primera respuesta humana.</div>';return;}
 target.innerHTML='<div class="attention-list">'+rows.map(row=>{
  const institution=(data.institutions||[]).find(i=>i.id===row.institution_id);
  const contact=(data.contacts||[]).find(c=>c.id===row.contact_id);
  const due=row.attention_due_at||row.next_action_date;
  const overdue=due&&Date.parse(due)<Date.now();
  return '<article class="attention-item '+(overdue?'overdue':'')+'"><div><small>'+esc(row.routing_area||'COMMERCIAL')+'</small><h3>'+esc(institution?.name||row.title)+'</h3><p>'+esc(contact?nameOf(contact):'Contacto pendiente')+' · '+esc(waitLabel(row))+'</p><p><strong>'+(overdue?'SLA interno vencido':'SLA interno')+':</strong> '+esc(date(due))+'</p></div><div class="attention-actions"><button type="button" data-attention-open="'+row.id+'" class="primary">Abrir prospecto</button></div></article>';
 }).join('')+'</div>';
}
function openAttention(){
 if(loading||busy||!profile)return;renderAttentionCenter();$('attentionDialog').showModal();
}
function render(){
 renderWorkspaceControls();
 renderAttentionButton();
 if(!accessible(page)){page=canViewDashboard()?'dashboard':'leads';pageIndex=0;$('search').value='';$('filter').value='';}
 if($('filter').dataset.page!==page){
  $('filter').dataset.page=page;
  $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(modules[page]?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 }
 const admin=canViewDashboard();
 $('appView').dataset.page=page;$('appView').dataset.source=dataSource;
 $('dashboard').hidden=page!=='dashboard';$('records').hidden=page==='dashboard';
 $('pageTitle').textContent=page==='dashboard'?'Centro de decisiones':!admin&&page==='leads'?'Mi cartera de prospectos':modules[page].label;
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
function renderDashboard(){
 if(!canViewDashboard()){$('dashboard').replaceChildren();return;}
 $('dashboard').innerHTML=renderExecutive(data,{demo:dataSource==='demo',failures,analyticsPeriod});
}
function setAnalyticsPeriod(period){
 if(!canViewDashboard()||loading||busy||!['month','quarter','year'].includes(period))return;
 analyticsPeriod=period;renderDashboard();
 document.querySelector('[data-analytics-period="'+period+'"]')?.focus({preventScroll:true});
}
function exportAnalytics(){
 if(!canViewDashboard()||loading||busy||['opportunities','goals','expenses'].some(key=>failures[key]))return;
 const content=analyticsCSV(data,{period:analyticsPeriod,demo:dataSource==='demo'});
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download='xicronix-rendimiento-'+(dataSource==='demo'?'SIMULADO-':'')+analyticsPeriod+'-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function scopedRows(table){
 if(!accessible(table)&&table!=='scores')return [];
 return scopeWorkspaceData(data,profile,currentActor(),workspace)[table]||[];
}
function renderTaskPrioritySummary(){
 if(canViewDashboard()||page!=='tasks')return '';
 const rows=sortTasksByUrgency(scopedRows('tasks').filter(row=>!['COMPLETED','CANCELLED'].includes(row.status)),Date.now());
 const overdue=rows.filter(row=>taskUrgency(row).band==='OVERDUE').length;
 const next72=rows.filter(row=>['TODAY','SOON'].includes(taskUrgency(row).band)).length;
 const unscheduled=rows.filter(row=>taskUrgency(row).band==='UNSCHEDULED').length;
 const top=rows[0];
 return '<article class="seller-focus panel task-focus"><div><h2>Qué atender primero</h2><p>'+(top?'Primero: '+esc(top.title)+(taskUrgency(top).hasDate?' · '+esc(date(top.due_at)):' · sin fecha definida'):'No hay tareas abiertas.')+'</p></div><div class="seller-focus-metrics"><span><b>'+overdue+'</b><small>Vencidas</small></span><span><b>'+next72+'</b><small>Próximas 72 h</small></span><span><b>'+unscheduled+'</b><small>Sin fecha</small></span></div></article>';
}
function renderSellerWorkspaceSummary(){
 if(canViewDashboard()||page!=='leads')return '';
 const rows=scopedRows('leads'),scores=data.scores||[],now=Date.now();
 const active=rows.filter(row=>!['DISQUALIFIED','CONVERTED'].includes(row.status)).length;
 const due=rows.filter(row=>row.next_action_date&&Date.parse(row.next_action_date)<=now+7*86400000).length;
 const high=rows.filter(row=>Number(scores.find(score=>score.lead_id===row.id)?.total_score||0)>=75).length;
 return '<article class="seller-focus panel"><div><h2>Mi operación comercial</h2><p>Prioriza tus prospectos, registra cada interacción y trabaja la próxima acción sugerida.</p></div><div class="seller-focus-metrics"><span><b>'+active+'</b><small>Leads activos</small></span><span><b>'+high+'</b><small>Potencial alto</small></span><span><b>'+due+'</b><small>Seguimientos próximos</small></span></div></article>';
}
function filtered(){const config=modules[page];const rows=filterRecords(filterExecutiveRows(scopedRows(page),page,executiveFilter,executiveOwner),$('search').value,config.filter,$('filter').value,row=>[relatedName(row),relationName('lead_id',row),row.supplier_sku,row.supplier_name,enums.documentCategory[row.category]].filter(Boolean).join(' '));if(page==='tasks')return sortTasksByUrgency(rows,Date.now());if(page==='meetings')return rows.slice().sort((a,b)=>String(a.start_at||'').localeCompare(String(b.start_at||'')));return page==='expenses'?rows.slice().sort((a,b)=>String(b.expense_date||'').localeCompare(String(a.expense_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||''))):rows;}
function urgencyCell(row){
 const u=taskUrgency(row,Date.now());
 const cls=['OVERDUE','TODAY'].includes(u.band)?'warn':['SOON','WEEK'].includes(u.band)?'active':'';
 return '<div class="task-urgency '+cls+'"><strong>'+esc(u.label)+'</strong><small>Importancia: '+esc(enums.priority[row.priority]||row.priority||'Sin definir')+'</small><small>'+(u.hasDate?esc(date(row.due_at)):'Debe definirse una fecha')+'</small></div>';
}
function maturityCell(row){
 const score=(data.scores||[]).find(item=>item.lead_id===row.id);
 const potential=score?Math.max(0,Math.min(100,Number(score.total_score)||0)):null;
 const maturity=Math.max(0,Math.min(100,Number(row.maturity_percent)||0));
 return '<div class="score-cell commercial-progress" aria-label="Madurez '+maturity+'%"><div class="commercial-progress-head"><strong>Madurez '+maturity+'%</strong><small>'+esc(milestoneLabel(row.commercial_milestone))+'</small></div><div class="score-track"><i style="width:'+maturity+'%"></i></div><small>Potencial calculado: '+(potential===null?'pendiente':potential+'%')+'</small></div>';
}
function scoreCell(row){
 const score=(data.scores||[]).find(item=>item.lead_id===row.id);
 const value=score?Math.max(0,Math.min(100,Number(score.total_score)||0)):0;
 const opportunity=(data.opportunities||[]).find(item=>item.lead_id===row.id);
 const label=row.status==='CONVERTED'?'Potencial al convertir':'Potencial';
 const recommendation=row.status==='CONVERTED'?(opportunity?'Lead convertido · continuar '+(enums.stage[opportunity.stage]||'oportunidad'):'Lead convertido · crear o vincular una oportunidad'):(score?.recommendation||'Pendiente de interacción');
 return '<div class="score-cell" aria-label="'+label+' '+(score?value+'%':'pendiente')+'"><div class="score-track"><i style="width:'+value+'%"></i></div><strong>'+(score?value+'%':'—')+'</strong><small>'+esc(recommendation)+'</small></div>';
}
function openActivityForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 openEditor('activities',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',action_code:'',type:'',subject:'',outcome:'',occurred_at:new Date().toISOString()});
}
function openTaskForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 closeLeadDetails(false);
 openEditor('tasks',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',status:'PENDING',priority:'MEDIUM'});
}
function meetingConflictRows(row,startAt,endAt,ownerId){
 const start=Date.parse(startAt),end=Date.parse(endAt);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!ownerId)return [];
 return (data.meetings||[]).filter(item=>item.id!==row?.id&&item.owner_user_id===ownerId&&item.status!=='CANCELLED'&&Date.parse(item.start_at)<end&&Date.parse(item.end_at)>start);
}
function updateMeetingPreview(){
 if(editTable!=='meetings')return;
 const target=$('meetingPreview');if(!target)return;
 const start=$('field-start_at')?.value,end=$('field-end_at')?.value,ownerId=$('field-owner_user_id')?.value||currentActor();
 if(!start||!end){target.textContent='Define inicio y fin para comprobar cruces de agenda.';target.className='meeting-preview full';return;}
 const startIso=new Date(start).toISOString(),endIso=new Date(end).toISOString();
 if(Date.parse(endIso)<=Date.parse(startIso)){target.textContent='La hora de fin debe ser posterior al inicio.';target.className='meeting-preview full warn';return;}
 const current=editId?scopedRows('meetings').find(row=>row.id===editId):null;
 const conflicts=meetingConflictRows(current,startIso,endIso,ownerId);
 target.textContent=conflicts.length?'Conflicto detectado con '+conflicts.length+' reunión(es): '+conflicts.slice(0,2).map(row=>row.title).join(' · '):'Sin cruces con las reuniones registradas en el CRM.';
 target.className='meeting-preview full'+(conflicts.length?' warn':'');
}
function openMeetingForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 const institution=(data.institutions||[]).find(row=>row.id===lead.institution_id);
 closeLeadDetails(false);
 openEditor('meetings',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'Reunión · '+(institution?.name||lead.title),status:'SCHEDULED',attendee_status:'NOT_SENT',mode:'ONLINE',owner_user_id:lead.owner_user_id||currentActor()});
}
function openDeliverableForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 closeLeadDetails(false);
 openEditor('deliverables',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',direction:'XICRONIX_TO_CLIENT',status:'PENDING'});
}
function openDocumentForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 closeLeadDetails(false);
 openEditor('documents',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',category:'REQUEST_DIAGNOSIS',status:'DRAFT'});
}
function currentDocumentVersion(documentId){
 return (data.document_versions||[]).find(row=>row.document_id===documentId&&row.is_current)
   ||(data.document_versions||[]).filter(row=>row.document_id===documentId).sort((a,b)=>Number(b.version_number)-Number(a.version_number))[0]
   ||null;
}
async function openPrivateStoragePath(storagePath){
 if(!storagePath){notice('Este documento todavía no tiene un archivo cargado.',true);return;}
 const popup=window.open('about:blank','_blank','noopener,noreferrer');
 try{
  const {data:signed,error}=await sb.storage.from('crm-documents').createSignedUrl(storagePath,300);
  if(error||!signed?.signedUrl)throw error||new Error('signed_url_failed');
  if(popup)popup.location=signed.signedUrl;else window.open(signed.signedUrl,'_blank','noopener,noreferrer');
 }catch(error){if(popup)popup.close();notice('No se pudo abrir el archivo privado. Actualiza e inténtalo nuevamente.',true);}
}
async function openDocumentFile(documentId){
 const document=(data.documents||[]).find(row=>row.id===documentId);if(!document)return;
 const version=currentDocumentVersion(documentId);
 return openPrivateStoragePath(version?.storage_path);
}
async function openDocumentVersion(versionId){
 const version=(data.document_versions||[]).find(row=>row.id===versionId);if(!version)return;
 return openPrivateStoragePath(version.storage_path);
}
function safeStorageFileName(name){
 return String(name||'archivo').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'archivo';
}
function commercialUrgency(tasks,meetings){
 const pending=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
 const top=pending[0],u=top?taskUrgency(top,Date.now()):null;
 if(u&&['OVERDUE','TODAY'].includes(u.band))return {label:'Alta',className:'critical'};
 if(u&&['SOON','WEEK'].includes(u.band))return {label:'Media',className:'moderate'};
 const nextMeeting=meetings.find(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=Date.now());
 if(nextMeeting&&Date.parse(nextMeeting.start_at)-Date.now()<=72*3600000)return {label:'Media',className:'moderate'};
 return {label:'Baja',className:'favorable'};
}
function commercialPotential(score){
 if(!score)return {label:'Pendiente',className:'moderate'};
 const value=Math.max(0,Math.min(100,Number(score.total_score)||0));
 return value>=75?{label:'Alto',className:'favorable',value}:value>=50?{label:'Medio',className:'moderate',value}:{label:'Bajo',className:'critical',value};
}
function commercialHealth(lead,urgency,potential){
 const maturity=Math.max(0,Math.min(100,Number(lead.maturity_percent)||0));
 if(urgency.label==='Alta'&&maturity<50)return {label:'Crítico',className:'critical'};
 if(potential.label==='Alto'&&urgency.label!=='Alta'&&maturity>=30)return {label:'Favorable',className:'favorable'};
 return {label:'Moderado',className:'moderate'};
}
function nextCommercialAction(lead,tasks,meetings){
 const pending=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
 if(pending[0])return pending[0].title;
 const nextMeeting=meetings.find(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=Date.now());
 if(nextMeeting)return 'Preparar y realizar: '+nextMeeting.title;
 return lead.next_action||'Definir la siguiente acción comercial.';
}
function updateMovementPreview(){
 if(editTable!=='activities')return;
 const target=$('movementPreview'),action=$('field-action_code')?.value||'';
 if(target)target.textContent=action?movementMilestoneHelp(action):'Selecciona la acción que realmente ocurrió. Solo los hitos definidos modifican la madurez comercial.';
}
function applyLocalMovementMilestone(payload){
 const code=ACTION_MILESTONE[payload.action_code],meta=code&&MILESTONE_META[code];if(!meta||!payload.lead_id)return;
 const lead=demoData?.leads?.find(row=>row.id===payload.lead_id);if(!lead)return;
 const current=milestonePercent(lead.commercial_milestone);
 if(current<meta.percent){lead.commercial_milestone=code;lead.maturity_percent=meta.percent;lead.milestone_updated_at=payload.occurred_at||new Date().toISOString();}
}
function renderRecords(){
 const isUsers=page==='users',isGoals=page==='goals',isExpenses=page==='expenses';
 $('recordContext').hidden=!executiveFilter&&!executiveOwner;
 $('recordContextLabel').textContent=[{won:'Ganadas con cierre previsto este mes',pipeline:'Cartera abierta',risk:'Cartera en riesgo'}[executiveFilter],executiveOwner?'Vendedor: '+(data.users.find(row=>row.id===executiveOwner)?.full_name||'seleccionado'):''].filter(Boolean).join(' · ');
 $('importBtn').hidden=isUsers||isGoals||!writableFor(page);$('importBtn').disabled=loading||busy||!!failures[page];$('importHelp').hidden=isUsers||isGoals||!writableFor(page);
 $('sellerSummary').hidden=canViewDashboard()||!['leads','tasks'].includes(page);$('sellerSummary').innerHTML=page==='tasks'?renderTaskPrioritySummary():renderSellerWorkspaceSummary();
 const rows=filtered();const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures[page]?'Información no disponible':rows.length+' registros';
 $('exportBtn').disabled=!!failures[page]||!rows.length;
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 const config=modules[page],canEdit=writableFor(page);
 const secondHeader=isUsers?'Rol':isGoals?'Responsable':isExpenses?'Fecha del gasto':['tasks','meetings','deliverables','documents'].includes(page)?'Prospecto':page==='institutions'?'Ciudad':['catalog_products','cost_profiles'].includes(page)?'Origen / destino':'Institución';
 const detailHeader=isGoals?'Metas y presupuesto':isExpenses?'Importe':page==='tasks'?'Urgencia dinámica':page==='meetings'?'Fecha y modalidad':page==='documents'?'Carpeta / versión':(['leads','opportunities'].includes(page)?'Valor estimado':page==='catalog_products'?'Precio proveedor':page==='cost_profiles'?'Tipo de cambio':'Detalle');
 const rowsMarkup=rows.slice(pageIndex*size,(pageIndex+1)*size).map(row=>{
  const secondCell=isUsers?badge(row.role,page):isGoals?esc(relationName('owner_user_id',row)||'Organización'):isExpenses?esc(row.expense_date||'Sin fecha'):['tasks','meetings','deliverables','documents'].includes(page)?esc(relationName('lead_id',row)||'Sin prospecto vinculado'):page==='catalog_products'?esc(row.origin_country||'—')+' → Perú':page==='cost_profiles'?esc(row.origin_country||'—')+' → '+esc(row.destination_country||'—'):esc(page==='institutions'?row.city||'—':relatedName(row)||'Sin vincular');
  const stateCell=isGoals?'<span class="badge success">Meta definida</span>':page==='catalog_products'?(row.active===false?'<span class="badge warn">Inactivo</span>':'<span class="badge success">Activo</span>'):badge(row[config.filter],page);
  const detail=isGoals?'Ventas '+money(row.target_won_value)+'<small>Margen bruto '+money(row.target_margin)+'</small><small>Gastos '+(row.target_expenses===null||row.target_expenses===undefined?'Sin presupuesto':money(row.target_expenses))+'</small>':isExpenses?money(row.amount):page==='opportunities'?money(row.value):page==='leads'?money(row.estimated_value):page==='catalog_products'?catalogMoney(row.supplier_unit_price):page==='cost_profiles'?Number(row.exchange_rate||0).toFixed(2):page==='tasks'?urgencyCell(row):page==='meetings'?('<strong>'+esc(date(row.start_at))+'</strong><small>'+esc(enums.meetingMode[row.mode]||row.mode)+' · '+esc(date(row.end_at))+'</small>'):page==='documents'?('<strong>'+esc(enums.documentCategory[row.category]||row.category)+'</strong><small>Versión actual: v'+Number(row.current_version||0)+'</small>'):page==='activities'?esc(date(row.occurred_at)):esc(row.phone||'—');
  const actionLabel=canEdit?'Editar':'Ver';
  const rowName=page==='catalog_products'?catalogDisplayName(row):nameOf(row)||('Meta '+row.period_start);
  const subline=isGoals?(row.period_start+' → '+row.period_end):isExpenses?(row.currency||'PEN'):(row.email||row.next_action||row.job_title||row.category||row.notes||'');
  return '<tr><td><strong>'+esc(rowName)+'</strong><small>'+esc(subline)+'</small></td><td>'+secondCell+'</td><td>'+stateCell+'</td><td>'+detail+'</td>'+(page==='leads'?'<td>'+maturityCell(row)+'</td>':'')+'<td><div class="row-actions">'+(page==='leads'?'<button class="primary" data-lead-detail="'+row.id+'">Abrir expediente comercial</button>':'')+(page==='documents'&&Number(row.current_version)>0?'<button data-open-document="'+row.id+'">Abrir archivo</button>':'')+'<button data-edit="'+row.id+'" data-table="'+page+'">'+actionLabel+'</button>'+(page==='leads'&&writable()?'<button data-activity-lead="'+row.id+'">Registrar movimiento</button>':'')+(!isUsers&&canDelete()?'<button class="danger-text" data-delete="'+row.id+'" data-table="'+page+'">Eliminar</button>':'')+'</div></td></tr>';
 }).join('');
 $('recordList').innerHTML=failures[page]?'<div class="panel empty">No pudimos cargar estos registros. Pulsa Actualizar.</div>':!rows.length?`<div class="panel empty">${$('search').value||$('filter').value?'No hay coincidencias. Cambia la búsqueda o el filtro.':'Aún no hay registros. Crea el primero con el botón superior.'}</div>`:`<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>${secondHeader}</th><th>Estado / tipo</th><th>${detailHeader}</th>${page==='leads'?'<th>Madurez / potencial</th>':''}<th>Acción</th></tr></thead><tbody>${rowsMarkup}</tbody></table></div>`;
}
function localDateTime(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function importValue(source,field){
 const keys=[normalize(field.key),normalize(field.label)];
 const key=keys.find(candidate=>Object.hasOwn(source,candidate));
 const raw=String(key?source[key]??'':'').trim();
 if(!raw)return '';
 if(field.type==='checkbox')return /^(true|1|si|sí)$/i.test(raw);
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
  const normalized=raw.replace(/^(?:S\/|PEN|USD)\s*/i,'').trim().replace(',','.');
  return (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)?Number(normalized):NaN)/(costRateKeys.has(field.key)?100:1);
 }
 if(field.type==='datetime-local'||field.type==='date'){
  const parsed=new Date(raw);
  if(field.type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)!==raw)return raw;
  return Number.isFinite(parsed.getTime())?(field.type==='date'?parsed.toISOString().slice(0,10):parsed.toISOString()):raw;
 }
 return raw;
}
function buildImport(table,rows){
 const errors=[],payloads=[];
 rows.forEach((source,index)=>{
  const payload={},prefix='Fila '+(index+2)+': ';
  for(const field of fieldsFor(table)){if(field.transient)continue;
   const value=importValue(source,field);
   if(String(value).startsWith('__missing__:'))errors.push(prefix+'no se encontró '+field.label+' “'+String(value).slice(12)+'”.');
   if(field.required&&!String(value).trim())errors.push(prefix+'falta '+field.label+'.');
   if(value!==''&&field.type==='number'&&(!Number.isFinite(value)||value<0||(['score','probability','discount_pct'].includes(field.key)&&value>100)||(costRateKeys.has(field.key)&&value>1)||(field.key==='quantity'&&(!Number.isInteger(value)||value<1))||(field.key==='exchange_rate'&&value<=0)))errors.push(prefix+'revisa '+field.label+'.');
   if(value!==''&&field.options&&!Object.hasOwn(field.options,value))errors.push(prefix+'opción inválida en '+field.label+'.');
   if(value!==''&&['date','datetime-local'].includes(field.type)){
    const parsed=new Date(value);
    if(!Number.isFinite(parsed.getTime())||(field.type==='date'&&parsed.toISOString().slice(0,10)!==value))errors.push(prefix+'fecha inválida en '+field.label+'.');
   }
   payload[field.key]=value===''?null:value;
  }
  const relationError=editorRelationshipError(payload);if(relationError)errors.push(prefix+relationError);
  if(table==='activities'&&Boolean(payload.next_action)!==Boolean(payload.next_action_date))errors.push(prefix+'completa la próxima acción y su fecha.');
  if(['score','probability','quantity'].some(key=>payload[key]!=null&&!Number.isInteger(payload[key])))errors.push(prefix+'los porcentajes manuales y la cantidad deben ser enteros.');
  if(!errors.some(error=>error.startsWith(prefix)))payloads.push(payload);
 });
 return {errors,payloads};
}
async function importCsvFile(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 const table=page,version=loadVersion,userId=session?.user?.id,org=profile?.organization_id;
 if(busy||loading||!writableFor(table)||['users','goals'].includes(table)||failures[table])return;
 const sourceAtStart=dataSource;
 const text=await file.text();
 if(version!==loadVersion||page!==table||sourceAtStart!==dataSource||userId!==session?.user?.id||!writableFor(table))return;
 const rows=parseCsv(text);
 if(!rows.length){notice('El CSV está vacío o no tiene encabezados.',true);return;}
 const result=buildImport(table,rows);
 if(result.errors.length){notice(result.errors.slice(0,3).join(' '),true);return;}
 if(!window.confirm('Se importarán '+result.payloads.length+' registros en '+modules[table].label+'. ¿Continuar?'))return;
 busy=true;render();notice('Importando '+result.payloads.length+' registros…');
 try{
  if(dataSource==='demo'){
   mutateDemo(demoData,table,'insert',result.payloads,{userId:currentActor(),org});persistDemo();loadDemo();notice(demoSavedMessage());return;
  }
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
  if(dataSource==='demo'){
   mutateDemo(demoData,table,'delete',null,{id,userId:currentActor(),org:profile.organization_id});persistDemo();loadDemo();notice(demoSavedMessage());return;
  }
  const {error}=await sb.from(databaseTable(table)).delete().eq('id',id).eq('organization_id',profile.organization_id);
  if(error)throw error;
  busy=false;await reload();notice('Registro eliminado correctamente.');
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;render();}
}

// Linked fields are real foreign keys. Keep the form consistent without inventing interactions.
function editorRelationRows(key,row={}){
 const list=scopedRows(relationTable(key));
 return key==='contact_id'&&row.institution_id?list.filter(contact=>!contact.institution_id||contact.institution_id===row.institution_id):list;
}
function editorRelationshipError(payload){
 if(payload.contact_id){
  const contact=scopedRows('contacts').find(row=>row.id===payload.contact_id);
  if(!contact)return 'Selecciona un contacto disponible.';
  if(contact.institution_id&&!payload.institution_id)payload.institution_id=contact.institution_id;
  if(contact.institution_id&&contact.institution_id!==payload.institution_id)return 'El contacto debe pertenecer a la institución seleccionada.';
 }
 if(payload.lead_id){
  const lead=scopedRows('leads').find(row=>row.id===payload.lead_id);
  if(!lead)return 'Selecciona un prospecto disponible.';
  if(lead.institution_id&&payload.institution_id&&lead.institution_id!==payload.institution_id)return 'La institución debe coincidir con la del prospecto. Corrige primero el prospecto si cambió de institución.';
 }
 return '';
}
function syncEditorRelations(changed){
 if(!['institution_id','contact_id','lead_id'].includes(changed)||!editTable||busy)return;
 const available=fieldsFor(editTable).map(field=>field.key);
 const node=key=>available.includes(key)?document.getElementById('field-'+key):null;
 const institution=node('institution_id'),contact=node('contact_id'),lead=node('lead_id');
 if(changed==='lead_id'&&lead){
  const chosen=scopedRows('leads').find(row=>row.id===lead.value);
  if(institution)institution.value=chosen?.institution_id||'';
  if(contact)contact.dataset.preferred=chosen?.contact_id||'';
 }
 if(changed==='contact_id'&&contact&&institution){
  const chosen=scopedRows('contacts').find(row=>row.id===contact.value);
  if(chosen?.institution_id&&!institution.value)institution.value=chosen.institution_id;
 }
 if(contact){
  const old=changed==='lead_id'?contact.dataset.preferred||'':contact.value;
  const rows=editorRelationRows('contact_id',{institution_id:institution?.value||''});
  contact.innerHTML='<option value="">Sin vincular</option>'+rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(nameOf(row))+'</option>').join('');
  contact.value=rows.some(row=>row.id===old)?old:'';
  const help=document.getElementById('relationHelp');
  if(help)help.textContent=rows.length?'Selecciona el contacto correspondiente; la selección se guarda junto al registro.':'No hay contactos para esta institución. Registra primero el contacto en el módulo Contactos.';
 }
}

function openEditor(table,id=null,initialValues={}){
 if(!accessible(table)||loading||busy||failures[table])return; if(table==='users'&&(!id||!canManageUsers()))return; if(table==='goals'&&!canManageGoals())return; if(!id&&!writableFor(table))return;
 const dependencies=fieldsFor(table).filter(f=>f.type==='relation').map(f=>relationTable(f.key));
 if(dependencies.some(k=>failures[k])){notice('Actualiza los módulos vinculados antes de abrir este formulario para conservar las relaciones del registro.',true);return;}
 const row=id?scopedRows(table).find(r=>r.id===id):{owner_user_id:table==='goals'?null:currentActor(),assigned_to:currentActor(),...(table==='expenses'?{expense_date:localDay(new Date()),currency:'PEN',category:'OPERATIONS'}:{}),...initialValues};if(!row)return;
 editTable=table;editId=id;editingVersion=row.updated_at||null;
 $('editorTitle').textContent=table==='activities'&&!id?'Registrar movimiento':`${id?(writableFor(table)?'Editar':'Ver'):'Crear'} ${modules[table].singular}`;$('formMsg').textContent='';
 $('fields').innerHTML=fieldsFor(table).map(field=>{
 let value=row[field.key]??({country:'Peru',type:table==='activities'?'':'OTHER',priority:'MEDIUM',score:0,value:0,estimated_value:0,estimated_cost:'',probability:10,target_margin:0,target_won_value:0,active:true,quantity:1,discount_pct:0,negotiated_unit_price:''}[field.key]??'');if(field.type==='datetime-local')value=localDateTime(value);if(costRateKeys.has(field.key)&&value!=='')value=Number(value)*100;
 let options=field.options;if(field.type==='relation')options=Object.fromEntries(editorRelationRows(field.key,row).map(r=>[r.id,nameOf(r)]));
 if(options&&value&&!Object.hasOwn(options,value))options={...options,[value]:'Valor actual: '+String(value)+' (revisar)'};
 let input;
 const attrs=`id="field-${field.key}" name="${field.key}" ${field.required?'required':''} ${!writableFor(editTable)?'disabled':''}`;
 if(options)input=`<select ${attrs}><option value="" ${value===''?'selected':''}>${field.type==='relation'?'Sin vincular':field.required?'Selecciona una opción':'Sin registrar'}</option>${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
 else if(field.type==='textarea')input=`<textarea ${attrs}>${esc(value)}</textarea>`;
 else if(field.type==='checkbox')input=`<input ${attrs} type="checkbox" ${value!==false?'checked':''}>`;
 else if(field.type==='file')input=`<input ${attrs} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv">`;
 else input=`<input ${attrs} type="${field.type}" value="${esc(value)}" ${field.type==='number'?`min="0" step="${['score','probability','quantity',...costRateKeys].includes(field.key)?1:'0.01'}" ${['score','probability',...costRateKeys].includes(field.key)?'max="100"':''}`:''} ${field.key==='ruc'?'pattern="[0-9]{11}" title="Ingresa 11 dígitos"':''}>`;
 return `<div class="${field.type==='textarea'?'full':''}"><label for="field-${field.key}">${field.label}${field.required?' *':''}</label>${input}</div>`;
 }).join('');
 if(table==='expenses')$('fields').insertAdjacentHTML('beforeend','<p class="full muted">Registra gastos operativos en soles. Los costos directos de las ventas se toman del costo estimado de cada oportunidad; no los registres aquí otra vez. Un gasto con fecha futura se incluirá cuando llegue esa fecha.</p>');
 if(table==='goals')$('fields').insertAdjacentHTML('beforeend','<p class="full muted">Para el tablero general, deja el responsable sin vincular. El presupuesto de gastos corresponde al periodo completo; vacío significa sin presupuesto y 0 significa que no se prevén gastos. La meta de margen bruto se calcula antes de gastos operativos. El avance a la fecha se distribuye por días calendario.</p>');
 const leadScore=id&&table==='leads'?(data.scores||[]).find(item=>item.lead_id===id):null;
 if(table==='opportunities'&&canViewDashboard()){
  $('fields').insertAdjacentHTML('beforeend','<section id="quotePreview" class="quote-insight full" aria-live="polite"></section>');
  updateQuotePreview();
 }
 if(table==='leads'){
  const scoreValue=leadScore?Math.max(0,Math.min(100,Number(leadScore.total_score)||0)):0;
  const linkedOpportunity=(data.opportunities||[]).find(item=>item.lead_id===id);
  const scoreLabel=row.status==='CONVERTED'?'Potencial al convertir':'Potencial calculado';
  const scoreRecommendation=row.status==='CONVERTED'?(linkedOpportunity?'Lead convertido · continuar '+(enums.stage[linkedOpportunity.stage]||'oportunidad'):'Lead convertido · crear o vincular una oportunidad'):(leadScore?.recommendation||'Se calculará al guardar el lead y registrar su primera interacción.');
  $('fields').insertAdjacentHTML('beforeend','<section class="score-insight full" aria-live="polite"><div class="score-insight-head"><strong>'+scoreLabel+'</strong><b>'+(leadScore?scoreValue+'%':'Pendiente')+'</b></div><div class="score-track"><i style="width:'+scoreValue+'%"></i></div><p>'+esc(scoreRecommendation)+'</p><small>Motor explicable v1 · Fuente: '+(esc(leadScore?.recommendation_source||'RULES_V1'))+(row.status==='CONVERTED'?' · La conversión no reinicia este histórico':'')+'</small></section>');
 }
 if(['leads','activities','opportunities','tasks','meetings','deliverables','documents'].includes(table))$('fields').insertAdjacentHTML('beforeend','<p id="relationHelp" class="full muted" role="status">Institución y contacto deben corresponder entre sí. Al cambiar de institución se actualiza la lista de contactos.</p>');
 if(table==='documents')$('fields').insertAdjacentHTML('beforeend','<p class="full muted">Cada archivo nuevo crea una versión adicional y conserva las anteriores. “Subido” no significa enviado, “firmado” no significa pagado y una factura cargada no acredita cobro.</p>');
 if(table==='activities'){
  $('fields').insertAdjacentHTML('beforeend','<section id="movementPreview" class="movement-preview full" aria-live="polite"></section><p class="full muted">Registra únicamente un movimiento que realmente ocurrió. Acción, canal y resultado son datos distintos. La próxima acción con fecha genera una tarea interna; no envía mensajes ni invitaciones.</p>');
  updateMovementPreview();
 }
 if(table==='meetings'){
  $('fields').insertAdjacentHTML('beforeend','<section id="meetingPreview" class="meeting-preview full" aria-live="polite"></section><p class="full muted">La agenda del CRM detecta cruces entre reuniones registradas. Guardar aquí no envía todavía una invitación de Google Calendar.</p>');
  updateMeetingPreview();
 }
 if(fieldsFor(table).some(f=>f.type==='datetime-local'))$('fields').insertAdjacentHTML('beforeend','<p class="full muted">Las fechas y horas se muestran en la zona horaria de este navegador y se guardan como instantes UTC.</p>');
 $('saveBtn').hidden=!writableFor(table);$('saveBtn').disabled=false;$('editor').showModal();
}
function updateQuotePreview(){
 if(editTable!=='opportunities'||!canViewDashboard())return;
 const target=$('quotePreview');if(!target)return;
 const product=data.catalog_products?.find(item=>item.id===$('field-catalog_product_id').value);
 const selected=data.cost_profiles?.find(item=>item.id===$('field-cost_profile_id').value);
 if(!product||!selected){target.textContent='Selecciona producto y perfil de costos para calcular el escenario.';return;}
 try{
  const q=calculateQuote(product,selected,$('field-quantity').value,$('field-negotiated_unit_price').value,$('field-discount_pct').value);
  target.textContent='Venta neta: '+money(q.revenuePen)+' · Costo total: '+money(q.economicTotalPen)+' · Caja estimada: '+money(q.cashTotalPen)+' · Margen: '+money(q.marginPen)+(q.marginPct===null?'':' ('+q.marginPct.toFixed(1)+'%)')+'. Escenario referencial; el valor comercial guardado se mantiene en su campo.';
 }catch(error){target.textContent=error.message;}
}
async function saveRecord(event){
 event.preventDefault();const canEdit=writableFor(editTable);if(busy||loading||!canEdit)return;
 const selectedFile=editTable==='documents'?document.getElementById('field-_file')?.files?.[0]||null:null;
 if(editId&&!scopedRows(editTable).some(row=>row.id===editId))return;
 const payload={}, form=new FormData($('recordForm'));
 const original=editId?scopedRows(editTable).find(row=>row.id===editId):null;
 if(typeof $('recordForm').reportValidity==='function'&&!$('recordForm').reportValidity())return;
 for(const field of fieldsFor(editTable)){if(field.transient)continue;let value=field.type==='checkbox'?form.get(field.key)==='on':String(form.get(field.key)??'').trim();
 if(field.required&&!value){$('formMsg').textContent='Completa los campos obligatorios.';return;}
 if(field.type==='number'){value=value===''?(['estimated_cost','negotiated_unit_price','target_expenses'].includes(field.key)?null:field.key==='quantity'?1:0):Number(value);if(costRateKeys.has(field.key))value=value/100;}
 else if(field.type==='datetime-local'){if(value&&!Number.isFinite(Date.parse(value))){$('formMsg').textContent='Revisa la fecha de '+field.label+'.';return;}value=value?(original?.[field.key]&&value===localDateTime(original[field.key])?original[field.key]:new Date(value).toISOString()):null;}
 else if(field.type!=='checkbox')value=value||null;payload[field.key]=value;
 }
 for(const field of fieldsFor(editTable)){if(field.transient)continue;
  const value=payload[field.key];
  if(field.options&&value&&!Object.hasOwn(field.options,value)&&value!==original?.[field.key]){$('formMsg').textContent='Selecciona una opción válida para '+field.label+'.';return;}
  if(['score','probability','quantity'].includes(field.key)&&value!==null&&!Number.isInteger(value)){$('formMsg').textContent=field.label+' debe ser un número entero.';return;}
  if(field.type==='number'&&value!==null&&(!Number.isFinite(value)||value<0||(['score','probability','discount_pct'].includes(field.key)&&value>100)||(costRateKeys.has(field.key)&&value>1)||(field.key==='quantity'&&(!Number.isInteger(value)||value<1))||(field.key==='exchange_rate'&&value<=0))){
   $('formMsg').textContent='Revisa el valor de '+field.label+'.';return;
  }
  if(field.type==='relation'&&value&&!scopedRows(relationTable(field.key)).some(row=>row.id===value)){
   $('formMsg').textContent='Selecciona un registro disponible para '+field.label+'.';return;
  }
 }
 if(editTable==='goals'&&payload.period_start>payload.period_end){$('formMsg').textContent='El fin del periodo debe ser posterior o igual al inicio.';return;}
 if(editTable==='expenses'&&payload.currency!=='PEN'){$('formMsg').textContent='Registra los gastos en soles (PEN).';return;}
 const relationshipError=editorRelationshipError(payload);if(relationshipError){$('formMsg').textContent=relationshipError;return;}
 if(editTable==='meetings'&&payload.start_at&&payload.end_at&&Date.parse(payload.end_at)<=Date.parse(payload.start_at)){$('formMsg').textContent='La hora de fin debe ser posterior al inicio.';return;}
 if(editTable==='activities'&&!editId&&!payload.action_code){$('formMsg').textContent='Selecciona la acción realizada antes de guardar el movimiento.';return;}
 if(editTable==='activities'&&Boolean(payload.next_action)!==Boolean(payload.next_action_date)){$('formMsg').textContent='Para programar el seguimiento, completa la próxima acción y su fecha, o deja ambos campos vacíos.';return;}
 if(editTable==='documents'&&!editId&&dataSource==='live'&&!selectedFile){$('formMsg').textContent='Selecciona el archivo inicial del documento.';return;}
 if(editTable==='documents'&&selectedFile&&selectedFile.size>26214400){$('formMsg').textContent='El archivo supera el límite de 25 MB.';return;}
 busy=true;$('saveBtn').disabled=true;$('formMsg').textContent='Guardando…';
 const table=editTable,id=editId,org=profile.organization_id,userId=session.user.id,version=loadVersion;
 let createdDocumentId=null,uploadedPath=null;
 try{
 if(dataSource==='demo'){
  mutateDemo(demoData,table,id?'update':'insert',payload,{id,userId:currentActor(),org});if(table==='activities')applyLocalMovementMilestone(payload);persistDemo();loadDemo();$('editor').close();render();notice(demoSavedMessage());return;
 }
 let query;if(id){if(table!=='users'&&table!=='activities'){payload.updated_at=new Date().toISOString();}query=sb.from(databaseTable(table)).update(payload).eq('id',id).eq('organization_id',org);if(table!=='users'&&table!=='activities'&&editingVersion)query=query.eq('updated_at',editingVersion);}
 else if(table!=='users')query=sb.from(databaseTable(table)).insert({...payload,organization_id:org,created_by:userId});else throw {code:'42501'};
 const {data:saved,error}=await query.select('id').single();if(error)throw error;
 if(table==='documents'){
  createdDocumentId=saved?.id||id;
  if(selectedFile&&createdDocumentId){
   const nextVersion=Number(original?.current_version||0)+1;
   const fileName=safeStorageFileName(selectedFile.name);
   uploadedPath=org+'/'+payload.lead_id+'/'+createdDocumentId+'/v'+nextVersion+'/'+Date.now()+'-'+fileName;
   const upload=await sb.storage.from('crm-documents').upload(uploadedPath,selectedFile,{contentType:selectedFile.type||undefined,upsert:false});
   if(upload.error)throw upload.error;
   const registered=await sb.rpc('crm_register_document_version',{p_document_id:createdDocumentId,p_storage_path:uploadedPath,p_file_name:selectedFile.name,p_mime_type:selectedFile.type||null,p_size_bytes:selectedFile.size,p_status:payload.status||'DRAFT',p_notes:payload.notes||null});
   if(registered.error){await sb.storage.from('crm-documents').remove([uploadedPath]);uploadedPath=null;throw registered.error;}
  }
 }
 if(!session||session.user.id!==userId||version!==loadVersion)return;
 $('editor').close();busy=false;await reload();if(!failures[table])notice('Registro guardado correctamente.');
 }catch(error){
  if(table==='documents'&&uploadedPath){try{await sb.storage.from('crm-documents').remove([uploadedPath]);}catch(_cleanup){}}
  if(table==='documents'&&!id&&createdDocumentId){try{await sb.from('documents').delete().eq('id',createdDocumentId).eq('organization_id',org);}catch(_cleanup){}}
  $('formMsg').textContent=errorText(error);$('formMsg').className='error';
 }
 finally{busy=false;$('saveBtn').disabled=false;render();}
}
async function authenticate(event){
 event.preventDefault();if(!sb)return;$('authBtn').disabled=true;$('authMsg').className='';$('authMsg').textContent='Procesando…';
 const email=$('email').value.trim(),password=$('password').value;
 try{let result;
 if(mode==='reset'){
 if(Date.now()<resetCooldownUntil){$('authMsg').textContent='Espera unos segundos antes de solicitar otro enlace.';return;}
 result=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});if(result.error)throw result.error;
 rememberEmailChoice();startResetCooldown(60);$('authMsg').textContent='Si el correo tiene una cuenta, recibirás un enlace. Revisa también la carpeta de spam. Si el enlace abre una versión de pruebas, utiliza la opción de recuperación alternativa de abajo.';return;
 }
 if(mode==='update'){
 if(password!==$('confirmPassword').value){$('authMsg').textContent='Las contraseñas no coinciden.';return;}
 if(password.length<12){$('authMsg').textContent='Usa al menos 12 caracteres.';return;}
 const verified=await sb.auth.getUser();if(verified.error||!session||verified.data.user?.id!==session.user.id)throw {code:'invalid_token'};
 result=await sb.auth.updateUser({password});if(result.error)throw result.error;
 setRecovery(false);history.replaceState(null,'',location.pathname);$('authForm').reset();await sb.auth.signOut({scope:'local'});clearSession();setMode('login');$('email').value=email;$('authMsg').textContent='Contraseña actualizada. Ingresa y guárdala en el gestor del navegador cuando te lo ofrezca.';return;
 }
 result=mode==='login'?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});
 if(result.error)throw result.error;
 rememberEmailChoice();
 if(mode==='login'&&result.data?.session){setRecovery(false);handleAuth('SIGNED_IN',result.data.session);}
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
 if(event==='PASSWORD_RECOVERY'){clearSession();session=current;setRecovery(true);setMode('update');return;}
 if(!current){setRecovery(false);clearSession();return;}
 if(recovery){clearSession();session=current;setMode('update');return;}
 if(session?.user.id===current.user.id){session=current;return;}
 clearSession();session=current;$('authView').hidden=true;$('appView').hidden=false;
 // Run data requests outside the auth callback lock.
 setTimeout(()=>{if(session?.user.id===current.user.id&&!recovery)reload();},0);
}

// Production integration: no passwords, tokens or customer records are stored here.
function restoreRememberedEmail(previous=''){
 let remembered='';try{remembered=localStorage.getItem(REMEMBER_EMAIL_KEY)||'';}catch(_error){}
 $('email').value=previous||remembered;$('rememberEmail').checked=!!remembered;
}
function rememberEmailChoice(){
 try{if($('rememberEmail').checked)localStorage.setItem(REMEMBER_EMAIL_KEY,$('email').value.trim());else localStorage.removeItem(REMEMBER_EMAIL_KEY);}catch(_error){}
}
function setRecovery(value){
 recovery=value;try{if(value)sessionStorage.setItem(RECOVERY_KEY,'1');else sessionStorage.removeItem(RECOVERY_KEY);}catch(_error){}
}
function readEntryRoute(){
 const query=new URLSearchParams(location.search||''),hash=new URLSearchParams((location.hash||'').slice(1));
 const lead=query.get('lead');
 return {page:hash.get('page'),lead:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead||'')?lead:null};
}
function rememberPage(lead=null){
 if(!profile||recovery)return;
 const query=new URLSearchParams(location.search||'');query.delete('lead');
 if(lead)query.set('lead',lead);
 history.replaceState(null,'',location.pathname+(query.size?'?'+query.toString():'')+'#page='+page);
}
function applyEntryRoute(){
 if(!entryRoute||!profile||loading||recovery)return;
 const route=entryRoute;entryRoute=null;
 if(route.lead){
  navigate('leads');
  if(scopedRows('leads').some(row=>row.id===route.lead))openLeadDetails(route.lead);
  else notice('No se encontró esa solicitud en tu cartera visible. Revisa el modo de trabajo y pulsa Actualizar.',true);
 }else if(route.page)navigate(route.page);
}
function closeLeadDetails(updateRoute=true){
 if($('leadDetailDialog').open)$('leadDetailDialog').close();
 $('leadDetailContent').replaceChildren();
 if(updateRoute)rememberPage();
}
function openLeadDetails(id){
 if(loading||busy||!profile)return;
 const lead=scopedRows('leads').find(row=>row.id===id);if(!lead)return;
 const contact=(data.contacts||[]).find(row=>row.id===lead.contact_id);
 const institution=(data.institutions||[]).find(row=>row.id===lead.institution_id);
 const activities=(data.activities||[]).filter(row=>row.lead_id===id).sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||'')));
 const tasks=sortTasksByUrgency((data.tasks||[]).filter(row=>row.lead_id===id),Date.now());
 const meetings=(data.meetings||[]).filter(row=>row.lead_id===id).sort((a,b)=>String(a.start_at||'').localeCompare(String(b.start_at||'')));
 const deliverables=(data.deliverables||[]).filter(row=>row.lead_id===id).sort((a,b)=>String(a.due_at||'9999').localeCompare(String(b.due_at||'9999')));
 const documents=(data.documents||[]).filter(row=>row.lead_id===id).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 const pending=tasks.filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
 const score=(data.scores||[]).find(row=>row.lead_id===id);
 const potential=score?Math.max(0,Math.min(100,Number(score.total_score)||0)):null;
 const urgency=commercialUrgency(tasks,meetings),potentialState=commercialPotential(score),health=commercialHealth(lead,urgency,potentialState);
 const latest=activities[0]||null,action=nextCommercialAction(lead,tasks,meetings);
 const nextMeeting=meetings.find(row=>!['COMPLETED','CANCELLED'].includes(row.status)&&Date.parse(row.start_at)>=Date.now())||null;
 const nextTask=pending[0]||null;
 const nextDate=[nextTask?.due_at,nextMeeting?.start_at,lead.next_action_date].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null;
 const xDelivered=deliverables.filter(row=>row.direction==='XICRONIX_TO_CLIENT'&&row.status==='DELIVERED');
 const xPending=deliverables.filter(row=>row.direction==='XICRONIX_TO_CLIENT'&&row.status==='PENDING');
 const cReceived=deliverables.filter(row=>row.direction==='CLIENT_TO_XICRONIX'&&row.status==='RECEIVED');
 const cPending=deliverables.filter(row=>row.direction==='CLIENT_TO_XICRONIX'&&row.status==='PENDING');
 const maturity=Math.max(0,Math.min(100,Number(lead.maturity_percent)||0));
 const need=activities.find(row=>row.need_summary)?.need_summary||'Pendiente de precisar';
 const budget=Number(lead.estimated_value)>0?money(lead.estimated_value):'Sin definir';
 const field=(label,value)=>'<div class="lead-detail-row"><dt>'+esc(label)+'</dt><dd>'+esc(value||'Sin registrar')+'</dd></div>';
 const buttons=writableFor('leads')?'<div class="lead-master-actions"><button type="button" data-edit-lead="'+lead.id+'">Editar prospecto</button><button type="button" class="primary" data-activity-lead="'+lead.id+'">Registrar movimiento</button><button type="button" data-create-task-lead="'+lead.id+'">Crear tarea</button><button type="button" data-create-meeting-lead="'+lead.id+'">Agendar reunión</button><button type="button" data-create-deliverable-lead="'+lead.id+'">Registrar entregable</button><button type="button" data-create-document-lead="'+lead.id+'">Subir documento</button></div>':'';
 $('leadDetailTitle').textContent='Expediente Comercial · '+(institution?.name||lead.title||'Prospecto');
 $('leadDetailContent').innerHTML='<section class="lead-master commercial-dossier"><p class="muted">'+(dataSource==='demo'?'Demostración, sin datos reales.':'Radiografía comercial basada únicamente en los registros del expediente.')+'</p>'+buttons+
 '<section class="situation-action"><div><small>SITUACIÓN</small><h3>'+(latest?esc(latest.subject||MOVEMENT_ACTIONS[latest.action_code]||'Último movimiento registrado'):'Sin movimiento reciente')+'</h3><p>'+(latest?esc(latest.notes||latest.need_summary||'Movimiento registrado sin detalle adicional.'):'La oportunidad todavía no tiene actividad suficiente para resumir una situación previa.')+'</p></div><div><small>ACCIÓN</small><h3>'+esc(action)+'</h3><p>'+(nextDate?'Próximo compromiso: '+esc(date(nextDate)):'Aún no existe una fecha comprometida.')+'</p></div></section>'+
 '<div class="dossier-status-row"><span class="dossier-state '+health.className+'"><small>Estado actual</small><strong>'+health.label+'</strong></span><span class="dossier-state '+urgency.className+'"><small>Urgencia</small><strong>'+urgency.label+'</strong></span><span class="dossier-state '+potentialState.className+'"><small>Potencial</small><strong>'+potentialState.label+(potentialState.value!==undefined?' · '+potentialState.value+'%':'')+'</strong></span></div>'+
 '<section class="dossier-first-look"><article><small>Último movimiento</small><strong>'+esc(latest?date(latest.occurred_at):'Sin registro')+'</strong></article><article><small>Próxima fecha clave</small><strong>'+esc(nextDate?date(nextDate):'Sin fecha')+'</strong></article><article><small>Próxima reunión</small><strong>'+esc(nextMeeting?date(nextMeeting.start_at):'Sin reunión')+'</strong></article><article><small>Hito actual</small><strong>'+maturity+'% · '+esc(milestoneLabel(lead.commercial_milestone))+'</strong><div class="dossier-progress"><i style="width:'+maturity+'%"></i></div></article></section>'+
 '<section class="deliverable-radiography"><h3>Entregables</h3><div class="deliverable-grid"><article><small>Entregado por Xicronix</small><strong>'+xDelivered.length+'</strong><p>'+esc(xDelivered[0]?.title||'Sin entregas registradas')+'</p></article><article><small>Pendiente de Xicronix</small><strong>'+xPending.length+'</strong><p>'+esc(xPending[0]?.title||'Sin pendientes registrados')+'</p></article><article><small>Recibido del cliente</small><strong>'+cReceived.length+'</strong><p>'+esc(cReceived[0]?.title||'Sin recepciones registradas')+'</p></article><article><small>Pendiente del cliente</small><strong>'+cPending.length+'</strong><p>'+esc(cPending[0]?.title||'Sin pendientes registrados')+'</p></article></div></section>'+
 '<div class="lead-master-kpis"><article><small>Madurez comercial</small><strong>'+maturity+'%</strong><span>'+esc(milestoneLabel(lead.commercial_milestone))+'</span></article><article><small>Potencial calculado</small><strong>'+(potential===null?'—':potential+'%')+'</strong><span>Indicador separado de la madurez</span></article><article><small>Presupuesto estimado</small><strong>'+esc(budget)+'</strong><span>Pagos se controlarán en su módulo financiero</span></article><article><small>Tareas pendientes</small><strong>'+pending.length+'</strong><span>'+(pending[0]?.due_at?'Próxima: '+esc(date(pending[0].due_at)):'Sin vencimiento próximo')+'</span></article></div><div class="lead-master-grid"><section><h3>Ficha maestra</h3><dl>'+field('Estado',enums.status[lead.status]||lead.status)+field('Institución',institution?.name||'Pendiente de vincular')+field('Contacto',contact?nameOf(contact):'Pendiente de vincular')+(contact?field('Cargo',contact.job_title)+field('Correo',contact.email)+field('Teléfono',contact.phone):'')+field('Necesidad',need)+field('Canal de origen',enums.leadSource[lead.source]||lead.source)+field('Próxima acción',lead.next_action)+field('Fecha de seguimiento',date(lead.next_action_date))+'</dl></section><section><h3>Hitos comerciales</h3><ol class="milestone-rail">'+renderMilestoneRail(lead.commercial_milestone,esc)+'</ol><p class="muted">El porcentaje solo avanza por acciones que acreditan un hito; más correos o llamadas no lo incrementan por sí solos.</p></section></div><section><h3>Movimientos registrados</h3>'+(activities.length?activities.map(row=>'<article class="lead-note"><div class="movement-note-head"><h4>'+esc(row.subject||MOVEMENT_ACTIONS[row.action_code]||enums.activityType[row.type]||'Movimiento')+'</h4>'+(row.action_code?'<span class="badge">'+esc(MOVEMENT_ACTIONS[row.action_code]||row.action_code)+'</span>':'')+'</div><small>'+esc(enums.activityType[row.type]||row.type)+' · ocurrió '+esc(date(row.occurred_at))+' · registrado '+esc(date(row.created_at))+'</small><p>'+esc(row.notes||row.need_summary||'Sin notas adicionales')+'</p>'+(row.evidence_note?'<p><strong>Evidencia:</strong> '+esc(row.evidence_note)+'</p>':'')+(row.milestone_after?'<p class="milestone-evidence">Hito acreditado: '+esc(milestoneLabel(row.milestone_after))+' · '+Number(row.maturity_after||0)+'%</p>':'')+(writableFor('activities')?'<button type="button" data-edit-activity="'+row.id+'">Editar movimiento</button>':'')+'</article>').join(''):'<p class="muted">Todavía no hay movimientos vinculados a este prospecto.</p>')+ '</section><section><h3>Documentos del expediente</h3>'+(documents.length?documents.map(row=>{const version=currentDocumentVersion(row.id);const versions=(data.document_versions||[]).filter(item=>item.document_id===row.id).sort((a,b)=>Number(b.version_number)-Number(a.version_number));return '<article class="lead-note document-note"><div><strong>'+esc(row.title)+'</strong><p>'+esc(enums.documentCategory[row.category]||row.category)+' · '+esc(enums.documentStatus[row.status]||row.status)+' · v'+Number(row.current_version||0)+'</p><small>'+(version?esc(version.file_name)+' · cargado '+esc(date(version.created_at)):'Sin archivo cargado')+'</small>'+(versions.length>1?'<details class="document-history"><summary>Historial de versiones ('+versions.length+')</summary>'+versions.map(item=>'<div><span>v'+Number(item.version_number)+' · '+esc(enums.documentStatus[item.status]||item.status)+' · '+esc(item.file_name)+'</span><button type="button" data-open-document-version="'+item.id+'">Abrir</button></div>').join('')+'</details>':'')+'</div>'+(version?'<button type="button" data-open-document="'+row.id+'">Abrir actual</button>':'')+'</article>';}).join(''):'<p class="muted">Sin documentos registrados.</p>')+'</section><section><h3>Reuniones</h3>'+(meetings.length?meetings.map(row=>'<article class="lead-note"><strong>'+esc(row.title)+'</strong><p>'+esc(enums.meetingStatus[row.status]||row.status)+' · '+esc(date(row.start_at))+' → '+esc(date(row.end_at))+'</p><p>'+esc(enums.meetingMode[row.mode]||row.mode)+' · '+esc(enums.attendeeStatus[row.attendee_status]||row.attendee_status)+'</p></article>').join(''):'<p class="muted">Sin reuniones registradas.</p>')+'</section><section><h3>Tareas vinculadas</h3>'+(tasks.length?tasks.map(row=>'<article class="lead-note"><strong>'+esc(row.title)+'</strong><p>'+esc(enums.taskStatus[row.status]||row.status)+' · '+esc(enums.priority[row.priority]||row.priority)+' · '+esc(date(row.due_at))+'</p></article>').join(''):'<p class="muted">Sin tareas vinculadas.</p>')+'</section></section>';
 rememberPage(id);$('leadDetailDialog').showModal();
}

function init(){
 restoreRememberedEmail();
 try{recovery=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'||sessionStorage.getItem(RECOVERY_KEY)==='1';}catch(_error){}
 $('rememberEmail').onchange=()=>{if(!$('rememberEmail').checked){try{localStorage.removeItem(REMEMBER_EMAIL_KEY);}catch(_error){}}};
 $('closeLeadDetail').onclick=()=>closeLeadDetails();$('closeAttention').onclick=()=>{if($('attentionDialog').open)$('attentionDialog').close();};$('attentionBtn').onclick=openAttention;
 $('leadDetailDialog').addEventListener('close',()=>{$('leadDetailContent').replaceChildren();rememberPage();});$('attentionDialog').addEventListener('close',()=>{$('attentionContent').replaceChildren();});
 initTheme();
 initSidebar();
 $('fields').addEventListener('input',()=>{updateQuotePreview();updateMeetingPreview();});
 $('fields').addEventListener('change',event=>{syncEditorRelations(event.target?.name);updateQuotePreview();updateMovementPreview();updateMeetingPreview();});
 $('adminModeBtn').onclick=()=>setWorkspace(ADMIN);$('sellerModeBtn').onclick=()=>setWorkspace(SELLER);renderWorkspaceControls();
 $('sourceToggle').onclick=()=>setDataSource(dataSource==='demo'?'live':'demo');$('resetDemoBtn').onclick=resetDemo;$('demoSeller').onchange=selectDemoSeller;
 $('clearRecordContext').onclick=()=>{executiveFilter='';executiveOwner='';renderRecords();};
 $('closeMethod').onclick=()=>$('methodDialog').close();
 $('methodText').textContent=EXECUTIVE_METHOD;
 $('dateLabel').textContent=new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long'});
 $('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='night'?'day':'night',true);
 $('sidebarToggle').onclick=()=>applySidebar(!$('appView').classList.contains('sidebar-collapsed'),true);
 document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.analyticsPeriod){setAnalyticsPeriod(b.dataset.analyticsPeriod);return;}if(b.dataset.analyticsExport!==undefined){exportAnalytics();return;}if(b.id==='ceoMethodBtn'){$('methodDialog').showModal();return;}if(b.dataset.ceoView){openExecutiveView(b.dataset.ceoView);return;}if(b.dataset.ceoSeller){openExecutiveView('won',b.dataset.ceoSeller);return;}if(b.dataset.passwordToggle){togglePassword(b);return;}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.attentionOpen){if($('attentionDialog').open)$('attentionDialog').close();openLeadDetails(b.dataset.attentionOpen);return;}if(b.dataset.openDocumentVersion){openDocumentVersion(b.dataset.openDocumentVersion);return;}if(b.dataset.openDocument){openDocumentFile(b.dataset.openDocument);return;}if(b.dataset.createDocumentLead){openDocumentForLead(b.dataset.createDocumentLead);return;}if(b.dataset.createDeliverableLead){openDeliverableForLead(b.dataset.createDeliverableLead);return;}if(b.dataset.createMeetingLead){openMeetingForLead(b.dataset.createMeetingLead);return;}if(b.dataset.leadDetail){openLeadDetails(b.dataset.leadDetail);return;}if(b.dataset.editLead){closeLeadDetails(false);openEditor('leads',b.dataset.editLead);return;}if(b.dataset.editActivity){closeLeadDetails(false);openEditor('activities',b.dataset.editActivity);return;}if(b.dataset.activityLead){closeLeadDetails(false);openActivityForLead(b.dataset.activityLead);return;}if(b.dataset.createTaskLead){openTaskForLead(b.dataset.createTaskLead);return;}if(b.dataset.edit)openEditor(b.dataset.table,b.dataset.edit);if(b.dataset.delete)removeRecord(b.dataset.table,b.dataset.delete);if(b.dataset.mode)setMode(b.dataset.mode);});
 $('forgotBtn').onclick=()=>setMode('reset');$('backLogin').onclick=async()=>{if(recovery){await sb.auth.signOut();clearSession();setRecovery(false);}setMode('login');};
 $('authForm').onsubmit=authenticate;$('recordForm').onsubmit=saveRecord;$('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=importCsvFile;
 $('refreshBtn').onclick=reload;$('newBtn').onclick=()=>openEditor(page==='dashboard'?'institutions':page);
 $('search').oninput=$('filter').onchange=()=>{pageIndex=0;renderRecords();};
 $('previous').onclick=()=>{pageIndex--;renderRecords();};$('next').onclick=()=>{pageIndex++;renderRecords();};
 const close=()=>{if(!busy)$('editor').close();};$('closeEditor').onclick=$('cancelEditor').onclick=close;$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('logoutBtn').onclick=async()=>{const {error}=await sb.auth.signOut();if(error){notice(errorText(error),true);return;}clearSession();setMode('login');};
 $('exportBtn').onclick=()=>{if(!accessible(page)||loading||busy||failures[page])return;const columns=fieldsFor(page).filter(field=>!field.transient).map(field=>({key:field.key,label:field.label}));const rows=filtered().map(row=>Object.fromEntries(columns.map(c=>{const field=modules[page].fields.find(f=>f.key===c.key);return [c.key,field.type==='relation'?relationName(c.key,row):costRateKeys.has(c.key)?Number(row[c.key])*100:field.options?.[row[c.key]]||row[c.key]];})));const url=URL.createObjectURL(new Blob([csv(rows,columns)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`xicronix-${dataSource==='demo'?'SIMULADO-':''}${page}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!window.supabase){$('authMsg').textContent='No se pudo cargar el servicio de acceso. Comprueba tu conexión y recarga la página.';$('authBtn').disabled=true;return;}
 sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 sb.auth.onAuthStateChange(handleAuth);
 const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){setRecovery(false);setMode('reset');$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}
 if(typeof sb.auth.getSession==='function')sb.auth.getSession().then(({data,error})=>{if(!error)handleAuth('INITIAL_SESSION',data.session);}).catch(()=>{$('authMsg').textContent='No se pudo verificar la sesión. Recarga la página.';});
}
// Both the SDK's defer script and module execution finish before DOMContentLoaded.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

