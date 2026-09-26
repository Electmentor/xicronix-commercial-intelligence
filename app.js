import {escapeHTML as esc, filterRecords, money, metrics, priorities, taskUrgency, sortTasksByUrgency, csv, parseCsv, normalize} from './domain.mjs';

import {ADMIN, SELLER, effectiveWorkspace, workspaceKey, canAccessPage, canWriteModule, assignedUserId, scopeWorkspaceData} from './workspace.mjs';

import {DEMO_VERSION, DEMO_SELLERS, createDemoData, upgradeDemoData, mutateDemo, realOnly, localDay} from './demo.mjs?v=20260924-v2.41.16';
import {renderExecutive, filterExecutiveRows, EXECUTIVE_METHOD} from './executive.mjs?v=20260925-v2.44.2';
import {analyticsCSV} from './analytics.mjs';
import {catalogDisplayName, calculateQuote} from './catalog.mjs';
import {MILESTONE_META,MOVEMENT_ACTIONS,ACTION_MILESTONE,milestoneLabel,milestonePercent,movementMilestoneHelp,renderMilestoneRail} from './commercial-core.mjs?v=20260923-v2.40.22';
import {renderSellerDashboard} from './seller-dashboard.mjs?v=20260925-v2.44.2';

const $ = id => document.getElementById(id);
const SPLASH_STARTED_AT=performance.now();
const SPLASH_MIN_MS=450;
function startLarsonScanner(){
 const scanner=document.querySelector('.app-splash-larson');
 const leds=scanner?[...scanner.querySelectorAll('i')]:[];
 if(!leds.length)return;
 const duration=1350;
 const paint=()=>{
  const elapsed=performance.now()-SPLASH_STARTED_AT;
  const phase=(elapsed%duration)/duration;
  const center=phase<.5?phase*2*(leds.length-1):(2-phase*2)*(leds.length-1);
  leds.forEach((led,index)=>{
   const d=Math.abs(index-center);
   const strength=Math.max(0,1-d/14.5);
   const hot=Math.pow(strength,1.35);
   const r=Math.round(34+(255-34)*hot);
   const g=Math.round(0+10*hot);
   const b=Math.round(4+12*hot);
   led.style.setProperty('background',`rgb(${r},${g},${b})`,'important');
   led.style.setProperty('opacity',String(.28+.72*strength),'important');
   led.style.setProperty('box-shadow',strength>.03?`0 0 ${3+10*strength}px rgba(255,0,24,${.30+.70*strength}),0 0 ${7+22*strength}px rgba(255,0,24,${.18+.52*strength}),0 0 ${12+34*strength}px rgba(255,0,24,${.08+.28*strength})`:'none','important');
   const thickness=.10+2.25*Math.pow(strength,1.42);
   const widthScale=.70+.42*Math.pow(strength,1.18);
   led.style.setProperty('transform',`scaleY(${thickness}) scaleX(${widthScale})`,'important');
  });
  if(!$('appSplash')?.classList.contains('is-hidden'))requestAnimationFrame(paint);
 };
 requestAnimationFrame(paint);
}
startLarsonScanner();
function hideAppSplash(){
 const splash=$('appSplash');
 if(!splash||splash.classList.contains('is-hidden'))return;
 const finish=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>splash.classList.add('is-hidden')));
 const remaining=Math.max(0,SPLASH_MIN_MS-(performance.now()-SPLASH_STARTED_AT));
 if(remaining>0)setTimeout(finish,remaining);else finish();
}

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
 documentCategory:{
 INSTITUTIONAL_BROCHURES:'01 · Institucional y brochures',
 SOLUTIONS_TECHNICAL:'02 · Soluciones y fichas técnicas',
 REQUEST_DIAGNOSIS:'03 · Diagnósticos',
 PRESENTATIONS:'04 · Presentaciones',
 PROPOSALS_QUOTES:'05 · Cotizaciones y proformas',
 COMMERCIAL_PROPOSALS:'06 · Propuestas comerciales',
 CONTRACTS_AUTHORIZATIONS:'07 · Contratos y autorizaciones',
 IMPLEMENTATION_DELIVERY:'08 · Implementación y entrega',
 MANUALS_POSTSALE:'09 · Manuales y postventa',
 BILLING_PAYMENTS:'10 · Facturación y pagos'
},
 documentStatus:{DRAFT:'Borrador',CURRENT:'Vigente',SENT:'Enviado',SIGNED:'Firmado',REPLACED:'Reemplazado'},
 priority:{LOW:'Baja',MEDIUM:'Media',HIGH:'Alta',CRITICAL:'Crítica'},
 role:{ADMIN:'Administrador',MANAGER:'Responsable',SALES:'Comercial',VIEWER:'Solo lectura'},
 activityType:{WEB_FORM:'Formulario web',CALL:'Llamada',WHATSAPP:'WhatsApp',EMAIL:'Correo',MEETING:'Reunión',VISIT:'Visita',DEMO:'Demostración',PROPOSAL_SENT:'Propuesta enviada',FOLLOW_UP:'Seguimiento',NOTE:'Nota',OTHER:'Otro'},
 leadSource:{WEBSITE:'Formulario web',EMAIL:'Correo',WHATSAPP:'WhatsApp',CALL:'Llamada',REFERRAL:'Referido',EVENT:'Evento',OTHER:'Otro'},
 activityOutcome:{INTERESTED:'Interesado',FOLLOW_UP:'Requiere seguimiento',NO_RESPONSE:'Sin respuesta',NOT_INTERESTED:'No interesado',QUALIFIED:'Calificado',DISQUALIFIED:'No califica'},
 movementAction:MOVEMENT_ACTIONS,
 expenseCategory:{PERSONNEL:'Personal',MARKETING:'Marketing',OPERATIONS:'Operaciones',TECHNOLOGY:'Tecnología',OTHER:'Otros'},
 radarClass:{CRITICAL:'Crítica',HIGH:'Alta prioridad',POTENTIAL:'Potencial',OBSERVE:'En observación',DISCARD:'Descartada'},
 mailStatus:{NEW:'Nuevo',REVIEWED:'Revisado',LINKED:'Vinculado',ARCHIVED:'Archivado'},
 mailPriority:{CRITICAL:'Crítica',HIGH:'Alta',NORMAL:'Normal',LOW:'Baja'}
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
 prospects:{label:'Prospectos',singular:'prospecto',filter:'operating_bucket',options:{ACTION_NOW:'Acción ahora',RESEARCH_FIRST:'Investigar primero',STRATEGIC_WATCH:'Vigilancia estratégica',MONITOR:'Monitorear',REVALIDATE:'Revalidar'},fields:[]},
 radar:{label:'Radar Comercial',singular:'señal radar',filter:'classification',options:enums.radarClass,fields:[]},
 mail:{label:'Correo Zoho',singular:'correo',filter:'status',options:enums.mailStatus,fields:[]},
 institutions:{label:'Instituciones',singular:'institución',filter:'type',options:enums.type,fields:[f('name','Nombre','text',true),f('type','Tipo','select',true,enums.type),f('ruc','RUC'),f('city','Ciudad'),f('country','País','text',true),f('address','Dirección'),f('email','Correo','email'),f('phone','Teléfono','tel'),f('website','Sitio web','url'),f('notes','Notas','textarea')]},
 contacts:{label:'Contactos',singular:'contacto',filter:'decision_level',options:enums.decision_level,fields:[f('first_name','Nombres','text',true),f('last_name','Apellidos'),institution,f('job_title','Cargo'),f('decision_level','Nivel de decisión','select',true,enums.decision_level),f('email','Correo','email'),f('phone','Teléfono','tel'),f('notes','Notas','textarea')]},
 leads:{label:'Prospectos',singular:'prospecto',filter:'status',options:enums.status,fields:[f('title','Título','text',true),institution,contact,f('source','Canal de origen','select',false,enums.leadSource),f('status','Estado','select',true,enums.status),f('estimated_value','Valor estimado (S/)','number'),f('score','Calificación manual (0–100)','number'),owner,...followUp]},
 opportunities:{label:'Oportunidades',singular:'oportunidad',filter:'stage',options:enums.stage,fields:[f('name','Nombre','text',true),institution,contact,catalogProduct,costProfile,quantity,discount,negotiatedPrice,f('stage','Etapa','select',true,enums.stage),f('value','Valor (S/)','number'),cost,owner,f('probability','Probabilidad manual (%)','number'),f('expected_close_date','Cierre esperado','date'),...followUp]},
 tasks:{label:'Tareas',singular:'tarea',filter:'status',options:enums.taskStatus,fields:[f('title','Título','text',true),f('lead_id','Prospecto','relation'),institution,contact,f('status','Estado','select',true,enums.taskStatus),f('priority','Importancia manual','select',true,enums.priority),f('due_at','Fecha límite','datetime-local'),assignee]},
 meetings:{label:'Agenda',singular:'reunión',filter:'status',options:enums.meetingStatus,fields:[f('title','Título','text',true),f('lead_id','Prospecto','relation'),institution,contact,f('status','Estado','select',true,enums.meetingStatus),f('attendee_status','Confirmación del cliente','select',true,enums.attendeeStatus),f('mode','Modalidad','select',true,enums.meetingMode),f('start_at','Inicio','datetime-local',true),f('end_at','Fin','datetime-local',true),f('location','Lugar / enlace'),owner,f('notes','Notas','textarea')]},
 deliverables:{label:'Entregables',singular:'entregable',filter:'status',options:enums.deliverableStatus,fields:[f('title','Entregable','text',true),f('lead_id','Prospecto','relation',true),institution,contact,f('direction','Responsable de entrega','select',true,enums.deliverableDirection),f('status','Estado','select',true,enums.deliverableStatus),f('due_at','Fecha comprometida','datetime-local'),f('completed_at','Fecha de entrega / recepción','datetime-local'),f('notes','Notas','textarea')]},
 documents:{label:'Repositorio comercial',singular:'documento',filter:'category',options:enums.documentCategory,fields:[f('title','Documento','text',true),f('lead_id','Prospecto','relation',true),institution,contact,f('category','Carpeta','select',true,enums.documentCategory),f('status','Estado documental','select',true,enums.documentStatus),f('document_date','Fecha del documento','date'),f('notes','Notas','textarea'),transientFile]},
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
const CRM_RELEASE='2026-09-26-v2.44.3';
const CRM_VERSION_LABEL='v2.44.3';

const REMEMBER_EMAIL_KEY='xicronix.crm.remembered-email';
const RECOVERY_KEY='xicronix.crm.password-recovery';
let entryRoute=readEntryRoute();
const emptyData=()=>Object.fromEntries([...Object.keys(modules),'scores','document_versions'].map(k=>[k,[]]));
const writable=()=>profile && ['ADMIN','MANAGER','SALES'].includes(profile.role);
let workspace=SELLER, workspaceIdentity=null, workspaceEntryChosen=true, loading=false;
let dataSource='live', sourceIdentity=null, demoData=null, demoSeller=DEMO_SELLERS[0].id, demoSaved=true, executiveFilter='', executiveOwner='', sellerQuickFilter='', prospectDashboardFilter='';
let noticeTimer=null;
let analyticsPeriod='year';
let sellerManagementSearch='';
let deferredInstallPrompt=null;
let criticalPushState='unknown';
let mailWebhookConfig=null;
let liveIntelligenceTimer=null,liveIntelligencePrimed=false,liveIntelligenceLastSync=null;
let liveIntelligenceKnownProspects=new Set();
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(page==='now')renderNow();});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;if(page==='now')renderNow();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
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
const databaseTable=table=>({prospects:'prospect_intelligence_current',users:'profiles',goals:'commercial_goals',expenses:'commercial_expenses',radar:'commercial_radar_dashboard',mail:'commercial_mail_inbox'})[table]||table;
function restoreWorkspace(){
 const identity=workspaceKey(session.user.id,profile.organization_id);
 if(workspaceIdentity!==identity){
  let saved=ADMIN;try{saved=localStorage.getItem(identity)||ADMIN;}catch(_error){}
  workspace=effectiveWorkspace(profile,saved);workspaceIdentity=identity;
 }else workspace=effectiveWorkspace(profile,workspace);
}
function renderWorkspaceControls(){
 const admin=canViewDashboard();
 const sidebarLive=$('sidebarLiveBtn'),sidebarDemo=$('sidebarDemoBtn');
 if(sidebarLive&&sidebarDemo){
  sidebarLive.setAttribute('aria-pressed',String(dataSource==='live'));
  sidebarDemo.setAttribute('aria-pressed',String(dataSource==='demo'));
  sidebarLive.classList.toggle('active',dataSource==='live');
  sidebarDemo.classList.toggle('active',dataSource==='demo');
  sidebarLive.disabled=sidebarDemo.disabled=loading||busy;
 }
 $('resetDemoBtn').disabled=loading||busy;
 $('resetDemoBtn').hidden=dataSource!=='demo';
 $('demoSellerField').hidden=dataSource!=='demo'||admin||!isAdminAccount();
 $('demoSeller').innerHTML=DEMO_SELLERS.map(row=>'<option value="'+row.id+'">'+esc(row.full_name)+' (demo)</option>').join('');$('demoSeller').value=demoSeller;
 $('demoSeller').disabled=loading||busy;
 $('workspaceControls').hidden=!profile;
 $('complaintsLink').hidden=!admin||dataSource!=='live';
 $('adminModeBtn').hidden=!isAdminAccount();
 $('adminModeBtn').setAttribute('aria-pressed',String(admin));
 $('sellerModeBtn').setAttribute('aria-pressed',String(!admin));
 const sidebarDirection=$('sidebarDirectionBtn'),sidebarSeller=$('sidebarSellerBtn');
 if(sidebarDirection&&sidebarSeller){
  sidebarDirection.hidden=!isAdminAccount();
  sidebarDirection.setAttribute('aria-pressed',String(admin));
  sidebarSeller.setAttribute('aria-pressed',String(!admin));
  sidebarDirection.classList.toggle('active',admin);
  sidebarSeller.classList.toggle('active',!admin);
  sidebarDirection.disabled=sidebarSeller.disabled=loading||busy;
 }
 $('adminModeBtn').disabled=$('sellerModeBtn').disabled=loading||busy;
 $('workspaceHint').textContent='';$('workspaceHint').hidden=true;
 $('workspaceLabel').textContent=admin?'DIRECCIÓN':'EJECUTIVO COMERCIAL';
 const identity=$('userIdentity');if(identity){const userLabel=profile?.full_name||session?.user?.email||'Usuario';identity.title=userLabel;identity.setAttribute('aria-label','Usuario: '+userLabel);}
 $('appView').dataset.workspace=admin?ADMIN:SELLER;
 const mobileBottom=$('mobileAppBottomNav');
 if(mobileBottom){
  mobileBottom.hidden=!profile||!workspaceEntryChosen;
  const primary=$('mobileNavPrimary'),reports=$('mobileNavReports'),nowBtn=$('mobileNavNow');
  if(primary){
   primary.dataset.page=admin?'opportunities':'leads';
   const label=primary.querySelector('small');if(label)label.textContent=admin?'Oportunidades':'Mis casos';
  }
  if(reports){
   reports.dataset.page=admin?'goals':'meetings';
   const label=reports.querySelector('small');if(label)label.textContent=admin?'Reportes':'Mi agenda';
  }
  if(nowBtn){
   nowBtn.dataset.page='now';
   const label=nowBtn.querySelector('small');if(label)label.textContent=admin?'Notificaciones':'Ahora';
  }
 }
 const labels=admin
  ?{dashboard:'Centro de mando',now:'Prioridades',prospects:'Prospectos potenciales',radar:'Radar Comercial',leads:'Gestión Comercial',meetings:'Agenda del equipo',mail:'Correo Zoho',users:'Equipo comercial',goals:'Metas',opportunities:'Oportunidades',institutions:'Instituciones',contacts:'Contactos',documents:'Repositorio comercial',catalog_products:'Catálogo',cost_profiles:'Costos',expenses:'Gastos'}
  :{dashboard:'Mi Dashboard',now:'Ahora',leads:'Mis casos',tasks:'Mis tareas',meetings:'Mi agenda',mail:'Correo Zoho',opportunities:'Mis oportunidades',contacts:'Mis contactos',documents:'Mi repositorio',catalog_products:'Catálogo'};
 const navButton=(key,index)=>'<button data-page="'+key+'"><span class="nav-index">'+String(index+1).padStart(2,'0')+'</span>'+(labels[key]||modules[key]?.label||'Resumen')+'</button>';
 const navSection=(title,keys,start)=>{const visible=keys.filter(accessible);return visible.length?'<p class="nav-section-label">'+title+'</p>'+visible.map((key,index)=>navButton(key,start+index)).join(''):'';};
 if(admin){
  const command=['dashboard','now'];
  const operation=['prospects','leads','opportunities','meetings','radar','mail'];
  const control=['goals','users'];
  const support=['institutions','contacts','documents','catalog_products','cost_profiles','expenses'];
  const commandVisible=command.filter(accessible);
  let offset=0;
  let html=navSection('CENTRO DE DIRECCIÓN',command,offset);offset+=commandVisible.length;
  html+=navSection('OPERACIÓN COMERCIAL',operation,offset);offset+=operation.filter(accessible).length;
  html+=navSection('CONTROL Y EQUIPO',control,offset);offset+=control.filter(accessible).length;
  html+=navSection('DATOS Y SOPORTE',support,offset);
  $('navigation').innerHTML=html;
 }else{
  const day=['dashboard','now'];
  const portfolio=['leads','tasks','meetings','mail','opportunities'];
  const support=['contacts','documents','catalog_products'];
  let offset=0;
  let html=navSection('MI JORNADA',day,offset);offset+=day.filter(accessible).length;
  html+=navSection('MI CARTERA',portfolio,offset);offset+=portfolio.filter(accessible).length;
  html+=navSection('APOYO COMERCIAL',support,offset);
  $('navigation').innerHTML=html;
 }
}
function renderWorkspaceEntry(){
 const gate=$('workspaceEntry');
 if(!gate||!profile)return;
 if(!isAdminAccount()){
  workspaceEntryChosen=true;
  gate.hidden=true;
  return;
 }
 gate.hidden=workspaceEntryChosen;
}
async function chooseWorkspaceEntry(next){
 if(![ADMIN,SELLER].includes(next)||!profile)return;
 workspaceEntryChosen=true;
 $('workspaceEntry').hidden=true;
 if(next===workspace){
  renderWorkspaceControls();renderConnectionState();
  navigate('dashboard');
  return;
 }
 await setWorkspace(next);
}
async function setWorkspace(next){
 if(![ADMIN,SELLER].includes(next)||!profile||busy||loading)return;
 if(next===ADMIN&&!isAdminAccount()){notice('El modo administrador requiere una cuenta con ese rol.',true);return;}
 if($('editor').open){notice('Guarda o cancela el formulario antes de cambiar de modo.',true);return;}
 if(next===workspace)return;
 workspace=effectiveWorkspace(profile,next);
 try{localStorage.setItem(workspaceIdentity,workspace);}catch(_error){}
 clearWorkspaceViews();
 navigate('dashboard');
 await reload();
}
const THEME_STORAGE_KEY='xicronix-theme';
const SIDEBAR_STORAGE_KEY='xicronix-sidebar-collapsed';
const authRedirectUrl=()=>PUBLIC_APP_URL;
const nameOf=row=>row.institution_name || row.name || row.title || row.subject || row.description || row.full_name || [row.first_name,row.last_name].filter(Boolean).join(' ');
const relatedName=row=>data.institutions?.find(i=>i.id===row.institution_id)?.name || '';
const relationTable=key=>({institution_id:'institutions',contact_id:'contacts',lead_id:'leads',opportunity_id:'opportunities',owner_user_id:'users',assigned_to:'users',catalog_product_id:'catalog_products',cost_profile_id:'cost_profiles'})[key];
const relationName=(key,row)=>{const table=relationTable(key);return table?nameOf((data[table]||[]).find(item=>item.id===row[key])||{}):'';};
const date=value=>value?new Date(value).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
const catalogMoney=value=>'USD '+new Intl.NumberFormat('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
const notice=(message,error=false,timeout=0)=>{
 clearTimeout(noticeTimer);
 $('status').hidden=!message;$('status').textContent=message;$('status').className='notice'+(error?' error':'');
 if(message&&!error&&timeout>0)noticeTimer=setTimeout(()=>{if($('status').textContent===message){$('status').hidden=true;$('status').textContent='';}},timeout);
};
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
 return 'No se pudo completar la operación. Puede ser una interrupción temporal del servicio; actualiza e inténtalo nuevamente.';
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
 const revealType=button.dataset.revealType||'text';
 const label=button.dataset.secretLabel||'dato';
 const show=input.type==='password';
 input.type=show?revealType:'password';
 button.setAttribute('aria-pressed',String(show));
 button.setAttribute('aria-label',(show?'Ocultar ':'Mostrar ')+label);
 button.querySelectorAll('[data-eye-open]').forEach(node=>node.hidden=show);
 button.querySelectorAll('[data-eye-closed]').forEach(node=>node.hidden=!show);
}
function resetPasswordVisibility(){
 document.querySelectorAll('[data-password-toggle]').forEach(button=>{
  const input=$(button.dataset.passwordToggle);if(!input)return;
  const label=button.dataset.secretLabel||'dato';
  input.type='password';
  button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label','Mostrar '+label);
  button.querySelectorAll('[data-eye-open]').forEach(node=>node.hidden=false);
  button.querySelectorAll('[data-eye-closed]').forEach(node=>node.hidden=true);
 });
}
function clearSession(){
 stopLiveIntelligence();
 closeLeadDetails(false);
 loadVersion++;session=null;profile=null;data=emptyData();failures={};mailWebhookConfig=null;page='dashboard';pageIndex=0;workspace=SELLER;workspaceIdentity=null;loading=false;dataSource='live';sourceIdentity=null;demoData=null;executiveFilter='';executiveOwner='';editTable=null;editId=null;editingVersion=null;
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
 const rows=[];const orderColumn=table==='scores'?'calculated_at':table==='prospects'?'snapshot_at':'created_at';for(let offset=0;;offset+=500){
 const {data:batch,error}=await rowQuery(table,org).order(orderColumn,{ascending:false}).order('id').range(offset,offset+499);
 if(error)throw error;rows.push(...batch);if(batch.length<500)return rows;
 }
}
function intelligenceFreshness(){
 const latest=(rows,fields)=>Math.max(0,...(rows||[]).map(row=>fields.map(key=>Date.parse(row?.[key])).find(Number.isFinite)||0));
 const snapshotLatest=latest(data.prospects,['snapshot_at']);
 const radarLatest=latest(data.radar,['last_verified_at','updated_at','created_at']);
 const now=Date.now(),snapshotAge=snapshotLatest?now-snapshotLatest:Infinity,radarAge=radarLatest?now-radarLatest:Infinity;
 return {
  snapshotLatest,radarLatest,snapshotAge,radarAge,
  snapshotFresh:snapshotAge<=24*3600000,
  radarFresh:radarAge<=6*3600000
 };
}
function liveProspectRows(){
 const snapshot=(data.prospects||[]).map(row=>({...row,source_kind:'SNAPSHOT'}));
 const byName=new Map(snapshot.map(row=>[normalize(row.name||''),row]).filter(([key])=>key));
 for(const signal of (data.radar||[])){
  if(signal.classification==='DISCARD'||signal.lead_id)continue;
  if(!signal.actionable&&!['CRITICAL','HIGH','POTENTIAL'].includes(signal.classification))continue;
  const key=normalize(signal.institution_name||'');
  const existing=key?byName.get(key):null;
  if(existing){
    existing.source_kind='SNAPSHOT+RADAR';
    existing.radar_signal_id=signal.id;
    existing.radar_score=Number(signal.weighted_score)||0;
    existing.radar_verified_at=signal.last_verified_at||signal.updated_at||signal.created_at||null;
    existing.radar_actionable=!!signal.actionable;
    existing.radar_evidence_score=signal.evidence_score;
    existing.radar_fit_score=signal.fit_score;
    existing.radar_budget_score=signal.budget_score;
    if(signal.actionable)existing.operating_bucket='ACTION_NOW';
    if(signal.next_action)existing.next_action=signal.next_action;
    continue;
  }
  const mapped={
    id:'radar:'+signal.id,
    organization_id:signal.organization_id,
    name:signal.institution_name,
    city:signal.city,
    district:signal.city,
    department:signal.region,
    operating_bucket:signal.actionable?'ACTION_NOW':['CRITICAL','HIGH'].includes(signal.classification)?'RESEARCH_FIRST':'MONITOR',
    operating_recommendation:signal.next_action||signal.signal_summary||'Revisar evidencia Radar.',
    next_action:signal.next_action,
    source_kind:'RADAR_LIVE',
    radar_signal_id:signal.id,
    radar_score:Number(signal.weighted_score)||0,
    radar_verified_at:signal.last_verified_at||signal.updated_at||signal.created_at||null,
    radar_actionable:!!signal.actionable,
    radar_evidence_score:signal.evidence_score,
    radar_fit_score:signal.fit_score,
    radar_budget_score:signal.budget_score,
    procurement_model:null,
    network_campus_count:1,
    network_department_count:1
  };
  snapshot.push(mapped);if(key)byName.set(key,mapped);
 }
 return snapshot;
}
const isCommercialTask=row=>!String(row?.automation_key||'').startsWith('cx:readiness:');
const commercialDataView=()=>({...data,tasks:(data.tasks||[]).filter(isCommercialTask),prospects:liveProspectRows()});
async function promoteRadarSignal(signalId){
 if(!signalId||busy||loading||dataSource!=='live')return;
 const signal=(data.radar||[]).find(row=>row.id===signalId);
 if(!signal)return;
 if(signal.lead_id){openLeadDetails(signal.lead_id);return;}
 if(!signal.actionable){notice('Esta señal todavía no está marcada como accionable.',true);return;}
 busy=true;render();notice('Promoviendo señal al CRM…');
 try{
  const {data:result,error}=await sb.rpc('crm_promote_radar_signal',{p_signal_id:signalId});
  if(error)throw error;
  busy=false;await reload();
  const promoted=Array.isArray(result)?result[0]:result;
  notice('Prospecto promovido al CRM con trazabilidad Radar.',false,5000);
  if(promoted?.lead_id)openLeadDetails(promoted.lead_id);
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;render();}
}

function connectionState(){
 if(!session||!profile||dataSource!=='live')return {state:'offline',label:'Sin conexión'};
 if(failures.prospects||failures.radar)return {state:'error',label:'Error'};
 if(!liveIntelligenceLastSync)return {state:'connecting',label:'Conectando'};
 const freshness=intelligenceFreshness();
 if(freshness.snapshotFresh&&freshness.radarFresh)return {state:'online',label:'Conectado'};
 if(freshness.radarFresh)return {state:'stale',label:'Inteligencia parcial'};
 return {state:'error',label:'Inteligencia desactualizada'};
}
function renderConnectionState(){
 const status=connectionState();
 const sync=liveIntelligenceLastSync?new Date(liveIntelligenceLastSync).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'pendiente';
 const fresh=intelligenceFreshness();
 const snap=fresh.snapshotLatest?new Date(fresh.snapshotLatest).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'}):'sin snapshot';
 const radar=fresh.radarLatest?new Date(fresh.radarLatest).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'}):'sin Radar';
 const title=status.label+' · consulta '+sync+' · Prospect Intelligence '+snap+' · Radar '+radar;
 const presence=$('userPresence'),label=$('connectionLabel');
 if(presence&&label){presence.dataset.state=status.state;label.textContent=status.label;presence.title=title;}
 const mobile=$('mobileConnectionPresence'),mobileLabel=$('mobileConnectionLabel');
 if(mobile&&mobileLabel){mobile.dataset.state=status.state;mobileLabel.textContent=status.label;mobile.title=title;}
}
function primeLiveIntelligence(){
 if(dataSource!=='live'||!profile)return;
 liveIntelligenceKnownProspects=new Set((data.prospects||[]).map(row=>String(row.id)));
 liveIntelligencePrimed=true;liveIntelligenceLastSync=Date.now();renderConnectionState();
}
function stopLiveIntelligence(){
 if(liveIntelligenceTimer){clearInterval(liveIntelligenceTimer);liveIntelligenceTimer=null;}
}
function startLiveIntelligence(){
 stopLiveIntelligence();
 if(!session||!profile||dataSource!=='live')return;
 liveIntelligenceTimer=setInterval(()=>refreshLiveIntelligence(true),45000);
}
async function refreshLiveIntelligence(announce=false){
 if(!session||!profile||dataSource!=='live'||busy||loading||recovery||document.hidden||$('editor')?.open)return;
 const userId=session.user.id,org=profile.organization_id;
 try{
  const [prospectsResult,radarResult]=await Promise.allSettled([allRows('prospects',org),allRows('radar',org)]);
  if(userId!==session?.user?.id||org!==profile?.organization_id||dataSource!=='live')return;
  let newRows=[];
  if(prospectsResult.status==='fulfilled'){
    const incoming=realOnly({prospects:prospectsResult.value}).prospects||prospectsResult.value;
    if(liveIntelligencePrimed)newRows=incoming.filter(row=>!liveIntelligenceKnownProspects.has(String(row.id)));
    data.prospects=incoming;
    liveIntelligenceKnownProspects=new Set(incoming.map(row=>String(row.id)));
    failures.prospects=false;
  }
  if(radarResult.status==='fulfilled'){
    data.radar=realOnly({radar:radarResult.value}).radar||radarResult.value;
    failures.radar=false;
  }
  liveIntelligencePrimed=true;liveIntelligenceLastSync=Date.now();renderConnectionState();
  if(['dashboard','prospects','radar','now'].includes(page))render();
  if(announce&&newRows.length){
    const actionNow=newRows.filter(row=>row.operating_bucket==='ACTION_NOW').length;
    const first=newRows[0]?.name||'nuevo candidato';
    notice(newRows.length+' nuevo'+(newRows.length===1?'':'s')+' prospecto'+(newRows.length===1?'':'s')+' potencial'+(newRows.length===1?'':'es')+' detectado'+(newRows.length===1?'':'s')+(actionNow?' · '+actionNow+' listo'+(actionNow===1?'':'s')+' para acción':'')+' · '+first, false, 12000);
  }
 }catch(_error){failures.prospects=true;renderConnectionState();}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLiveIntelligence(false);});

async function reload(){
 if(!session||recovery||busy)return;
 const version=++loadVersion;const userId=session.user.id;loading=true;renderWorkspaceControls();
 $('refreshBtn').disabled=true;$('refreshBtn').classList.add('is-refreshing');$('newBtn').disabled=true;notice('');
 try{
 const result=await sb.from('profiles').select('id,organization_id,full_name,role').eq('id',userId).maybeSingle();
 if(version!==loadVersion)return;
 if(result.error)throw result.error;
 profile=result.data;
 if(!profile?.organization_id){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice('Tu cuenta está autenticada, pero aún no está vinculada a Xicronix. Un administrador debe asignarte una organización y un rol.',true);return;}
 restoreWorkspace();restoreSource();
 $('userRole').textContent='Cuenta: '+(enums.role[profile.role]||'Sin rol');$('welcome').textContent=profile.full_name||session.user.email;
 if(dataSource==='demo'){loadDemo();notice('');render();return;}
 const tables=[...Object.keys(modules).filter(accessible),'scores',...(accessible('documents')?['document_versions']:[])];
 const results=await Promise.allSettled(tables.map(k=>allRows(k,profile.organization_id)));
 if(version!==loadVersion)return;
 data=emptyData();failures={};tables.forEach((k,i)=>{if(results[i].status==='fulfilled')data[k]=results[i].value;else failures[k]=true;});
 data=scopeWorkspaceData(realOnly(data),profile,userId,workspace);
 if(canViewDashboard()){
   const territorial=await sb.from('territorial_intelligence_snapshot').select('*').eq('organization_id',profile.organization_id).order('level').order('physical_accounts',{ascending:false});
   if(!territorial.error){
     data.territorial=territorial.data||[];
     data.territorialMacro=data.territorial.filter(row=>row.level==='MACROZONE');
     data.territorialDepartment=data.territorial.filter(row=>row.level==='DEPARTMENT');
     data.territorialLima=data.territorial.filter(row=>row.level==='LIMA_DISTRICT');
   } else failures.territorial=true;
 }
 if(canViewDashboard()){
   const cfg=await sb.from('commercial_mail_webhook_config').select('organization_id,setup_token,status,limited_data,last_webhook_at,last_error').eq('organization_id',profile.organization_id).maybeSingle();
   mailWebhookConfig=cfg.error?null:cfg.data;
 }else mailWebhookConfig=null;
 primeLiveIntelligence();startLiveIntelligence();
 render();const bad=Object.keys(failures);notice(bad.length?'No se pudo cargar: '+bad.map(k=>modules[k]?.label||k).join(', ')+'. Pulsa Actualizar para reintentar.':'',!!bad.length);
 }catch(error){if(version===loadVersion){profile=null;data=emptyData();failures=Object.fromEntries(Object.keys(modules).map(k=>[k,true]));render();notice(errorText(error),true);}}
 finally{if(version===loadVersion){loading=false;$('refreshBtn').disabled=false;$('refreshBtn').classList.remove('is-refreshing');render();applyEntryRoute();renderWorkspaceEntry();hideAppSplash();}}
}
function applyTheme(theme,persist=false){
 const night=theme==='night';document.documentElement.dataset.theme=night?'night':'day';
 const button=$('themeToggle');if(button){button.textContent=night?'☀️':'🌙';button.setAttribute('aria-pressed',String(night));button.setAttribute('aria-label',night?'Cambiar a modo diurno':'Cambiar a modo nocturno');button.title=night?'Cambiar a modo diurno':'Cambiar a modo nocturno';}
 if(persist){try{localStorage.setItem(THEME_STORAGE_KEY,night?'night':'day');}catch(_error){}}
}
function initTheme(){let stored='';try{stored=localStorage.getItem(THEME_STORAGE_KEY)||'';}catch(_error){}applyTheme(stored==='night'?'night':'day');}
function mobileNavMode(){return window.matchMedia('(max-width:700px)').matches;}
function syncMobileHeaderMenu(){
 const controls=$('workspaceControls'),top=$('pageTitle')?.closest('.top'),marker=$('workspaceControlsMarker');
 if(!controls||!top)return;
 if(controls.parentElement!==top){
  if(marker?.parentElement===top)top.insertBefore(controls,marker.nextSibling);
  else top.appendChild(controls);
 }
}
function applySidebar(collapsed,persist=false){
 const app=$('appView'),button=$('sidebarToggle');if(!app||!button)return;
 app.classList.toggle('sidebar-collapsed',collapsed);
 if(mobileNavMode()){
  button.textContent='☰';
  button.setAttribute('aria-label',collapsed?'Abrir menú':'Cerrar menú');
  button.title=collapsed?'Abrir menú':'Cerrar menú';
 }else{
  button.textContent=collapsed?'›':'‹';
  button.setAttribute('aria-label',collapsed?'Mostrar navegación':'Ocultar navegación');
  button.title=collapsed?'Mostrar navegación':'Ocultar navegación';
 }
 button.setAttribute('aria-expanded',String(!collapsed));
 if(persist){try{localStorage.setItem(SIDEBAR_STORAGE_KEY,collapsed?'1':'0');}catch(_error){}}
}
function initSidebar(){
 let stored='';try{stored=localStorage.getItem(SIDEBAR_STORAGE_KEY)||'';}catch(_error){}
 syncMobileHeaderMenu();
 applySidebar(mobileNavMode()?true:stored==='1');
 window.addEventListener('resize',()=>{syncMobileHeaderMenu();if(mobileNavMode())applySidebar(true);});
}
function navigate(next,{historyMode='push'}={}){
 if(busy||$('editor').open)return;
 if(!accessible(next))next=canViewDashboard()?'dashboard':'leads';
 const changed=page!==next;
 page=next;pageIndex=0;executiveFilter='';executiveOwner='';sellerQuickFilter='';if(next!=='leads')sellerManagementSearch='';$('search').value='';
 rememberPage(null,changed?historyMode:'replace');
 const config=modules[page];$('filter').dataset.page=page;
 $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(config?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 if(mobileNavMode())applySidebar(true);
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
function renderSellerManagement(){
  $('dashboard').innerHTML=renderSellerDashboard(commercialDataView(),{demo:dataSource==='demo',failures,searchQuery:sellerManagementSearch,showSearch:true});
  const input=$('commercialSearch');
  if(input){
    input.addEventListener('input',event=>{
      sellerManagementSearch=event.target.value;
      const caret=event.target.selectionStart??sellerManagementSearch.length;
      renderSellerManagement();
      const next=$('commercialSearch');
      if(next){next.focus({preventScroll:true});next.setSelectionRange(caret,caret);}
    });
  }
}
function render(){
 renderWorkspaceControls();
 renderAttentionButton();
 if(!accessible(page)){page='dashboard';pageIndex=0;$('search').value='';$('filter').value='';}
 if($('filter').dataset.page!==page){
  $('filter').dataset.page=page;
  $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(modules[page]?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 }
 const admin=canViewDashboard();
 $('appView').dataset.page=page;$('appView').dataset.source=dataSource;
 const sellerCommercialView=!admin&&page==='leads';
 $('dashboard').hidden=page!=='dashboard'&&!sellerCommercialView;
 $('records').hidden=page==='dashboard'||sellerCommercialView;
 $('pageTitle').textContent=page==='dashboard'?(admin?'Dirección Comercial':'Mi Dashboard Comercial'):page==='now'?'Xicronix Ahora':!admin&&page==='prospects'?'Prospectos':!admin&&page==='leads'?'Gestión comercial':modules[page].label;
 const target=page==='dashboard'?(admin?'institutions':'leads'):page==='now'?'leads':page;
 $('newBtn').hidden=page==='dashboard'||page==='now'||(!admin&&page==='leads')||target==='users'||!writableFor(target);
 $('newBtn').textContent='+ Crear '+modules[target].singular;
 $('newBtn').disabled=loading||busy||!writableFor(target)||!!failures[target];
 $('refreshBtn').disabled=loading||busy;
 document.querySelectorAll('[data-page]').forEach(button=>{
  button.classList.toggle('active',button.dataset.page===page);
  if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 if(page==='dashboard')renderDashboard();
 else if(!admin&&page==='leads'){
   renderSellerManagement();
 }else renderRecords();
}
const TERRITORIAL_REGION_CENTROIDS={
 'AMAZONAS':[-6.23,-77.87],'ANCASH':[-9.53,-77.53],'APURIMAC':[-13.63,-72.88],'AREQUIPA':[-16.40,-71.54],
 'AYACUCHO':[-13.16,-74.22],'CAJAMARCA':[-7.16,-78.51],'CALLAO':[-12.06,-77.15],'CUSCO':[-13.52,-71.97],
 'HUANCAVELICA':[-12.79,-74.97],'HUANUCO':[-9.93,-76.24],'ICA':[-14.07,-75.73],'JUNIN':[-12.07,-75.21],
 'LA LIBERTAD':[-8.11,-79.03],'LAMBAYEQUE':[-6.77,-79.84],'LIMA':[-12.05,-77.04],'LORETO':[-3.75,-73.25],
 'MADRE DE DIOS':[-12.59,-69.19],'MOQUEGUA':[-17.19,-70.94],'PASCO':[-10.68,-76.26],'PIURA':[-5.19,-80.63],
 'PUNO':[-15.84,-70.02],'SAN MARTIN':[-6.49,-76.36],'TACNA':[-18.01,-70.25],'TUMBES':[-3.57,-80.46],'UCAYALI':[-8.38,-74.55]
};
const TERRITORIAL_LIMA_CENTROIDS={
 'SAN ISIDRO':[-12.097,-77.036],'SANTIAGO DE SURCO':[-12.146,-77.006],'LA MOLINA':[-12.083,-76.947],
 'MIRAFLORES':[-12.122,-77.030],'PUEBLO LIBRE':[-12.074,-77.063],'SAN MIGUEL':[-12.078,-77.090],
 'ATE':[-12.026,-76.922],'LIMA':[-12.046,-77.043],'SURQUILLO':[-12.111,-77.013],'SAN BORJA':[-12.107,-76.999],
 'JESUS MARIA':[-12.075,-77.046],'MAGDALENA DEL MAR':[-12.091,-77.068],'LINCE':[-12.084,-77.034],
 'CHORRILLOS':[-12.176,-77.016],'VILLA EL SALVADOR':[-12.213,-76.937],'VILLA MARIA DEL TRIUNFO':[-12.163,-76.944],
 'SAN JUAN DE MIRAFLORES':[-12.163,-76.972],'LOS OLIVOS':[-11.970,-77.074],'COMAS':[-11.938,-77.057]
};
function normalizeTerritorialName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();}
function renderTerritorialMaps(){
 if(!canViewDashboard()||!window.L)return;
 const rows=(data.radar||[]).filter(row=>row.region||row.city);
 const departmentAgg=Array.isArray(data.territorialDepartment)?data.territorialDepartment:[];
 const limaAgg=Array.isArray(data.territorialLima)?data.territorialLima:[];
 const peruEl=document.getElementById('territorialPeruMap'),limaEl=document.getElementById('territorialLimaMap');
 if(!peruEl||!limaEl)return;
 const makeMap=(el,center,zoom)=>{
  if(el._leaflet_id)return null;
  const map=L.map(el,{scrollWheelZoom:false,attributionControl:true}).setView(center,zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
  return map;
 };
 const peru=makeMap(peruEl,[-9.2,-75],5);
 if(peru){
  if(departmentAgg.length){
   const total=departmentAgg.reduce((sum,row)=>sum+Number(row.physical_accounts||0),0);
   departmentAgg.forEach(row=>{
    const key=normalizeTerritorialName(row.group_key);if(!key||!TERRITORIAL_REGION_CENTROIDS[key])return;
    const physical=Number(row.physical_accounts||0),decisions=Number(row.commercial_decisions||0);
    L.circleMarker(TERRITORIAL_REGION_CENTROIDS[key],{radius:Math.min(24,6+Math.sqrt(physical)*2.1),weight:Number(row.action_now||0)?4:Number(row.research_first||0)?3:2,fillOpacity:.58})
     .addTo(peru).bindPopup('<strong>'+esc(key)+'</strong><br>'+physical+' sedes procesadas · '+Math.round(physical/Math.max(1,total)*100)+'% de cobertura<br>'+decisions+' decisiones comerciales independientes<br>XPPS prom. '+(row.avg_xpps??'—')+' · XWIN prom. '+(row.avg_xwin??'—')+'<br>Readiness prom. '+(row.avg_readiness??'—')+' · '+Number(row.economic_profiles||0)+' perfiles económicos');
   });
  } else {
  const grouped=new Map();
  rows.forEach(row=>{
   const key=normalizeTerritorialName(row.region);if(!key||!TERRITORIAL_REGION_CENTROIDS[key])return;
   const g=grouped.get(key)||{count:0,score:0,critical:0,high:0,actionable:0};g.count++;g.score+=Number(row.weighted_score||0);
   if(row.classification==='CRITICAL')g.critical++;if(row.classification==='HIGH')g.high++;if(row.actionable)g.actionable++;grouped.set(key,g);
  });
  grouped.forEach((g,key)=>{
   L.circleMarker(TERRITORIAL_REGION_CENTROIDS[key],{radius:Math.min(24,7+g.count*2.4),weight:g.critical?4:g.high?3:2,fillOpacity:.58})
    .addTo(peru).bindPopup('<strong>'+esc(key)+'</strong><br>'+g.count+' señal(es)<br>Score prom. '+Math.round(g.score/g.count)+'<br>'+g.critical+' críticas · '+g.high+' altas<br>'+g.actionable+' accionables');
  });
  }
 }
 const lima=makeMap(limaEl,[-12.08,-77.02],10);
 if(lima){
  if(limaAgg.length){
   const total=limaAgg.reduce((sum,row)=>sum+Number(row.physical_accounts||0),0);
   limaAgg.forEach(row=>{
    const key=normalizeTerritorialName(row.group_key);const coord=TERRITORIAL_LIMA_CENTROIDS[key]||TERRITORIAL_LIMA_CENTROIDS.LIMA;
    const physical=Number(row.physical_accounts||0),decisions=Number(row.commercial_decisions||0);
    L.circleMarker(coord,{radius:Math.min(22,5+Math.sqrt(physical)*2.2),weight:Number(row.action_now||0)?4:Number(row.research_first||0)?3:2,fillOpacity:.58})
     .addTo(lima).bindPopup('<strong>'+esc(key)+'</strong><br>'+physical+' sedes procesadas · '+Math.round(physical/Math.max(1,total)*100)+'% de Lima<br>'+decisions+' decisiones comerciales independientes<br>XPPS prom. '+(row.avg_xpps??'—')+' · XWIN prom. '+(row.avg_xwin??'—')+'<br>'+Number(row.economic_profiles||0)+' perfiles económicos');
   });
  } else {
  const grouped=new Map();
  rows.filter(row=>normalizeTerritorialName(row.region)==='LIMA').forEach(row=>{
   let key=normalizeTerritorialName(row.city);
   if(key.includes('/'))key=key.split('/')[0].trim();
   const coord=TERRITORIAL_LIMA_CENTROIDS[key]||TERRITORIAL_LIMA_CENTROIDS.LIMA;
   const g=grouped.get(key)||{coord,count:0,score:0,critical:0,high:0,names:[]};g.count++;g.score+=Number(row.weighted_score||0);
   if(row.classification==='CRITICAL')g.critical++;if(row.classification==='HIGH')g.high++;g.names.push(row.institution_name);grouped.set(key,g);
  });
  grouped.forEach((g,key)=>{
   L.circleMarker(g.coord,{radius:Math.min(21,6+g.count*2.4),weight:g.critical?4:g.high?3:2,fillOpacity:.58})
    .addTo(lima).bindPopup('<strong>'+esc(key||'LIMA')+'</strong><br>'+g.count+' señal(es)<br>Score prom. '+Math.round(g.score/g.count)+'<br>'+g.critical+' críticas · '+g.high+' altas<br>'+g.names.slice(0,4).map(esc).join('<br>'));
  });
  }
 }
}
function renderDashboard(){
 const admin=canViewDashboard();
 const viewData=commercialDataView();
 $('dashboard').innerHTML=admin?renderExecutive(viewData,{demo:dataSource==='demo',failures,analyticsPeriod}):renderSellerDashboard(viewData,{demo:dataSource==='demo',failures});
 if(admin&&dataSource==='live'&&Array.isArray(data.territorialMacro)&&data.territorialMacro.length){
   const section=$('dashboard').querySelector('.territorial-intelligence');
   if(section){
     const total=data.territorialMacro.reduce((s,r)=>s+Number(r.physical_accounts||0),0);
     const decisions=data.territorialMacro.reduce((s,r)=>s+Number(r.commercial_decisions||0),0);
     const economic=data.territorialMacro.reduce((s,r)=>s+Number(r.economic_profiles||0),0);
     const head=section.querySelector('header');
     if(head)head.innerHTML='<div><small>INTELIGENCIA TERRITORIAL CONSOLIDADA</small><h2>¿Dónde está el potencial observable?</h2><p>'+total+' sedes procesadas · '+decisions+' unidades de decisión comercial independientes · '+economic+' perfiles económicos. No equivale a demanda total ni probabilidad de venta.</p></div><span>Snapshot V2.39</span>';
     const summary=section.querySelector('.territorial-summary');
     if(summary)summary.innerHTML=data.territorialMacro.map(row=>'<article><strong>'+Number(row.physical_accounts||0)+'</strong><span>'+esc(row.group_key)+'</span><small>'+Number(row.commercial_decisions||0)+' decisiones · XWIN '+(row.avg_xwin??'—')+'</small></article>').join('');
     const story=section.querySelector('.territorial-story');
     if(story)story.innerHTML=[
       'Lima concentra '+Number(data.territorialMacro.find(r=>r.group_key==='LIMA')?.physical_accounts||0)+' sedes procesadas, pero el mapa separa presencia física de decisiones independientes.',
       'El sur ya contiene '+Number(data.territorialMacro.find(r=>r.group_key==='SUR')?.xwin_count||0)+' observaciones XWIN y '+Number(data.territorialMacro.find(r=>r.group_key==='SUR')?.economic_profiles||0)+' perfiles económicos.',
       'Las zonas sin XPPS/XWIN permanecen como cobertura investigada, no como oportunidad comercial confirmada.',
       'La capa económica es un proxy comercial basado en evidencia; no es NSE oficial.'
     ].map((t,i)=>'<p><b>0'+(i+1)+'</b><span>'+esc(t)+'</span></p>').join('');
   }
 }
 renderConnectionState();
 if(admin)requestAnimationFrame(renderTerritorialMaps);
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
 const rows=scopeWorkspaceData(data,profile,currentActor(),workspace)[table]||[];
 return table==='tasks'?rows.filter(isCommercialTask):rows;
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
 const urgent=rows.filter(row=>row.next_action_date&&Date.parse(row.next_action_date)<now).length;
 return '<section class="portfolio-strip"><span><b>'+active+'</b><small>Prospectos activos</small></span><span><b>'+high+'</b><small>Potencial alto</small></span><span><b>'+due+'</b><small>Seguimientos ≤7 días</small></span><span class="'+(urgent?'warn':'')+'"><b>'+urgent+'</b><small>Vencidos</small></span></section>';
}
function leadMatchesSellerQuickFilter(row){
 if(page!=='leads'||!sellerQuickFilter)return true;
 if(sellerQuickFilter==='active')return !['DISQUALIFIED','CONVERTED'].includes(row.status);
 if(sellerQuickFilter==='mature')return Number(row.maturity_percent||0)>=70;
 if(sellerQuickFilter==='action'){
   const relatedTasks=(data.tasks||[]).filter(task=>task.lead_id===row.id&&!['COMPLETED','CANCELLED'].includes(task.status));
   const urgentTask=relatedTasks.some(task=>['OVERDUE','TODAY'].includes(taskUrgency(task,Date.now()).band));
   const overdueLead=row.next_action_date&&Date.parse(row.next_action_date)<=Date.now();
   return urgentTask||overdueLead;
 }
 if(sellerQuickFilter==='meeting')return (data.meetings||[]).some(meeting=>meeting.lead_id===row.id&&!['COMPLETED','CANCELLED'].includes(meeting.status)&&Date.parse(meeting.start_at)>=Date.now());
 return true;
}
function filtered(){const config=modules[page];let rows=filterRecords(filterExecutiveRows(scopedRows(page),page,executiveFilter,executiveOwner),$('search').value,config.filter,$('filter').value,row=>[relatedName(row),relationName('lead_id',row),row.supplier_sku,row.supplier_name,enums.documentCategory[row.category]].filter(Boolean).join(' '));rows=rows.filter(leadMatchesSellerQuickFilter);if(page==='tasks')return sortTasksByUrgency(rows,Date.now());if(page==='meetings')return rows.slice().sort((a,b)=>String(a.start_at||'').localeCompare(String(b.start_at||'')));return page==='expenses'?rows.slice().sort((a,b)=>String(b.expense_date||'').localeCompare(String(a.expense_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||''))):rows;}
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
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return false;
 return openEditor('activities',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',action_code:'',type:'',subject:'',outcome:'',occurred_at:new Date().toISOString()});
}
function openTaskForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return false;
 if(openEditor('tasks',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',status:'PENDING',priority:'MEDIUM'})){closeLeadDetails(false);return true;}return false;
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
 if(openEditor('meetings',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'Reunión · '+(institution?.name||lead.title),status:'SCHEDULED',attendee_status:'NOT_SENT',mode:'ONLINE',owner_user_id:lead.owner_user_id||currentActor()}))closeLeadDetails(false);
}
function openDeliverableForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 if(openEditor('deliverables',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',direction:'XICRONIX_TO_CLIENT',status:'PENDING'}))closeLeadDetails(false);
}
function openDocumentForLead(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 if(openEditor('documents',null,{lead_id:leadId,institution_id:lead.institution_id||'',contact_id:lead.contact_id||'',title:'',category:'REQUEST_DIAGNOSIS',status:'DRAFT'}))closeLeadDetails(false);
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

function safeExternalUrl(value){
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch(_error){return '';}
}

function radarPhoneHref(value){
 const digits=String(value||'').replace(/\D/g,'');
 return digits ? 'tel:+'+(digits.startsWith('51')?digits:'51'+digits) : '';
}
function radarWhatsappHref(value){
 const digits=String(value||'').replace(/\D/g,'');
 return digits ? 'https://wa.me/'+(digits.startsWith('51')?digits:'51'+digits) : '';
}
function zohoMailComposeHref(row){
 const email=String(row?.contact_email||'').trim();
 if(!email)return '';
 return 'https://mail.zoho.com/zm/#compose';
}
function zohoMailMessageHref(row){
 const folder=String(row?.provider_folder_id||'').trim();
 const message=String(row?.provider_message_id||'').trim();
 if(!folder||!message)return '';
 return 'https://mail.zoho.com/zm/#mail/folder/'+encodeURIComponent(folder)+'/p/'+encodeURIComponent(message);
}
function leadZohoHref(lead,contact,institution){
 const email=String(contact?.email||institution?.email||'').trim().toLowerCase();
 const related=(data.mail||[]).filter(row=>
   row.lead_id===lead?.id||
   (contact?.id&&row.contact_id===contact.id)||
   (email&&String(row.from_address||'').trim().toLowerCase()===email)
 ).sort((a,b)=>String(b.received_at||b.created_at||'').localeCompare(String(a.received_at||a.created_at||'')));
 const direct=related.find(row=>zohoMailMessageHref(row));
 if(direct)return zohoMailMessageHref(direct);
 return zohoMailComposeHref({contact_email:email,institution_name:institution?.name||lead?.title||'Prospecto'});
}
function smartMailDraftForLead(lead){
 const contact=(data.contacts||[]).find(row=>row.id===lead?.contact_id);
 const institution=(data.institutions||[]).find(row=>row.id===lead?.institution_id);
 const activities=(data.activities||[]).filter(row=>row.lead_id===lead?.id).sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||'')));
 const latest=activities[0]||null;
 const email=String(contact?.email||institution?.email||'').trim();
 const firstName=String(contact?.first_name||'').trim();
 const name=firstName||'';
 const institutionName=institution?.name||lead?.title||'su institución';
 const relatedMail=(data.mail||[]).filter(row=>row.lead_id===lead?.id||(contact?.id&&row.contact_id===contact.id)||(email&&String(row.from_address||'').trim().toLowerCase()===email.toLowerCase())).sort((a,b)=>String(b.received_at||b.created_at||'').localeCompare(String(a.received_at||a.created_at||'')));
 const inbound=relatedMail[0]||null;
 const maturity=Math.max(0,Math.min(100,Number(lead?.maturity_percent)||0));
 const need=activities.find(row=>row.need_summary)?.need_summary||lead?.next_action||'su solicitud';
 const greeting=name?'Estimada '+name+',':'Estimada/o,';
 let subject=inbound?.subject?('Re: '+String(inbound.subject).replace(/^Re:\s*/i,'')):'Xicronix | '+institutionName;
 let paragraphs=[];
 if(inbound){
   paragraphs.push('Gracias por su mensaje. Hemos revisado la información compartida y el estado actual de su solicitud con Xicronix.');
 }else if(lead?.source==='WEBSITE'){
   paragraphs.push('Gracias por ponerse en contacto con Xicronix a través de nuestro formulario web. Hemos revisado su solicitud relacionada con '+need+'.');
 }else{
   paragraphs.push('Gracias por su comunicación con Xicronix. Hemos revisado el estado actual de su solicitud relacionada con '+need+'.');
 }
 let recommendation='Brochure institucional / presentación de capacidades';
 let recommendedCategories=['INSTITUTIONAL_BROCHURES','SOLUTIONS_TECHNICAL'];
 if(maturity<30){
   paragraphs.push('Para avanzar de manera adecuada, proponemos una breve conversación de diagnóstico que nos permita precisar necesidades, alcance y prioridades antes de plantear una solución.');
   paragraphs.push('Quedamos atentos para coordinar el horario que le resulte más conveniente.');
   recommendation='Brochure institucional o ficha de solución, solo si aporta contexto';
   recommendedCategories=['INSTITUTIONAL_BROCHURES','SOLUTIONS_TECHNICAL','PRESENTATIONS'];
 }else if(maturity<60){
   paragraphs.push('De acuerdo con lo conversado hasta el momento, el siguiente paso es consolidar los requerimientos técnicos y comerciales para preparar una propuesta alineada a sus necesidades.');
   paragraphs.push('Si está de acuerdo, podemos confirmar los puntos pendientes y avanzar con la siguiente etapa.');
   recommendation='Ficha técnica, diagnóstico o presentación de solución';
   recommendedCategories=['SOLUTIONS_TECHNICAL','REQUEST_DIAGNOSIS','PRESENTATIONS'];
 }else if(maturity<80){
   paragraphs.push('Con la información ya validada, estamos en condiciones de avanzar con la propuesta comercial correspondiente.');
   paragraphs.push('Adjuntaremos o actualizaremos la documentación necesaria para que pueda revisarla y continuar con la evaluación interna.');
   recommendation='Propuesta, cotización o proforma vigente';
   recommendedCategories=['COMMERCIAL_PROPOSALS','PROPOSALS_QUOTES','SOLUTIONS_TECHNICAL'];
 }else{
   paragraphs.push('Estamos en la etapa final del proceso y queremos dejar claramente establecidos los próximos pasos para el cierre y la implementación.');
   paragraphs.push('Quedamos atentos a su confirmación para completar la documentación pendiente y coordinar la ejecución.');
   recommendation='Proforma final, propuesta aprobada, contrato o documentación de implementación';
   recommendedCategories=['PROPOSALS_QUOTES','COMMERCIAL_PROPOSALS','CONTRACTS_AUTHORIZATIONS','IMPLEMENTATION_DELIVERY'];
 }
 const signature='Atentamente,\nEquipo Xicronix\n\nXICRONIX — Ciencia, tecnología y educación\ninfo@xicronix.com\nwww.xicronix.com\nLima, Perú';
 const body=[greeting,'',...paragraphs,'',signature].join('\n');
 const docs=(data.documents||[]).filter(row=>row.lead_id===lead?.id&&['CURRENT','SENT','SIGNED'].includes(row.status)).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 const suggestedDocs=docs.filter(row=>recommendedCategories.includes(row.category));
 const thread=relatedMail.find(row=>zohoMailMessageHref(row))||null;
 return {lead,contact,institution,email,subject,body,recommendation,recommendedCategories,docs,suggestedDocs,thread,latest};
}
function openSmartMailDraft(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 const draft=smartMailDraftForLead(lead);
 if(!draft.email){notice('Este prospecto todavía no tiene un correo registrado.',true);return;}
 const folderLabels=(draft.recommendedCategories||[]).map(key=>enums.documentCategory[key]||key);
 const matching=draft.suggestedDocs||[];
 const docsHtml=matching.length
  ?matching.slice(0,6).map(row=>'<li><strong>'+esc(row.title||'Documento')+'</strong><span>'+esc(enums.documentCategory[row.category]||row.category||'Documento')+' · '+esc(enums.documentStatus[row.status]||row.status)+'</span></li>').join('')
  :'<li><strong>No hay material vigente en las carpetas recomendadas.</strong><span>Carpetas: '+esc(folderLabels.join(' · '))+'</span></li>';
 $('smartMailTitle').textContent='Correo · '+(draft.institution?.name||draft.lead.title||'Prospecto');
 $('smartMailContent').innerHTML=
  '<section class="smart-mail-summary"><label><small>PARA</small><input id="smartMailTo" type="email" value="'+esc(draft.email)+'" autocomplete="off"></label><label><small>ASUNTO</small><input id="smartMailSubject" type="text" value="'+esc(draft.subject)+'" autocomplete="off"></label><div><small>ESTADO</small><strong>'+(draft.thread?'Continuar conversación existente':'Nuevo correo')+'</strong>'+(draft.contact?.phone?'<span>'+esc(draft.contact.phone)+'</span>':'')+'</div></section>'+
  '<section class="smart-mail-body"><header><div><small>RESPUESTA SUGERIDA</small><h3>Revisa antes de enviar</h3></div><button type="button" data-copy-smart-mail="body">Copiar texto</button></header><textarea id="smartMailBody" rows="14">'+esc(draft.body)+'</textarea></section>'+
  '<section class="smart-mail-assets"><header><div><small>REPOSITORIO COMERCIAL</small><h3>Material sugerido según la etapa</h3></div></header><div class="smart-mail-folders">'+folderLabels.map(label=>'<span>'+esc(label)+'</span>').join('')+'</div><ul>'+docsHtml+'</ul><p>'+esc(draft.recommendation)+'</p></section>'+
  '<footer class="smart-mail-actions"><button type="button" data-copy-smart-mail="all">Copiar borrador</button><button type="button" class="primary" data-open-smart-zoho="'+esc(lead.id)+'">'+(draft.thread?'Revisar y responder en Zoho':'Revisar y enviar en Zoho')+'</button></footer>';
 $('smartMailDialog').showModal();
}
async function copySmartMailDraft(mode='all'){
 const body=$('smartMailBody')?.value||'';
 const title=$('smartMailTitle')?.textContent||'';
 const to=$('smartMailTo')?.value?.trim()||'';
 const subject=$('smartMailSubject')?.value?.trim()||'';
 const text=mode==='body'?body:['Para: '+to,'Asunto: '+subject,'',body].join('\n');
 try{await navigator.clipboard.writeText(text);notice(mode==='body'?'Texto del correo copiado.':'Borrador copiado.');}
 catch(_error){notice('No se pudo copiar automáticamente.',true);}
}
async function openSmartMailInZoho(leadId){
 const lead=scopedRows('leads').find(row=>row.id===leadId);if(!lead)return;
 const draft=smartMailDraftForLead(lead);
 const body=$('smartMailBody')?.value||draft.body;
 const to=$('smartMailTo')?.value?.trim()||draft.email;
 const subject=$('smartMailSubject')?.value?.trim()||draft.subject;
 const packageText=['Para: '+to,'Asunto: '+subject,'',body].join('\n');
 try{await navigator.clipboard.writeText(packageText);}catch(_error){}
 const href=draft.thread?zohoMailMessageHref(draft.thread):zohoMailComposeHref({contact_email:to,institution_name:draft.institution?.name||lead.title});
 window.open(href,'_blank','noopener');
 notice(draft.thread?'Conversación abierta en Zoho. El texto sugerido quedó copiado para pegar y revisar.':'Correo nuevo abierto en Zoho. El texto sugerido quedó copiado para pegar y revisar.',false,7000);
}
function radarMailHref(row){return zohoMailComposeHref(row);}
function openLeadFromRadar(signalId){
 const row=(data.radar||[]).find(item=>item.id===signalId);
 if(!row)return;
 if(row.lead_id){openLeadDetails(row.lead_id);return;}
 if(!writableFor('leads'))return;
 openEditor('leads',null,{
   title:(row.institution_name||'Prospecto Radar')+' · Radar',
   institution_id:row.institution_id||'',
   contact_id:'',
   source:'OTHER',
   status:'NEW',
   estimated_value:Number(row.estimated_value)||0,
   score:Math.round(Number(row.weighted_score)||0),
   owner_user_id:currentActor()
 });
}

function renderRadarRecords(){
 $('recordContext').hidden=true;$('sellerSummary').hidden=true;
 $('importBtn').hidden=true;$('importHelp').hidden=true;
 const search=normalize($('search').value),filter=$('filter').value;
 const all=(scopedRows('radar')||[]).filter(row=>(!filter||row.classification===filter)&&(!search||normalize([
  row.institution_name,row.city,row.region,row.signal_summary,row.decision_maker_name,row.decision_maker_title,
  row.contact_email,row.contact_phone,row.next_action,row.principal_risk,row.competitor_or_supplier
 ].filter(Boolean).join(' ')).includes(search)));
 const rows=all.slice().sort((a,b)=>
  Number(a.classification_priority||99)-Number(b.classification_priority||99)||
  Number(a.geographic_priority||99)-Number(b.geographic_priority||99)||
  Number(b.weighted_score||0)-Number(a.weighted_score||0)||
  String(b.created_at||'').localeCompare(String(a.created_at||'')));
 const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures.radar?'Información no disponible':rows.length+' señales calificadas';
 $('exportBtn').disabled=!!failures.radar||!rows.length;
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 if(failures.radar){$('recordList').innerHTML='<div class="panel empty">No pudimos cargar el Radar Comercial. Pulsa Actualizar para reintentar.</div>';return;}
 if(!rows.length){$('recordList').innerHTML='<section class="radar-hero panel"><div><p class="eyebrow">A009 / RADAR COMERCIAL</p><h2>No hay oportunidades que superen el filtro actual.</h2><p>Esto es correcto: el Radar prioriza precisión y evidencia antes que volumen.</p></div></section>';return;}
 const pageRows=rows.slice(pageIndex*size,(pageIndex+1)*size);
 const critical=rows.filter(row=>row.classification==='CRITICAL').length;
 const high=rows.filter(row=>row.classification==='HIGH').length;
 const potential=rows.filter(row=>row.classification==='POTENTIAL').length;
 const observe=rows.filter(row=>row.classification==='OBSERVE').length;
 const metrics='<section class="radar-metrics"><article><b>'+critical+'</b><span>Críticas</span></article><article><b>'+high+'</b><span>Alta prioridad</span></article><article><b>'+potential+'</b><span>Potenciales</span></article><article><b>'+observe+'</b><span>Observación</span></article></section>';
 const cards=pageRows.map(row=>{
  const source=safeExternalUrl(row.source_url);
  const contact=[row.decision_maker_name,row.decision_maker_title].filter(Boolean).join(' · ')||'Decisor por identificar';
  const channels=[row.contact_email,row.contact_phone,row.contact_whatsapp].filter(Boolean).join(' · ')||'Contacto por investigar';
  const lab={EXISTING:'Laboratorio existente',PLANNED:'Laboratorio proyectado',NONE:'Sin laboratorio',UNKNOWN:'Laboratorio por verificar'}[row.lab_status]||row.lab_status;
  const budget={CONFIRMED:'Presupuesto confirmado',PROBABLE:'Presupuesto probable',UNKNOWN:'Presupuesto por verificar',NONE:'Sin presupuesto'}[row.budget_status]||row.budget_status;
  const cls=String(row.classification||'OBSERVE').toLowerCase();
  return '<article class="radar-card '+cls+'">'+
   '<header><div><span class="radar-class">'+esc(enums.radarClass[row.classification]||row.classification)+'</span><h3>'+esc(row.institution_name)+'</h3><p>'+esc([row.city,row.region].filter(Boolean).join(' · ')||'Ubicación por verificar')+'</p></div><div class="radar-score"><b>'+Number(row.weighted_score||0)+'</b><span>/100</span></div></header>'+
   '<div class="radar-score-track"><i style="width:'+Math.max(0,Math.min(100,Number(row.weighted_score||0)))+'%"></i></div>'+
   '<p class="radar-summary">'+esc(row.signal_summary||'Señal comercial en investigación')+'</p>'+
   '<div class="radar-facts"><span><b>Laboratorio</b>'+esc(lab)+'</span><span><b>Ticket</b>'+esc(money(row.estimated_value))+'</span><span><b>Presupuesto</b>'+esc(budget)+'</span><span><b>Timing</b>'+esc(row.signal_date||'Por verificar')+'</span></div>'+
   '<div class="radar-contact"><p><b>Decisor:</b> '+esc(contact)+'</p><p><b>Contacto:</b> '+esc(channels)+'</p></div>'+
   '<div class="radar-quick-actions">'+
    (row.contact_phone?'<a class="radar-action-button primary" href="'+esc(radarPhoneHref(row.contact_phone))+'">Llamar</a>':'')+
    (row.contact_email?'<a class="radar-action-button" href="'+esc(radarMailHref(row))+'">Correo Zoho</a>':'')+
    (row.contact_whatsapp?'<a class="radar-action-button" href="'+esc(radarWhatsappHref(row.contact_whatsapp))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
    (row.lead_id?'<button type="button" class="radar-action-button" data-radar-lead="'+row.id+'">Abrir prospecto</button>':row.actionable?'<button type="button" class="radar-action-button primary" data-radar-promote="'+row.id+'">Promover a CRM</button>':'<button type="button" class="radar-action-button" data-radar-lead="'+row.id+'">Preparar prospecto</button>')+
    (row.lead_id&&writableFor('activities')?'<button type="button" class="radar-action-button" data-radar-activity="'+row.lead_id+'">Registrar acción</button>':'')+
   '</div>'+
   '<div class="radar-action"><p><b>Siguiente acción:</b> '+esc(row.next_action||'Continuar investigación remota')+'</p><p><b>Riesgo:</b> '+esc(row.principal_risk||'Sin riesgo principal registrado')+'</p></div>'+
   '<footer><span>'+esc(row.competitor_or_supplier?'Proveedor/competencia: '+row.competitor_or_supplier:'Proveedor actual: no identificado')+'</span>'+
   (source?'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Ver evidencia ↗</a>':'<span>Fuente pendiente</span>')+
   (row.lead_id?'<span class="radar-linked">Lead vinculado</span>':'')+'</footer>'+
  '</article>';
 }).join('');
 $('recordList').innerHTML=metrics+'<section class="radar-intro panel"><div><p class="eyebrow">RADAR COMERCIAL XICRONIX</p><h2>Oportunidades filtradas para actuar con menos fricción.</h2><p>Orden: clasificación → Lima/proximidad operativa → score. Una señal no se convierte automáticamente en lead.</p></div></section><section class="radar-grid">'+cards+'</section>';
}


function base64UrlToUint8Array(value){
 const padding='='.repeat((4-value.length%4)%4);
 const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}
async function enableCriticalPush(){
 if(!session||!profile||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  notice('Este navegador no permite alertas push.',true);return;
 }
 try{
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){notice('Las alertas no se activaron porque el permiso de notificaciones no fue concedido.',true);renderNow();return;}
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
   const {data:cfg,error:cfgError}=await sb.from('commercial_push_config').select('vapid_public_key').eq('organization_id',profile.organization_id).maybeSingle();
   if(cfgError||!cfg?.vapid_public_key)throw cfgError||new Error('push_config_missing');
   subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(cfg.vapid_public_key)});
  }
  const json=subscription.toJSON();
  const payload={
   organization_id:profile.organization_id,user_id:session.user.id,endpoint:subscription.endpoint,
   p256dh:json.keys?.p256dh,auth:json.keys?.auth,user_agent:navigator.userAgent,
   enabled:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };
  if(!payload.p256dh||!payload.auth)throw new Error('subscription_keys_missing');
  const {error}=await sb.from('commercial_push_subscriptions').upsert(payload,{onConflict:'endpoint'});
  if(error)throw error;
  criticalPushState='active';
  notice('Alertas críticas activadas en este celular.');
  renderNow();
 }catch(error){
  criticalPushState='inactive';
  notice('No se pudieron activar las alertas críticas: '+errorText(error),true);
  renderNow();
 }
}

async function refreshCriticalPushState(){
 if(!session||!profile||!sb||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  criticalPushState='unsupported';return;
 }
 if(Notification.permission!=='granted'){
  criticalPushState='inactive';return;
 }
 try{
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription();
  if(!subscription){criticalPushState='inactive';return;}
  const {data:stored,error}=await sb.from('commercial_push_subscriptions').select('endpoint,enabled').eq('endpoint',subscription.endpoint).maybeSingle();
  criticalPushState=!error&&stored?.enabled?'active':'inactive';
 }catch(_error){criticalPushState='inactive';}
}

function openNowDestination(target,filterValue='',searchValue=''){
 navigate(target);
 if(page!==target)return;
 if(filterValue&&$('filter'))$('filter').value=filterValue;
 if(searchValue&&$('search'))$('search').value=searchValue;
 render();
}

function renderNow(){
 $('recordContext').hidden=true;$('sellerSummary').hidden=true;$('importBtn').hidden=true;$('importHelp').hidden=true;$('exportBtn').disabled=true;
 const radar=(data.radar||[]).slice().sort((a,b)=>Number(a.classification_priority||99)-Number(b.classification_priority||99)||Number(b.weighted_score||0)-Number(a.weighted_score||0));
 const critical=radar.filter(row=>row.classification==='CRITICAL'),high=radar.filter(row=>row.classification==='HIGH'),potential=radar.filter(row=>row.classification==='POTENTIAL');
 const openTasks=(data.tasks||[]).filter(isCommercialTask).filter(row=>!['COMPLETED','CANCELLED'].includes(row.status));
 const newMail=(data.mail||[]).filter(row=>row.status==='NEW').sort((a,b)=>String(b.received_at||b.created_at||'').localeCompare(String(a.received_at||a.created_at||'')));
 const now=Date.now(),todayEnd=new Date();todayEnd.setHours(23,59,59,999);
 const dueToday=openTasks.filter(row=>row.due_at&&Date.parse(row.due_at)<=todayEnd.getTime()).length;
 const openOpps=(data.opportunities||[]).filter(row=>!['WON','LOST'].includes(row.stage));
 const pipeline=openOpps.reduce((sum,row)=>sum+(Number(row.value)||0),0);
 const focus=critical[0]||high[0]||potential[0]||null;
 const lastRadar=radar.map(row=>Date.parse(row.last_verified_at||row.updated_at||row.created_at)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
 const standalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 const status=critical.length?'ALERTA CRÍTICA':high.length?'ATENCIÓN':'ESTABLE';
 const statusClass=critical.length?'critical':high.length?'high':'stable';
 const install=standalone?'<span class="now-installed">Instalado en este dispositivo</span>':deferredInstallPrompt?'<button id="installAppBtn" class="primary">Instalar Xicronix en este celular</button>':'<small>Para tenerlo como icono: menú del navegador → Añadir a pantalla de inicio / Instalar app.</small>';
 const pushSupported=('Notification' in window)&&('serviceWorker' in navigator)&&('PushManager' in window);
 if(pushSupported&&criticalPushState==='unknown')refreshCriticalPushState().then(()=>{if(page==='now')renderNow();});
 const pushBlock=pushSupported
  ?(criticalPushState==='active'
    ?'<button id="criticalPushBtn" class="now-alert-button enabled">Alertas críticas activadas</button><small>Suscripción verificada en Xicronix. Solo se enviarán cuando una señal entre en CRITICAL.</small>'
    :'<button id="criticalPushBtn" class="now-alert-button">Activar alertas críticas</button><small>'+(Notification.permission==='granted'?'El permiso del teléfono ya está concedido; falta registrar este dispositivo.':'El teléfono pedirá permiso una sola vez.')+'</small>')
  :'<small>Este navegador no admite alertas push.</small>';
 $('recordCount').textContent='Resumen móvil · datos reales del CRM';
 $('pageNumber').textContent='';$('previous').disabled=true;$('next').disabled=true;
 $('recordList').innerHTML=
 '<button type="button" class="now-status now-nav-card '+statusClass+'" data-now-target="radar" data-now-filter="'+(critical.length?'CRITICAL':high.length?'HIGH':'')+'"><div><p class="eyebrow">XICRONIX AHORA</p><h2>'+status+'</h2><p>'+(critical.length?'Hay una señal comercial que merece atención inmediata.':high.length?'Hay oportunidades de alta prioridad para revisar.':'No hay alertas comerciales críticas en este momento.')+'</p></div><div class="now-pulse"><i></i><span>Radar activo</span></div></button>'+
 '<section class="now-kpis"><button type="button" class="now-kpi-card" data-now-target="radar" data-now-filter="CRITICAL"><b>'+critical.length+'</b><span>Críticos</span><small>Ver Radar</small></button><button type="button" class="now-kpi-card" data-now-target="radar" data-now-filter="HIGH"><b>'+high.length+'</b><span>Alta prioridad</span><small>Ver Radar</small></button><button type="button" class="now-kpi-card" data-now-target="radar" data-now-filter="POTENTIAL"><b>'+potential.length+'</b><span>Potenciales</span><small>Ver Radar</small></button><button type="button" class="now-kpi-card" data-now-target="tasks"><b>'+dueToday+'</b><span>Acciones hoy</span><small>Ver tareas</small></button></section>'+
 '<section class="now-mail-strip"><button type="button" class="panel now-mail-card now-nav-card" data-now-target="mail"><div><p class="eyebrow">CORREO ZOHO</p><h3>'+newMail.length+' nuevos</h3><p>'+(newMail[0]?esc(newMail[0].subject||'(Sin asunto)'):'Sin correos pendientes de revisar')+'</p></div><span>Ver correo →</span></button></section>'+ 
 '<section class="now-grid"><button type="button" class="panel now-focus now-nav-card" data-now-target="radar" data-now-filter="'+esc(focus?.classification||'')+'" data-now-search="'+esc(focus?.institution_name||'')+'"><p class="eyebrow">LO MÁS IMPORTANTE</p>'+(focus?'<h3>'+esc(focus.institution_name)+'</h3><div class="now-score">'+Number(focus.weighted_score||0)+'/100 · '+esc(enums.radarClass[focus.classification]||focus.classification)+'</div><p>'+esc(focus.signal_summary||'Señal comercial en investigación')+'</p><p><b>Siguiente:</b> '+esc(focus.next_action||'Continuar investigación remota')+'</p>':'<h3>Sin alertas prioritarias</h3><p>El Radar seguirá filtrando oportunidades sin llenarte de ruido.</p>')+'</button>'+
 '<article class="panel now-business"><p class="eyebrow">OPERACIÓN</p><div><span><b>'+openTasks.length+'</b>Tareas abiertas</span><span><b>'+openOpps.length+'</b>Oportunidades abiertas</span><span><b>'+money(pipeline)+'</b>Pipeline registrado</span></div></article></section>'+
 '<section class="panel now-update"><div><p class="eyebrow">ÚLTIMA LECTURA DEL RADAR</p><h3>'+(lastRadar?esc(date(new Date(lastRadar).toISOString())):'Sin verificación registrada')+'</h3><p>Abre “Radar Comercial” para ver la evidencia y los contactos de cada institución.</p></div><div class="now-install">'+install+'</div></section><section class="panel now-alerts"><div><p class="eyebrow">ALERTAS DE PROSPECTOS</p><h3>Interrupciones solo cuando valga la pena.</h3><p>Una notificación se dispara únicamente cuando una señal entra en CRITICAL.</p></div><div class="now-alert-control">'+pushBlock+'</div></section>';
 const button=$('installAppBtn');if(button)button.onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;renderNow();};
 const pushButton=$('criticalPushBtn');if(pushButton)pushButton.onclick=enableCriticalPush;
 document.querySelectorAll('[data-now-target]').forEach(card=>{card.onclick=()=>openNowDestination(card.dataset.nowTarget,card.dataset.nowFilter||'',card.dataset.nowSearch||'');});
}

function taskLinkedLead(row){
 return row?.lead_id ? scopedRows('leads').find(item=>item.id===row.lead_id) : null;
}
function taskLinkedContact(row){
 const lead=taskLinkedLead(row);
 const contactId=row?.contact_id||lead?.contact_id;
 return contactId ? scopedRows('contacts').find(item=>item.id===contactId) : null;
}
function taskLinkedInstitution(row){
 const lead=taskLinkedLead(row);
 const institutionId=row?.institution_id||lead?.institution_id;
 return institutionId ? scopedRows('institutions').find(item=>item.id===institutionId) : null;
}
function taskModuleTarget(row){
 const title=String(row?.title||'').toUpperCase();
 if(title.includes('[CX-04]')||title.includes('[CX-06]'))return {page:'meetings',label:'Abrir agenda'};
 if(title.includes('[CX-05]')||title.includes('[CX-08]'))return {page:'activities',label:'Abrir movimientos'};
 if(title.includes('[CX-09]'))return {page:'documents',label:'Abrir documentos'};
 if(title.includes('[CX-11]'))return {page:'opportunities',label:'Abrir oportunidades'};
 if(title.includes('[CX-10]'))return {page:'tasks',label:'Ver tareas'};
 if(title.includes('[CX-12]'))return {page:'now',label:'Abrir Xicronix Ahora'};
 if(title.includes('[CX-02]')||title.includes('[CX-03]')||title.includes('[CX-07]'))return {page:'leads',label:'Abrir prospectos'};
 return {page:'tasks',label:'Abrir tarea'};
}
function phoneHref(value){
 const digits=String(value||'').replace(/\D/g,'');
 return digits ? 'tel:+'+(digits.startsWith('51')?digits:'51'+digits) : '';
}
function whatsappHref(value){
 const digits=String(value||'').replace(/\D/g,'');
 return digits ? 'https://wa.me/'+(digits.startsWith('51')?digits:'51'+digits) : '';
}
function mailHref(value){
 return value ? 'mailto:'+String(value).trim() : '';
}
async function completeTaskQuick(id){
 if(!writableFor('tasks')||busy||loading)return;
 const row=scopedRows('tasks').find(item=>item.id===id);
 if(!row||['COMPLETED','CANCELLED'].includes(row.status))return;
 if(!window.confirm('¿Marcar esta tarea como completada?'))return;
 busy=true;notice('Completando tarea…');
 try{
  if(dataSource==='demo'){
   mutateDemo(demoData,'tasks','update',{...row,status:'COMPLETED',updated_at:new Date().toISOString()},{id,userId:currentActor(),org:profile.organization_id});
   persistDemo();loadDemo();notice(demoSavedMessage());
  }else{
   const {error}=await sb.from(databaseTable('tasks')).update({status:'COMPLETED',updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',profile.organization_id);
   if(error)throw error;
   busy=false;await reload();notice('Tarea completada.');
  }
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;render();}
}
function openTaskModule(row){
 const target=taskModuleTarget(row);
 if(target.page==='tasks'){openEditor('tasks',row.id);return;}
 navigate(target.page);
}
function renderTaskCards(rows){
 const canEdit=writableFor('tasks');
 return '<section class="task-mobile-list">'+rows.map(row=>{
  const lead=taskLinkedLead(row),contact=taskLinkedContact(row),institution=taskLinkedInstitution(row);
  const urgency=taskUrgency(row,Date.now());
  const moduleTarget=taskModuleTarget(row);
  const overdue=urgency.band==='OVERDUE';
  const done=['COMPLETED','CANCELLED'].includes(row.status);
  const phone=phoneHref(contact?.phone),wa=whatsappHref(contact?.phone),email=mailHref(contact?.email);
  const primary=lead?'<button type="button" class="primary" data-task-lead="'+lead.id+'">Abrir prospecto</button>':'<button type="button" class="primary" data-task-module="'+row.id+'">'+esc(moduleTarget.label)+'</button>';
  const respond=lead&&canEdit?'<button type="button" data-task-response="'+lead.id+'">Registrar respuesta</button>':'';
  const contactActions=(phone?'<a class="task-link-button" href="'+esc(phone)+'">Llamar</a>':'')+(wa?'<a class="task-link-button" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+(email?'<a class="task-link-button" href="'+esc(email)+'">Correo</a>':'');
  const complete=!done&&canEdit?'<button type="button" class="task-complete" data-task-complete="'+row.id+'">Completar</button>':'';
  return '<article class="task-mobile-card '+(overdue?'overdue ':'')+(done?'done':'')+'">'+
   '<header><div><span class="task-mobile-priority">'+esc(enums.priority[row.priority]||row.priority||'Sin prioridad')+'</span><h3>'+esc(row.title||'Tarea')+'</h3></div><span class="badge '+(overdue?'warn':done?'success':'')+'">'+esc(enums.taskStatus[row.status]||row.status)+'</span></header>'+
   '<div class="task-mobile-meta"><span><b>'+esc(urgency.label)+'</b>'+(urgency.hasDate?' · '+esc(date(row.due_at)):' · Sin fecha límite')+'</span>'+(institution?'<span>'+esc(institution.name)+'</span>':'')+(contact?'<span>'+esc(nameOf(contact))+'</span>':'')+'</div>'+
   (row.notes?'<p class="task-mobile-notes">'+esc(row.notes)+'</p>':'')+
   '<div class="task-mobile-actions">'+primary+respond+contactActions+complete+'<button type="button" data-edit="'+row.id+'" data-table="tasks">'+(canEdit?'Editar':'Ver')+'</button></div>'+
  '</article>';
 }).join('')+'</section>';
}
function renderTaskRecords(){
 $('recordContext').hidden=true;$('sellerSummary').hidden=canViewDashboard();
 $('sellerSummary').innerHTML=renderTaskPrioritySummary();
 $('importBtn').hidden=false;$('importHelp').hidden=false;
 const rows=filtered(),max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures.tasks?'Información no disponible':rows.length+' tareas';
 $('exportBtn').disabled=!!failures.tasks||!rows.length;
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 if(failures.tasks){$('recordList').innerHTML='<div class="panel empty">No pudimos cargar las tareas. Pulsa Actualizar.</div>';return;}
 if(!rows.length){$('recordList').innerHTML='<div class="panel empty">'+($('search').value||$('filter').value?'No hay tareas con ese filtro.':'No hay tareas registradas.')+'</div>';return;}
 const pageRows=rows.slice(pageIndex*size,(pageIndex+1)*size);
 $('recordList').innerHTML=renderTaskCards(pageRows);
}


function zohoWebhookUrl(){
 if(!mailWebhookConfig?.setup_token||!profile?.organization_id)return '';
 return 'https://qzfprdhmcaucqcdqgqiz.supabase.co/functions/v1/zoho-mail-webhook?org='+encodeURIComponent(profile.organization_id)+'&token='+encodeURIComponent(mailWebhookConfig.setup_token);
}
async function copyZohoWebhookUrl(){
 const value=zohoWebhookUrl();if(!value)return;
 try{await navigator.clipboard.writeText(value);notice('URL del webhook copiada.');}
 catch(_error){notice('No se pudo copiar automáticamente. Mantén pulsada la URL para copiarla.',true);}
}
async function markMailReviewed(id){
 if(!profile||busy||loading)return;
 const row=(data.mail||[]).find(item=>item.id===id);if(!row||row.status!=='NEW')return;
 busy=true;notice('Marcando correo como revisado…');
 try{
   const {error}=await sb.from('commercial_mail_inbox').update({status:'REVIEWED',updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',profile.organization_id);
   if(error)throw error;
   busy=false;await reload();notice('Correo marcado como revisado.');
 }catch(error){notice(errorText(error),true);}
 finally{busy=false;render();}
}
function renderMailRecords(){
 $('recordContext').hidden=true;$('sellerSummary').hidden=true;$('importBtn').hidden=true;$('importHelp').hidden=true;
 const search=normalize($('search').value),filter=$('filter').value;
 const rows=(data.mail||[]).filter(row=>(!filter||row.status===filter)&&(!search||normalize([row.subject,row.from_address,row.sender_name,row.to_address,row.classification].filter(Boolean).join(' ')).includes(search)))
   .sort((a,b)=>String(b.received_at||b.created_at||'').localeCompare(String(a.received_at||a.created_at||'')));
 $('recordCount').textContent=failures.mail?'Información no disponible':rows.length+' correos';
 $('exportBtn').disabled=true;$('pageNumber').textContent='';$('previous').disabled=true;$('next').disabled=true;
 if(failures.mail){$('recordList').innerHTML='<div class="panel empty">No pudimos cargar el correo. Pulsa Actualizar.</div>';return;}
 const hook=zohoWebhookUrl();
 const setup=mailWebhookConfig?.status==='ACTIVE'
   ?'<div class="mail-connection active"><b>Zoho Mail conectado</b><span>Último webhook: '+esc(mailWebhookConfig.last_webhook_at?date(mailWebhookConfig.last_webhook_at):'aún sin correos')+'</span></div>'
   :'<div class="mail-setup panel"><p class="eyebrow">CONEXIÓN PENDIENTE</p><h2>Conecta Zoho Mail una sola vez</h2><p>En Zoho Mail: Configuración → Integraciones → Developer Space → Outgoing Webhooks → Mail. Usa “Limited Data List” para compartir solo asunto, remitente, destinatario y hora.</p>'+(hook?'<div class="mail-webhook-url">'+esc(hook)+'</div><button type="button" class="primary" data-copy-zoho-webhook>Copiar URL del webhook</button>':'')+'</div>';
 const cards=rows.length?'<section class="mail-list">'+rows.map(row=>{
   const linked=row.lead_id?'<button type="button" class="primary" data-mail-lead="'+row.lead_id+'">Abrir prospecto</button>':'';
   const reply=row.from_address?'<a class="task-link-button" href="'+esc(zohoMailMessageHref(row)||zohoMailComposeHref({contact_email:row.from_address,institution_name:row.subject||'Contacto comercial'}))+'" target="_blank" rel="noopener">Leer / responder en Zoho</a>':'';
   const reviewed=row.status==='NEW'?'<button type="button" data-mail-reviewed="'+row.id+'">Marcar revisado</button>':'';
   return '<article class="mail-card '+(row.status==='NEW'?'new':'')+'"><header><div><span class="mail-from">'+esc(row.sender_name||row.from_address||'Remitente desconocido')+'</span><h3>'+esc(row.subject||'(Sin asunto)')+'</h3></div><span class="badge '+(row.priority==='HIGH'||row.priority==='CRITICAL'?'warn':'')+'">'+esc(enums.mailPriority[row.priority]||row.priority)+'</span></header><p class="mail-meta">'+esc(row.from_address||'')+' · '+esc(date(row.received_at||row.created_at))+'</p>'+(row.summary?'<p class="mail-summary">'+esc(row.summary)+'</p>':'')+'<div class="mail-actions">'+linked+reply+reviewed+'</div></article>';
 }).join('')+'</section>':'<div class="panel empty">Todavía no hay correos recibidos desde Zoho Mail.</div>';
 $('recordList').innerHTML=setup+cards;
}

function renderLeadCards(rows){
 return '<section class="lead-mobile-list">'+rows.map(row=>{
  const institution=(data.institutions||[]).find(item=>item.id===row.institution_id);
  const contact=(data.contacts||[]).find(item=>item.id===row.contact_id);
  const activities=(data.activities||[]).filter(item=>item.lead_id===row.id).sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||'')));
  const latest=activities[0]||null;
  const need=activities.find(item=>item.need_summary)?.need_summary||'Necesidad aún no precisada.';
  const evidence=activities.find(item=>item.evidence_note)?.evidence_note||'Sin evidencia comercial explícita.';
  const score=(data.scores||[]).find(item=>item.lead_id===row.id);
  const potential=score?Math.max(0,Math.min(100,Number(score.total_score)||0)):null;
  const maturity=Math.max(0,Math.min(100,Number(row.maturity_percent)||0));
  const next=row.next_action||'Definir siguiente acción';
  const overdue=row.next_action_date&&Date.parse(row.next_action_date)<Date.now();
  const phone=String(contact?.phone||institution?.phone||'').trim();
  const email=String(contact?.email||institution?.email||'').trim();
  const mailRow={contact_email:email,institution_name:institution?.name||row.title||'Prospecto'};
  return '<article class="lead-mobile-card '+(overdue?'overdue':'')+'">'+
   '<header><div><span class="lead-mobile-kicker">PROSPECTO</span><h3>'+esc(institution?.name||row.title||'Prospecto')+'</h3><small>'+esc(contact?nameOf(contact):'Contacto decisor pendiente')+'</small></div><span class="badge '+(overdue?'warn':'')+'">'+esc(enums.status[row.status]||row.status)+'</span></header>'+
   '<div class="lead-mobile-story"><p><b>Problema</b><span>'+esc(need)+'</span></p><p><b>Evidencia</b><span>'+esc(evidence)+'</span></p></div>'+
   '<div class="lead-mobile-scores"><span><b>'+maturity+'%</b><small>Madurez</small></span><span><b>'+(potential===null?'—':potential+'%')+'</b><small>Potencial</small></span><span><b>'+esc(row.estimated_value?money(row.estimated_value):'—')+'</b><small>Valor</small></span></div>'+
   '<p class="lead-mobile-next"><b>Siguiente:</b> '+esc(next)+(row.next_action_date?' · '+esc(date(row.next_action_date)):'')+'</p>'+
   '<div class="lead-mobile-actions lead-mobile-quick-actions">'+
    (phone?'<a class="lead-quick-action primary" href="'+esc(radarPhoneHref(phone))+'">Llamar</a>':'')+
    (email?'<button type="button" class="lead-quick-action" data-smart-mail="'+row.id+'">Correo Zoho</button>':'')+
    (phone?'<a class="lead-quick-action" href="'+esc(radarWhatsappHref(phone))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
    '<button type="button" class="lead-open-compact" data-lead-detail="'+row.id+'">Abrir expediente</button>'+
   '</div>'+
  '</article>';
 }).join('')+'</section>';
}


function prospectBucketMeta(row){
 const map={
  ACTION_NOW:{label:'Acción ahora',cls:'success'},
  RESEARCH_FIRST:{label:'Investigar primero',cls:'warn'},
  STRATEGIC_WATCH:{label:'Vigilancia estratégica',cls:'active'},
  MONITOR:{label:'Monitorear',cls:''},
  REVALIDATE:{label:'Revalidar',cls:'warn'}
 };
 return map[row.operating_bucket]||{label:row.operating_bucket||'Sin clasificar',cls:''};
}
function prospectEconomicLabel(row){
 if(row.monthly_gross_revenue_estimate_pen!=null)return money(Number(row.monthly_gross_revenue_estimate_pen))+'/mes estimado';
 if(row.student_count!=null)return Number(row.student_count).toLocaleString('es-PE')+' alumnos';
 return 'Sin perfil económico completo';
}
function renderPotentialProspects(){
 $('recordContext').hidden=true;$('sellerSummary').hidden=true;$('importBtn').hidden=true;$('importHelp').hidden=true;
 const all=liveProspectRows();
 const freshness=intelligenceFreshness();
 const search=normalize($('search').value),filter=$('filter').value;
 const dashboardMatch=row=>prospectDashboardFilter==='ACTION_NOW'?row.operating_bucket==='ACTION_NOW':prospectDashboardFilter==='REVIEW'?['RESEARCH_FIRST','REVALIDATE'].includes(row.operating_bucket):true;
 const rows=all.filter(row=>dashboardMatch(row)&&(!filter||row.operating_bucket===filter)&&(!search||normalize([row.name,row.ruc,row.city,row.district,row.department,row.market_segment_proxy,row.procurement_model].filter(Boolean).join(' ')).includes(search)))
   .sort((a,b)=>{
     const rank={ACTION_NOW:5,RESEARCH_FIRST:4,STRATEGIC_WATCH:3,REVALIDATE:2,MONITOR:1};
     return (rank[b.operating_bucket]||0)-(rank[a.operating_bucket]||0)||Number(b.xwin_score||0)-Number(a.xwin_score||0)||Number(b.xpps_score||0)-Number(a.xpps_score||0);
   });
 const counts=Object.fromEntries(['ACTION_NOW','RESEARCH_FIRST','STRATEGIC_WATCH','MONITOR','REVALIDATE'].map(key=>[key,all.filter(r=>r.operating_bucket===key).length]));
 $('recordCount').innerHTML='<section class="prospect-command-center"><div class="prospect-command-head"><div><small>PROSPECT INTELLIGENCE · SNAPSHOT CONSOLIDADO</small><h3>Qué merece atención y por qué</h3><p>'+(freshness.snapshotFresh?'Prospect Intelligence vigente.':'Snapshot PI desactualizado; se complementa con señales Radar verificadas sin inventar XWIN.')+' Convertir un candidato en lead sigue siendo una acción trazable.</p></div><div class="prospect-sync-actions"><span>'+all.length+' candidatos · '+(freshness.snapshotLatest?'PI '+new Date(freshness.snapshotLatest).toLocaleDateString('es-PE',{day:'2-digit',month:'short'}):'PI sin fecha')+' · '+(liveIntelligenceLastSync?'sync '+new Date(liveIntelligenceLastSync).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'sincronizando')+'</span><button type="button" id="refreshIntelligenceBtn">↻ Actualizar inteligencia</button></div></div><div class="prospect-bucket-grid">'+[
  ['ACTION_NOW','Acción ahora','Listo para revisión humana'],
  ['RESEARCH_FIRST','Investigar primero','Aún falta cerrar incertidumbre'],
  ['STRATEGIC_WATCH','Vigilancia','Escala relevante, esperar trigger'],
  ['MONITOR','Monitorear','Mantener observación'],
  ['REVALIDATE','Revalidar','Evidencia/modelo a revisar']
 ].map(([key,label,help])=>'<button type="button" class="prospect-bucket '+(filter===key?'active':'')+'" data-prospect-bucket="'+key+'"><strong>'+counts[key]+'</strong><span>'+label+'</span><small>'+help+'</small></button>').join('')+'</div></section>';
 $('exportBtn').disabled=true;
 const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 if(!rows.length){$('recordList').innerHTML='<div class="panel empty">No hay candidatos con este filtro.</div>';return;}
 const pageRows=rows.slice(pageIndex*size,(pageIndex+1)*size);
 const cards='<div class="pi-modern-grid">'+pageRows.map(row=>{
   const b=prospectBucketMeta(row);
   const liveRadar=row.source_kind==='RADAR_LIVE';
   const scoreLabel=liveRadar?'RADAR '+(row.radar_score??'—'):'XWIN '+(row.xwin_score??'—');
   return '<article class="pi-modern-card '+(liveRadar?'pi-live-radar':'')+'"><header><div><span class="badge '+b.cls+'">'+esc(b.label)+'</span><h3>'+esc(row.name||'Institución')+'</h3><small>'+esc([row.district,row.department,row.ruc&&('RUC '+row.ruc)].filter(Boolean).join(' · '))+(row.source_kind!=='SNAPSHOT'?'<br>Radar verificado '+esc(row.radar_verified_at?new Date(row.radar_verified_at).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'}):'recientemente'):'')+'</small></div><strong>'+esc(scoreLabel)+'</strong></header>'+
   (liveRadar?'<div class="pi-score-strip"><span><b>'+(row.radar_score??'—')+'</b><small>Radar</small></span><span><b>'+(row.radar_evidence_score??'—')+'</b><small>Evidencia</small></span><span><b>'+(row.radar_fit_score??'—')+'</b><small>Fit</small></span><span><b>'+(row.radar_budget_score??'—')+'</b><small>Presupuesto</small></span></div>':'<div class="pi-score-strip"><span><b>'+(row.xpps_score??'—')+'</b><small>XPPS</small></span><span><b>'+(row.xwin_confidence??'—')+'%</b><small>Confianza XWIN</small></span><span><b>'+(row.procurement_readiness_score??'—')+'</b><small>Readiness</small></span><span><b>'+(row.rollout_potential_score??'—')+'</b><small>Rollout</small></span></div>')+
   '<div class="pi-story"><p><b>Economía</b>'+esc(prospectEconomicLabel(row))+(row.market_segment_proxy?'<small>'+esc(row.market_segment_proxy)+' · conf. '+(row.economic_profile_confidence??'—')+'%</small>':'')+'</p>'+
   '<p><b>Escala</b>'+Number(row.network_campus_count||1)+' sede(s) · '+Number(row.network_department_count||1)+' departamento(s)<small>'+esc(row.procurement_model||'Modelo de compra no confirmado')+'</small></p>'+
   '<p><b>Siguiente lectura</b>'+esc(row.next_action||row.operating_recommendation||'Monitorear nueva evidencia.')+'</p></div>'+(row.radar_signal_id&&row.radar_actionable?'<button type="button" class="primary pi-promote" data-radar-promote="'+esc(row.radar_signal_id)+'">Promover a CRM →</button>':'')+'</article>';
 }).join('')+'</div>';
 $('recordList').innerHTML=cards;
 document.querySelectorAll('[data-prospect-bucket]').forEach(button=>button.addEventListener('click',()=>{prospectDashboardFilter='';$('filter').value=button.dataset.prospectBucket||'';pageIndex=0;renderPotentialProspects();}));
}

function opportunityOwnerName(row){
 return (data.users||[]).find(user=>user.id===row.owner_user_id)?.full_name||'Sin responsable';
}
function opportunityInstitutionName(row){
 return (data.institutions||[]).find(item=>item.id===row.institution_id)?.name||'Institución sin vincular';
}
function opportunityEconomics(row){
 const value=Number(row.value)||0;
 const probability=Math.max(0,Math.min(100,Number(row.probability)||0));
 const cost=row.estimated_cost===null||row.estimated_cost===undefined||row.estimated_cost===''?null:Number(row.estimated_cost);
 const margin=Number.isFinite(cost)?value-cost:null;
 const marginPct=margin===null||value<=0?null:margin/value*100;
 return {value,probability,weighted:value*probability/100,margin,marginPct};
}
function opportunityRisk(row){
 if(['WON','LOST'].includes(row.stage))return {risk:false,reasons:[]};
 const now=Date.now(),reasons=[];
 if(row.next_action_date&&Date.parse(row.next_action_date)<now)reasons.push('seguimiento vencido');
 if(row.expected_close_date){
  const close=new Date(row.expected_close_date+'T23:59:59');
  if(Number.isFinite(close.getTime())&&close.getTime()<now)reasons.push('cierre vencido');
 }
 const economics=opportunityEconomics(row);
 if(economics.marginPct!==null&&economics.marginPct<15)reasons.push('margen bajo');
 if(!row.owner_user_id)reasons.push('sin responsable');
 if(!row.next_action)reasons.push('sin próxima acción');
 return {risk:reasons.length>0,reasons};
}
function opportunityStageGroup(stage){
 if(['DETECTED','CONTACT_PENDING'].includes(stage))return 'LEAD';
 if(stage==='CONTACTED')return 'CONTACTED';
 if(['QUALIFIED','OPPORTUNITY'].includes(stage))return 'DIAGNOSIS';
 if(stage==='PROPOSAL')return 'PROPOSAL';
 if(stage==='NEGOTIATION')return 'NEGOTIATION';
 if(stage==='WON')return 'WON';
 if(stage==='LOST')return 'LOST';
 return 'LEAD';
}
function renderOpportunityBoard(){
 $('sellerSummary').hidden=true;
 $('importBtn').hidden=!writableFor('opportunities');
 $('importHelp').hidden=!writableFor('opportunities');

 const rows=filtered();
 const allFiltered=filterRecords(
  filterExecutiveRows(scopedRows('opportunities'),'opportunities',executiveFilter,executiveOwner),
  $('search').value,
  modules.opportunities.filter,
  $('filter').value,
  row=>[relatedName(row),opportunityOwnerName(row),row.next_action].filter(Boolean).join(' ')
 );
 const open=allFiltered.filter(row=>!['WON','LOST'].includes(row.stage));
 const economics=open.map(row=>({row,...opportunityEconomics(row),risk:opportunityRisk(row)}));
 const pipeline=economics.reduce((sum,row)=>sum+row.value,0);
 const forecast=economics.reduce((sum,row)=>sum+row.weighted,0);
 const knownMargins=economics.filter(row=>row.margin!==null);
 const margin=knownMargins.reduce((sum,row)=>sum+row.margin,0);
 const risky=economics.filter(row=>row.risk.risk);
 const riskValue=risky.reduce((sum,row)=>sum+row.value,0);

 $('recordCount').innerHTML=
  '<section class="opp-command">'+
   '<header><div><p class="eyebrow">DIRECCIÓN / OPORTUNIDADES</p><h2>Dinero, probabilidad y riesgo en una sola vista</h2><p>El tablero prioriza la cartera abierta. Ganadas y perdidas siguen disponibles mediante el filtro de etapa.</p></div><button type="button" class="primary" data-new-opportunity="1">+ Nueva oportunidad</button></header>'+
   '<div class="opp-kpis">'+
    '<button type="button" data-opp-filter="pipeline"><small>Pipeline abierto</small><strong>'+money(pipeline)+'</strong><span>'+open.length+' oportunidades</span></button>'+
    '<button type="button" data-opp-filter="forecast"><small>Forecast ponderado</small><strong>'+money(forecast)+'</strong><span>valor × probabilidad</span></button>'+
    '<button type="button" data-opp-filter="margin"><small>Margen potencial</small><strong>'+(knownMargins.length?money(margin):'—')+'</strong><span>'+(knownMargins.length+' con costo informado')+'</span></button>'+
    '<button type="button" class="'+(risky.length?'risk':'')+'" data-opp-filter="risk"><small>En riesgo</small><strong>'+risky.length+'</strong><span>'+money(riskValue)+'</span></button>'+
   '</div>'+
  '</section>';

 $('exportBtn').disabled=!!failures.opportunities||!rows.length;
 $('pageNumber').textContent='';
 $('previous').disabled=true;$('next').disabled=true;

 if(failures.opportunities){
  $('recordList').innerHTML='<div class="panel empty">No pudimos cargar las oportunidades. Pulsa Actualizar.</div>';
  return;
 }

 const stages=[
  ['LEAD','Lead','#2f7de1'],
  ['CONTACTED','Contactado','#5aa7ec'],
  ['DIAGNOSIS','Diagnóstico','#8b6fd6'],
  ['PROPOSAL','Propuesta','#f3b33d'],
  ['NEGOTIATION','Negociación','#ed7d31'],
  ['WON','Ganado','#36a77a']
 ];
 const lost=rows.filter(row=>row.stage==='LOST');
 const boardRows=$('filter').value==='LOST'?lost:rows.filter(row=>row.stage!=='LOST');

 const columns=stages.map(([key,label,color])=>{
  const stageRows=boardRows.filter(row=>opportunityStageGroup(row.stage)===key)
    .sort((a,b)=>{
      const ar=opportunityRisk(a).risk?1:0,br=opportunityRisk(b).risk?1:0;
      return br-ar||(Number(b.value)||0)-(Number(a.value)||0);
    });
  const total=stageRows.reduce((sum,row)=>sum+(Number(row.value)||0),0);
  const cards=stageRows.length?stageRows.map(row=>{
    const e=opportunityEconomics(row),risk=opportunityRisk(row);
    const close=row.expected_close_date?new Date(row.expected_close_date+'T12:00:00').toLocaleDateString('es-PE',{day:'2-digit',month:'short'}):'Sin fecha';
    const marginLabel=e.marginPct===null?'Margen —':('Margen '+e.marginPct.toFixed(0)+'%');
    return '<article class="opp-card '+(risk.risk?'is-risk':'')+'">'+
      '<header><div><small>'+esc(opportunityInstitutionName(row))+'</small><h3>'+esc(row.name||'Oportunidad')+'</h3></div>'+(risk.risk?'<span class="opp-risk-badge">RIESGO</span>':'')+'</header>'+
      '<div class="opp-card-value"><strong>'+money(e.value)+'</strong><span>'+e.probability+'% prob. · '+money(e.weighted)+' ponderado</span></div>'+
      '<div class="opp-card-metrics"><span><small>'+marginLabel+'</small><b>'+(e.margin===null?'Costo pendiente':money(e.margin))+'</b></span><span><small>Cierre</small><b>'+esc(close)+'</b></span></div>'+
      '<div class="opp-card-owner"><span>'+esc(opportunityOwnerName(row))+'</span></div>'+
      '<p class="opp-card-next"><small>Siguiente acción</small><strong>'+esc(row.next_action||'Definir próxima acción')+'</strong></p>'+
      (risk.risk?'<p class="opp-card-risk-reasons">'+esc(risk.reasons.join(' · '))+'</p>':'')+
      '<footer><button type="button" data-edit="'+row.id+'" data-table="opportunities">Abrir</button></footer>'+
    '</article>';
  }).join(''):'<div class="opp-column-empty">Sin oportunidades</div>';
  return '<section class="opp-column" style="--opp-stage:'+color+'">'+
    '<header><div><i></i><strong>'+label+'</strong></div><span>'+stageRows.length+'</span></header>'+
    '<div class="opp-column-total">'+money(total)+'</div>'+
    '<div class="opp-column-cards">'+cards+'</div>'+
  '</section>';
 }).join('');

 const lostSection=$('filter').value==='LOST'
  ?'<section class="opp-lost-list"><h3>Oportunidades perdidas</h3>'+lost.map(row=>'<button data-edit="'+row.id+'" data-table="opportunities"><span>'+esc(row.name||'Oportunidad')+'</span><b>'+money(row.value)+'</b></button>').join('')+'</section>'
  :'';

 $('recordList').innerHTML='<section class="opp-board">'+columns+'</section>'+lostSection;
 const add=document.querySelector('[data-new-opportunity]');if(add)add.onclick=()=>openEditor('opportunities');
 document.querySelectorAll('[data-opp-filter]').forEach(button=>button.onclick=()=>{
  const type=button.dataset.oppFilter;
  if(type==='risk'){executiveFilter='risk';$('filter').value='';}
  else if(type==='pipeline'){executiveFilter='pipeline';$('filter').value='';}
  else {executiveFilter='';$('filter').value='';}
  renderOpportunityBoard();
 });
}

function renderRecords(){
 if(page==='prospects'){renderPotentialProspects();return;}
 if(page==='opportunities'){renderOpportunityBoard();return;}
 if(page==='now'){renderNow();return;}
 if(page==='radar'){renderRadarRecords();return;}
 if(page==='mail'){renderMailRecords();return;}
 if(page==='tasks'){renderTaskRecords();return;}
 const isUsers=page==='users',isGoals=page==='goals',isExpenses=page==='expenses';
 $('recordContext').hidden=!executiveFilter&&!executiveOwner&&!sellerQuickFilter;
 const sellerFilterLabel={active:'Prospectos activos',action:'Requieren acción',mature:'Madurez alta',meeting:'Con reunión próxima'}[sellerQuickFilter];
 $('recordContextLabel').textContent=[{won:'Ganadas con cierre previsto este mes',pipeline:'Cartera abierta',risk:'Cartera en riesgo'}[executiveFilter],executiveOwner?'Vendedor: '+(data.users.find(row=>row.id===executiveOwner)?.full_name||'seleccionado'):'',sellerFilterLabel].filter(Boolean).join(' · ');
 $('importBtn').hidden=isUsers||isGoals||!writableFor(page);$('importBtn').disabled=loading||busy||!!failures[page];$('importHelp').hidden=isUsers||isGoals||!writableFor(page);
 $('sellerSummary').hidden=canViewDashboard()||!['leads','tasks'].includes(page);$('sellerSummary').innerHTML=page==='tasks'?renderTaskPrioritySummary():renderSellerWorkspaceSummary();
 const rows=filtered();const max=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,max-1);
 $('recordCount').textContent=failures[page]?'Información no disponible':rows.length+' registros';
 $('exportBtn').disabled=!!failures[page]||!rows.length;
 $('pageNumber').textContent='Página '+(pageIndex+1)+' de '+max;$('previous').disabled=pageIndex===0;$('next').disabled=pageIndex+1>=max;
 const config=modules[page],canEdit=writableFor(page);
 const secondHeader=isUsers?'Rol':isGoals?'Responsable':isExpenses?'Fecha del gasto':['tasks','meetings','deliverables','documents'].includes(page)?'Prospecto':page==='institutions'?'Ciudad':['catalog_products','cost_profiles'].includes(page)?'Origen / destino':'Institución';
 const detailHeader=isGoals?'Metas y presupuesto':isExpenses?'Importe':page==='tasks'?'Urgencia dinámica':page==='meetings'?'Fecha y modalidad':page==='documents'?'Carpeta / versión':(['leads','opportunities'].includes(page)?'Valor estimado':page==='catalog_products'?'Precio proveedor':page==='cost_profiles'?'Tipo de cambio':'Detalle');
 const pageRows=rows.slice(pageIndex*size,(pageIndex+1)*size);
 const rowsMarkup=pageRows.map(row=>{
  const secondCell=isUsers?badge(row.role,page):isGoals?esc(relationName('owner_user_id',row)||'Organización'):isExpenses?esc(row.expense_date||'Sin fecha'):['tasks','meetings','deliverables','documents'].includes(page)?esc(relationName('lead_id',row)||'Sin prospecto vinculado'):page==='catalog_products'?esc(row.origin_country||'—')+' → Perú':page==='cost_profiles'?esc(row.origin_country||'—')+' → '+esc(row.destination_country||'—'):esc(page==='institutions'?row.city||'—':relatedName(row)||'Sin vincular');
  const stateCell=isGoals?'<span class="badge success">Meta definida</span>':page==='catalog_products'?(row.active===false?'<span class="badge warn">Inactivo</span>':'<span class="badge success">Activo</span>'):badge(row[config.filter],page);
  const detail=isGoals?'Ventas '+money(row.target_won_value)+'<small>Margen bruto '+money(row.target_margin)+'</small><small>Gastos '+(row.target_expenses===null||row.target_expenses===undefined?'Sin presupuesto':money(row.target_expenses))+'</small>':isExpenses?money(row.amount):page==='opportunities'?money(row.value):page==='leads'?money(row.estimated_value):page==='catalog_products'?catalogMoney(row.supplier_unit_price):page==='cost_profiles'?Number(row.exchange_rate||0).toFixed(2):page==='tasks'?urgencyCell(row):page==='meetings'?('<strong>'+esc(date(row.start_at))+'</strong><small>'+esc(enums.meetingMode[row.mode]||row.mode)+' · '+esc(date(row.end_at))+'</small>'):page==='documents'?('<strong>'+esc(enums.documentCategory[row.category]||row.category)+'</strong><small>Versión actual: v'+Number(row.current_version||0)+'</small>'):page==='activities'?esc(date(row.occurred_at)):esc(row.phone||'—');
  const actionLabel=canEdit?'Editar':'Ver';
  const rowName=page==='catalog_products'?catalogDisplayName(row):nameOf(row)||('Meta '+row.period_start);
  const subline=isGoals?(row.period_start+' → '+row.period_end):isExpenses?(row.currency||'PEN'):(row.email||row.next_action||row.job_title||row.category||row.notes||'');
  return '<tr><td><strong>'+esc(rowName)+'</strong><small>'+esc(subline)+'</small></td><td>'+secondCell+'</td><td>'+stateCell+'</td><td>'+detail+'</td>'+(page==='leads'?'<td>'+maturityCell(row)+'</td>':'')+'<td><div class="row-actions">'+(page==='leads'?'<button class="primary" data-lead-detail="'+row.id+'">Abrir expediente comercial</button>':'')+(page==='documents'&&Number(row.current_version)>0?'<button data-open-document="'+row.id+'">Abrir archivo</button>':'')+'<button data-edit="'+row.id+'" data-table="'+page+'">'+actionLabel+'</button>'+(page==='leads'&&writable()?'<button data-activity-lead="'+row.id+'">Registrar movimiento</button>':'')+(!isUsers&&canDelete()?'<button class="danger-text" data-delete="'+row.id+'" data-table="'+page+'">Eliminar</button>':'')+'</div></td></tr>';
 }).join('');
 const leadCards=page==='leads'?renderLeadCards(pageRows):'';
 $('recordList').innerHTML=failures[page]?'<div class="panel empty">No pudimos cargar estos registros. Pulsa Actualizar.</div>':!rows.length?`<div class="panel empty">${$('search').value||$('filter').value?'No hay coincidencias. Cambia la búsqueda o el filtro.':'Aún no hay registros. Crea el primero con el botón superior.'}</div>`:`${leadCards}<div class="table-wrap ${page==='leads'?'lead-desktop-table':''}"><table><thead><tr><th>Nombre</th><th>${secondHeader}</th><th>Estado / tipo</th><th>${detailHeader}</th>${page==='leads'?'<th>Madurez / potencial</th>':''}<th>Acción</th></tr></thead><tbody>${rowsMarkup}</tbody></table></div>`;
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
  if(table==='documents'){
   const paths=(data.document_versions||[]).filter(version=>version.document_id===id).map(version=>version.storage_path).filter(Boolean);
   if(paths.length){const removed=await sb.storage.from('crm-documents').remove(paths);if(removed.error)throw removed.error;}
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
 if(!accessible(table)||loading||busy||failures[table])return false; if(table==='users'&&(!id||!canManageUsers()))return false; if(table==='goals'&&!canManageGoals())return false; if(!id&&!writableFor(table))return false;
 const dependencies=fieldsFor(table).filter(f=>f.type==='relation').map(f=>relationTable(f.key));
 if(dependencies.some(k=>failures[k])){notice('Actualiza los módulos vinculados antes de abrir este formulario para conservar las relaciones del registro.',true);return false;}
 const row=id?scopedRows(table).find(r=>r.id===id):{owner_user_id:table==='goals'?null:currentActor(),assigned_to:currentActor(),...(table==='expenses'?{expense_date:localDay(new Date()),currency:'PEN',category:'OPERATIONS'}:{}),...initialValues};if(!row)return false;
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
 $('saveBtn').hidden=!writableFor(table);$('saveBtn').disabled=false;$('editor').showModal();return true;
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
 $('editor').close();busy=false;await reload();if(!failures[table])notice('Registro guardado correctamente.',false,2400);
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
 if(event==='PASSWORD_RECOVERY'){clearSession();session=current;setRecovery(true);setMode('update');hideAppSplash();return;}
 if(!current){setRecovery(false);clearSession();hideAppSplash();return;}
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
 const lead=query.get('lead'),requested=hash.get('page');
 return {page:requested||'dashboard',lead:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead||'')?lead:null};
}
function rememberPage(lead=null,mode='replace'){
 if(!profile||recovery)return;
 const query=new URLSearchParams(location.search||'');query.delete('lead');
 if(lead)query.set('lead',lead);
 const url=location.pathname+(query.size?'?'+query.toString():'')+'#page='+page;
 const state={xicronix:true,page,lead:lead||null};
 if(mode==='push')history.pushState(state,'',url);else history.replaceState(state,'',url);
}
function renderHistoryPage(target){
 if(!profile||recovery)return;
 let next=target||'dashboard';
 if(!accessible(next))next=canViewDashboard()?'dashboard':'leads';
 page=next;pageIndex=0;executiveFilter='';executiveOwner='';sellerQuickFilter='';sellerManagementSearch='';$('search').value='';
 const config=modules[page];$('filter').dataset.page=page;
 $('filter').innerHTML='<option value="">Todos los estados / tipos</option>'+Object.entries(config?.options||{}).map(([key,value])=>'<option value="'+key+'">'+value+'</option>').join('');
 if(mobileNavMode())applySidebar(true);
 render();
}
function installHistoryGuard(){
 if(!profile||recovery)return;
 const current=readEntryRoute().page||page||'dashboard';
 history.replaceState({xicronix:true,page:current,root:true},'',location.pathname+location.search+'#page='+current);
 history.pushState({xicronix:true,page:current,guard:true},'',location.pathname+location.search+'#page='+current);
 window.addEventListener('popstate',event=>{
  if(!profile||recovery)return;
  if($('editor')?.open){$('editor').close();history.pushState({xicronix:true,page},'',location.pathname+location.search+'#page='+page);return;}
  if($('leadDetailDialog')?.open){closeLeadDetails(false);history.pushState({xicronix:true,page},'',location.pathname+location.search+'#page='+page);return;}
  if($('attentionDialog')?.open){$('attentionDialog').close();history.pushState({xicronix:true,page},'',location.pathname+location.search+'#page='+page);return;}
  if(mobileNavMode()&&!$('appView').classList.contains('sidebar-collapsed')){applySidebar(true);history.pushState({xicronix:true,page},'',location.pathname+location.search+'#page='+page);return;}
  const target=event.state?.xicronix?event.state.page:new URLSearchParams((location.hash||'').slice(1)).get('page');
  if(!target||target===page){
    renderHistoryPage(canViewDashboard()?'dashboard':'leads');
    history.pushState({xicronix:true,page,guard:true},'',location.pathname+location.search+'#page='+page);
    return;
  }
  renderHistoryPage(target);
 });
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
 const need=activities.find(row=>row.need_summary)?.need_summary||'Necesidad aún no precisada.';
 const evidence=activities.find(row=>row.evidence_note)?.evidence_note||'Sin evidencia comercial explícita registrada.';
 const decisionSignal=activities.find(row=>row.decision_timeline||row.budget_signal);
 const decisionContext=[decisionSignal?.decision_timeline,decisionSignal?.budget_signal].filter(Boolean).join(' · ')||'Timing y presupuesto aún no confirmados.';
 const budget=Number(lead.estimated_value)>0?money(lead.estimated_value):'Sin definir';
 const field=(label,value)=>'<div class="lead-detail-row"><dt>'+esc(label)+'</dt><dd>'+esc(value||'Sin registrar')+'</dd></div>';
 const directPhone=String(contact?.phone||institution?.phone||'').trim();
 const directEmail=String(contact?.email||institution?.email||'').trim();
 const directRow={contact_email:directEmail,institution_name:institution?.name||lead.title||'Prospecto'};
 const quickActions='<section class="lead-action-center"><div class="lead-action-primary"><small>ACCIÓN RECOMENDADA</small><strong>'+esc(action)+'</strong><span>'+(nextDate?'Antes de '+esc(date(nextDate)):'Sin fecha comprometida')+'</span></div><div class="lead-action-buttons">'+
  (directPhone?'<a class="lead-action-button primary" href="'+esc(radarPhoneHref(directPhone))+'">Llamar ahora</a>':'')+
  (directEmail?'<button type="button" class="lead-action-button" data-smart-mail="'+lead.id+'">Correo Zoho</button>':'')+
  (directPhone?'<a class="lead-action-button" href="'+esc(radarWhatsappHref(directPhone))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
  (writableFor('activities')?'<button type="button" class="lead-action-button" data-activity-lead="'+lead.id+'">Registrar resultado</button>':'')+
 '</div><p class="lead-action-contact">'+esc(contact?nameOf(contact):'Contacto decisor pendiente')+(contact?.job_title?' · '+esc(contact.job_title):'')+(directPhone?' · '+esc(directPhone):'')+(directEmail?' · '+esc(directEmail):'')+'</p></section>';
 const buttons=writableFor('leads')?'<details class="lead-admin-tools"><summary>Gestión del expediente</summary><div class="lead-master-actions"><button type="button" data-edit-lead="'+lead.id+'">Editar prospecto</button><button type="button" data-create-task-lead="'+lead.id+'">Crear tarea</button><button type="button" data-create-meeting-lead="'+lead.id+'">Agendar reunión</button><button type="button" data-create-deliverable-lead="'+lead.id+'">Registrar entregable</button><button type="button" data-create-document-lead="'+lead.id+'">Subir documento</button></div></details>':'';
 $('leadDetailTitle').textContent='Expediente Comercial · '+(institution?.name||lead.title||'Prospecto');
 $('leadDetailContent').innerHTML='<section class="lead-master commercial-dossier"><p class="muted">'+(dataSource==='demo'?'Demostración, sin datos reales.':'Radiografía comercial basada únicamente en los registros del expediente.')+'</p>'+quickActions+buttons+
 '<section class="candidate-story"><article><small>1 · PROBLEMA</small><h3>'+esc(need)+'</h3><p>'+(latest?esc(latest.subject||'Último movimiento registrado'):'Sin movimiento reciente')+'</p></article><article><small>2 · EVIDENCIA</small><h3>'+esc(evidence)+'</h3><p>'+esc(latest?'Última interacción: '+date(latest.occurred_at):'Sin interacción verificada')+'</p></article><article><small>3 · ACCIÓN</small><h3>'+esc(action)+'</h3><p>'+(nextDate?'Próximo compromiso: '+esc(date(nextDate)):'Aún no existe una fecha comprometida.')+'</p></article><article><small>4 · VALOR / DECISIÓN</small><h3>'+esc(budget)+'</h3><p>'+esc(decisionContext)+'</p></article></section>'+
 '<div class="dossier-status-row"><span class="dossier-state '+health.className+'"><small>Estado actual</small><strong>'+health.label+'</strong></span><span class="dossier-state '+urgency.className+'"><small>Urgencia</small><strong>'+urgency.label+'</strong></span><span class="dossier-state '+potentialState.className+'"><small>Potencial</small><strong>'+potentialState.label+(potentialState.value!==undefined?' · '+potentialState.value+'%':'')+'</strong></span></div>'+
 '<section class="dossier-first-look"><article><small>Último movimiento</small><strong>'+esc(latest?date(latest.occurred_at):'Sin registro')+'</strong></article><article><small>Próxima fecha clave</small><strong>'+esc(nextDate?date(nextDate):'Sin fecha')+'</strong></article><article><small>Próxima reunión</small><strong>'+esc(nextMeeting?date(nextMeeting.start_at):'Sin reunión')+'</strong></article><article><small>Hito actual</small><strong>'+maturity+'% · '+esc(milestoneLabel(lead.commercial_milestone))+'</strong><div class="dossier-progress"><i style="width:'+maturity+'%"></i></div></article></section>'+
 '<section class="deliverable-radiography"><h3>Entregables</h3><div class="deliverable-grid"><article><small>Entregado por Xicronix</small><strong>'+xDelivered.length+'</strong><p>'+esc(xDelivered[0]?.title||'Sin entregas registradas')+'</p></article><article><small>Pendiente de Xicronix</small><strong>'+xPending.length+'</strong><p>'+esc(xPending[0]?.title||'Sin pendientes registrados')+'</p></article><article><small>Recibido del cliente</small><strong>'+cReceived.length+'</strong><p>'+esc(cReceived[0]?.title||'Sin recepciones registradas')+'</p></article><article><small>Pendiente del cliente</small><strong>'+cPending.length+'</strong><p>'+esc(cPending[0]?.title||'Sin pendientes registrados')+'</p></article></div></section>'+
 '<div class="lead-master-kpis"><article><small>Madurez comercial</small><strong>'+maturity+'%</strong><span>'+esc(milestoneLabel(lead.commercial_milestone))+'</span></article><article><small>Potencial calculado</small><strong>'+(potential===null?'—':potential+'%')+'</strong><span>Indicador separado de la madurez</span></article><article><small>Presupuesto estimado</small><strong>'+esc(budget)+'</strong><span>Pagos se controlarán en su módulo financiero</span></article><article><small>Tareas pendientes</small><strong>'+pending.length+'</strong><span>'+(pending[0]?.due_at?'Próxima: '+esc(date(pending[0].due_at)):'Sin vencimiento próximo')+'</span></article></div><div class="lead-master-grid"><section><h3>Ficha maestra</h3><dl>'+field('Estado',enums.status[lead.status]||lead.status)+field('Institución',institution?.name||'Pendiente de vincular')+field('Contacto',contact?nameOf(contact):'Pendiente de vincular')+(contact?field('Cargo',contact.job_title)+field('Correo',contact.email)+field('Teléfono',contact.phone):'')+field('Necesidad',need)+field('Canal de origen',enums.leadSource[lead.source]||lead.source)+field('Próxima acción',lead.next_action)+field('Fecha de seguimiento',date(lead.next_action_date))+'</dl></section><section><h3>Hitos comerciales</h3><ol class="milestone-rail">'+renderMilestoneRail(lead.commercial_milestone,esc)+'</ol><p class="muted">El porcentaje solo avanza por acciones que acreditan un hito; más correos o llamadas no lo incrementan por sí solos.</p></section></div><section><h3>Movimientos registrados</h3>'+(activities.length?activities.map(row=>'<article class="lead-note"><div class="movement-note-head"><h4>'+esc(row.subject||MOVEMENT_ACTIONS[row.action_code]||enums.activityType[row.type]||'Movimiento')+'</h4>'+(row.action_code?'<span class="badge">'+esc(MOVEMENT_ACTIONS[row.action_code]||row.action_code)+'</span>':'')+'</div><small>'+esc(enums.activityType[row.type]||row.type)+' · ocurrió '+esc(date(row.occurred_at))+' · registrado '+esc(date(row.created_at))+'</small><p>'+esc(row.notes||row.need_summary||'Sin notas adicionales')+'</p>'+(row.evidence_note?'<p><strong>Evidencia:</strong> '+esc(row.evidence_note)+'</p>':'')+(row.milestone_after?'<p class="milestone-evidence">Hito acreditado: '+esc(milestoneLabel(row.milestone_after))+' · '+Number(row.maturity_after||0)+'%</p>':'')+(writableFor('activities')?'<button type="button" data-edit-activity="'+row.id+'">Editar movimiento</button>':'')+'</article>').join(''):'<p class="muted">Todavía no hay movimientos vinculados a este prospecto.</p>')+ '</section><section><h3>Documentos del expediente</h3>'+(documents.length?documents.map(row=>{const version=currentDocumentVersion(row.id);const versions=(data.document_versions||[]).filter(item=>item.document_id===row.id).sort((a,b)=>Number(b.version_number)-Number(a.version_number));return '<article class="lead-note document-note"><div><strong>'+esc(row.title)+'</strong><p>'+esc(enums.documentCategory[row.category]||row.category)+' · '+esc(enums.documentStatus[row.status]||row.status)+' · v'+Number(row.current_version||0)+'</p><small>'+(version?esc(version.file_name)+' · cargado '+esc(date(version.created_at)):'Sin archivo cargado')+'</small>'+(versions.length>1?'<details class="document-history"><summary>Historial de versiones ('+versions.length+')</summary>'+versions.map(item=>'<div><span>v'+Number(item.version_number)+' · '+esc(enums.documentStatus[item.status]||item.status)+' · '+esc(item.file_name)+'</span><button type="button" data-open-document-version="'+item.id+'">Abrir</button></div>').join('')+'</details>':'')+'</div>'+(version?'<button type="button" data-open-document="'+row.id+'">Abrir actual</button>':'')+'</article>';}).join(''):'<p class="muted">Sin documentos registrados.</p>')+'</section><section><h3>Reuniones</h3>'+(meetings.length?meetings.map(row=>'<article class="lead-note"><strong>'+esc(row.title)+'</strong><p>'+esc(enums.meetingStatus[row.status]||row.status)+' · '+esc(date(row.start_at))+' → '+esc(date(row.end_at))+'</p><p>'+esc(enums.meetingMode[row.mode]||row.mode)+' · '+esc(enums.attendeeStatus[row.attendee_status]||row.attendee_status)+'</p></article>').join(''):'<p class="muted">Sin reuniones registradas.</p>')+'</section><section><h3>Tareas vinculadas</h3>'+(tasks.length?tasks.map(row=>'<article class="lead-note"><strong>'+esc(row.title)+'</strong><p>'+esc(enums.taskStatus[row.status]||row.status)+' · '+esc(enums.priority[row.priority]||row.priority)+' · '+esc(date(row.due_at))+'</p></article>').join(''):'<p class="muted">Sin tareas vinculadas.</p>')+'</section></section>';
 rememberPage(id);$('leadDetailDialog').showModal();
}

function init(){
 window.setTimeout(hideAppSplash,2500);

 restoreRememberedEmail();
 try{recovery=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'||sessionStorage.getItem(RECOVERY_KEY)==='1';}catch(_error){}
 $('rememberEmail').onchange=()=>{if(!$('rememberEmail').checked){try{localStorage.removeItem(REMEMBER_EMAIL_KEY);}catch(_error){}}};
 $('closeLeadDetail').onclick=()=>closeLeadDetails();$('closeAttention').onclick=()=>{if($('attentionDialog').open)$('attentionDialog').close();};$('closeSmartMail').onclick=()=>{if($('smartMailDialog').open)$('smartMailDialog').close();};
 $('leadDetailDialog').addEventListener('close',()=>{$('leadDetailContent').replaceChildren();rememberPage();});$('attentionDialog').addEventListener('close',()=>{$('attentionContent').replaceChildren();});
 initTheme();
 initSidebar();
 $('fields').addEventListener('input',()=>{updateQuotePreview();updateMeetingPreview();});
 $('fields').addEventListener('change',event=>{syncEditorRelations(event.target?.name);updateQuotePreview();updateMovementPreview();updateMeetingPreview();});
 $('adminModeBtn').onclick=()=>setWorkspace(ADMIN);$('sellerModeBtn').onclick=()=>setWorkspace(SELLER);$('entryDirectionBtn').onclick=()=>chooseWorkspaceEntry(ADMIN);$('entrySellerBtn').onclick=()=>chooseWorkspaceEntry(SELLER);renderWorkspaceControls();
 $('sidebarLiveBtn').onclick=()=>setDataSource('live');$('sidebarDemoBtn').onclick=()=>setDataSource('demo');$('resetDemoBtn').onclick=resetDemo;$('sidebarDirectionBtn').onclick=()=>setWorkspace(ADMIN);$('sidebarSellerBtn').onclick=()=>setWorkspace(SELLER);$('demoSeller').onchange=selectDemoSeller;
 $('clearRecordContext').onclick=()=>{executiveFilter='';executiveOwner='';sellerQuickFilter='';renderRecords();};
 $('closeMethod').onclick=()=>$('methodDialog').close();
 $('methodText').textContent=EXECUTIVE_METHOD;
 $('dateLabel').textContent=new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long'});
 $('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='night'?'day':'night',true);
 $('sidebarToggle').onclick=event=>{event.stopPropagation();applySidebar(!$('appView').classList.contains('sidebar-collapsed'),true);};
 document.addEventListener('click',event=>{if(!mobileNavMode())return;const sidebar=$('mainSidebar');if(!sidebar||$('appView').classList.contains('sidebar-collapsed'))return;if(sidebar.contains(event.target)||event.target===$('sidebarToggle'))return;applySidebar(true);});
 document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.radarPromote){promoteRadarSignal(b.dataset.radarPromote);return;}if(b.id==='refreshIntelligenceBtn'){b.disabled=true;b.classList.add('is-refreshing');refreshLiveIntelligence(true).finally(()=>{const next=$('refreshIntelligenceBtn');if(next){next.disabled=false;next.classList.remove('is-refreshing');}});return;}if(b.dataset.analyticsPeriod){setAnalyticsPeriod(b.dataset.analyticsPeriod);return;}if(b.dataset.analyticsExport!==undefined){exportAnalytics();return;}if(b.id==='brandThemeToggle'){applyTheme(document.documentElement.dataset.theme==='night'?'day':'night',true);return;}if(b.id==='ceoMethodBtn'){$('methodDialog').showModal();return;}if(b.dataset.ceoView){openExecutiveView(b.dataset.ceoView);return;}if(b.dataset.ceoSeller){openExecutiveView('won',b.dataset.ceoSeller);return;}if(b.dataset.passwordToggle){togglePassword(b);return;}if(b.dataset.sellerFilter){navigate('leads');sellerQuickFilter=b.dataset.sellerFilter;renderRecords();return;}if(b.dataset.prospectKpi){navigate('prospects');prospectDashboardFilter=b.dataset.prospectKpi==='ALL'?'':b.dataset.prospectKpi;$('filter').value='';pageIndex=0;renderRecords();return;}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.attentionOpen){if($('attentionDialog').open)$('attentionDialog').close();openLeadDetails(b.dataset.attentionOpen);return;}if(b.dataset.openDocumentVersion){openDocumentVersion(b.dataset.openDocumentVersion);return;}if(b.dataset.openDocument){openDocumentFile(b.dataset.openDocument);return;}if(b.dataset.createDocumentLead){openDocumentForLead(b.dataset.createDocumentLead);return;}if(b.dataset.createDeliverableLead){openDeliverableForLead(b.dataset.createDeliverableLead);return;}if(b.dataset.createMeetingLead){openMeetingForLead(b.dataset.createMeetingLead);return;}if(b.dataset.leadDetail){openLeadDetails(b.dataset.leadDetail);return;}if(b.dataset.editLead){if(openEditor('leads',b.dataset.editLead))closeLeadDetails(false);return;}if(b.dataset.editActivity){if(openEditor('activities',b.dataset.editActivity))closeLeadDetails(false);return;}if(b.dataset.activityLead){if(openActivityForLead(b.dataset.activityLead)!==false)closeLeadDetails(false);return;}if(b.dataset.createTaskLead){openTaskForLead(b.dataset.createTaskLead);return;}if(b.dataset.taskLead){openLeadDetails(b.dataset.taskLead);return;}if(b.dataset.taskResponse){openActivityForLead(b.dataset.taskResponse);return;}if(b.dataset.taskModule){const row=scopedRows('tasks').find(item=>item.id===b.dataset.taskModule);if(row)openTaskModule(row);return;}if(b.dataset.taskComplete){completeTaskQuick(b.dataset.taskComplete);return;}if(b.dataset.radarLead){openLeadFromRadar(b.dataset.radarLead);return;}if(b.dataset.radarActivity){openActivityForLead(b.dataset.radarActivity);return;}if(b.dataset.editSmartContact!==undefined){const contactId=b.dataset.editSmartContact||'';const institutionId=b.dataset.editSmartInstitution||'';if($('smartMailDialog').open)$('smartMailDialog').close();if(contactId){openEditor('contacts',contactId);}else if(institutionId){openEditor('institutions',institutionId);}return;}if(b.dataset.smartMail){openSmartMailDraft(b.dataset.smartMail);return;}if(b.dataset.copySmartMail){copySmartMailDraft(b.dataset.copySmartMail);return;}if(b.dataset.openSmartZoho){openSmartMailInZoho(b.dataset.openSmartZoho);return;}if(b.dataset.copyZohoWebhook!==undefined){copyZohoWebhookUrl();return;}if(b.dataset.mailLead){openLeadDetails(b.dataset.mailLead);return;}if(b.dataset.mailReviewed){markMailReviewed(b.dataset.mailReviewed);return;}if(b.dataset.edit)openEditor(b.dataset.table,b.dataset.edit);if(b.dataset.delete)removeRecord(b.dataset.table,b.dataset.delete);if(b.dataset.mode)setMode(b.dataset.mode);});
 $('forgotBtn').onclick=()=>setMode('reset');$('backLogin').onclick=async()=>{if(recovery){await sb.auth.signOut();clearSession();setRecovery(false);}setMode('login');};
 $('authForm').onsubmit=authenticate;$('recordForm').onsubmit=saveRecord;$('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=importCsvFile;
 $('refreshBtn').onclick=reload;$('newBtn').onclick=()=>openEditor(page==='dashboard'?'institutions':page);
 $('search').oninput=$('filter').onchange=()=>{pageIndex=0;renderRecords();};
 $('previous').onclick=()=>{pageIndex--;renderRecords();};$('next').onclick=()=>{pageIndex++;renderRecords();};$('mobileBackDashboard').onclick=()=>navigate('dashboard');
 const close=()=>{if(!busy)$('editor').close();};$('closeEditor').onclick=$('cancelEditor').onclick=close;$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('logoutBtn').onclick=async()=>{const {error}=await sb.auth.signOut();if(error){notice(errorText(error),true);return;}clearSession();setMode('login');};
 $('exportBtn').onclick=()=>{if(!accessible(page)||loading||busy||failures[page])return;const columns=fieldsFor(page).filter(field=>!field.transient).map(field=>({key:field.key,label:field.label}));const rows=filtered().map(row=>Object.fromEntries(columns.map(c=>{const field=modules[page].fields.find(f=>f.key===c.key);return [c.key,field.type==='relation'?relationName(c.key,row):costRateKeys.has(c.key)?Number(row[c.key])*100:field.options?.[row[c.key]]||row[c.key]];})));const url=URL.createObjectURL(new Blob([csv(rows,columns)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`xicronix-${dataSource==='demo'?'SIMULADO-':''}${page}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!window.supabase){$('authMsg').textContent='Xicronix no pudo cargar temporalmente el servicio de acceso. Tu conexión puede estar funcionando con normalidad. Cierra y vuelve a abrir la aplicación; si persiste, usa Actualizar.';$('authBtn').disabled=true;return;}
 sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 sb.auth.onAuthStateChange(handleAuth);
 const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){setRecovery(false);setMode('reset');$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}
 if(typeof sb.auth.getSession==='function')sb.auth.getSession().then(({data,error})=>{if(!error)handleAuth('INITIAL_SESSION',data.session);}).catch(()=>{$('authMsg').textContent='No se pudo verificar la sesión. Recarga la página.';});
}
// Both the SDK's defer script and module execution finish before DOMContentLoaded.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

