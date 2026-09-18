"""Apply reviewed, deterministic V2 production integration. No database changes."""
from pathlib import Path
import hashlib

root = Path(__file__).resolve().parents[1]
p = root / 'app.js'
s = p.read_text()
if "const CRM_RELEASE='2026-09-18-v2.1';" in s:
    print('Production integration already applied; no changes.')
    raise SystemExit(0)
assert hashlib.sha1(b'blob '+str(p.stat().st_size).encode()+b'\0'+p.read_bytes()).hexdigest() == '375c9faf25d9fcf126ba48d4f9ac817d60ba078e', 'Unexpected app.js baseline; review before patching'

def replace_once(old, new):
    global s
    assert s.count(old) == 1, f'Expected one exact anchor: {old[:100]!r}, found {s.count(old)}'
    s = s.replace(old, new, 1)

replace_once("const PUBLIC_APP_URL='https://xicronix-commercial-intelligence-git-improvemen-2952f5-xicronix.vercel.app/';", "const PUBLIC_APP_URL='https://xicronix-commercial-intelligence.vercel.app/';\nconst CRM_RELEASE='2026-09-18-v2.1';\nconst REMEMBER_EMAIL_KEY='xicronix.crm.remembered-email';\nconst RECOVERY_KEY='xicronix.crm.password-recovery';\nlet entryRoute=readEntryRoute();")
replace_once("dataSource=saved==='live'?'live':saved==='demo'?'demo':isAdminAccount()?'demo':'live';", "dataSource=entryRoute?.lead?'live':saved==='demo'?'demo':'live';")
replace_once("const authRedirectUrl=()=>/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)?PUBLIC_APP_URL:location.origin+location.pathname;", "const authRedirectUrl=()=>PUBLIC_APP_URL;")
replace_once("function clearWorkspaceViews(){\n", "function clearWorkspaceViews(){\n closeLeadDetails(false);\n")
replace_once("function clearSession(){\n", "function clearSession(){\n closeLeadDetails(false);\n")
replace_once("finally{if(version===loadVersion){loading=false;$('refreshBtn').disabled=false;render();}}", "finally{if(version===loadVersion){loading=false;$('refreshBtn').disabled=false;render();applyEntryRoute();}}")
replace_once(" page=next;pageIndex=0;executiveFilter='';executiveOwner='';$('search').value='';", " page=next;pageIndex=0;executiveFilter='';executiveOwner='';$('search').value='';\n rememberPage();")
replace_once(" $('workspaceControls').hidden=!profile;", " $('workspaceControls').hidden=!profile;\n $('complaintsLink').hidden=!admin||dataSource!=='live';")
replace_once("+'<td><div class=\"row-actions\"><button data-edit=\"'", "+'<td><div class=\"row-actions\">'+(page==='leads'?'<button data-lead-detail=\"'+row.id+'\">Ver solicitud</button>':'')+'<button data-edit=\"'")
replace_once("mode=next; $('authForm').reset();resetPasswordVisibility();$('authMsg').textContent='';", "const previousEmail=$('email').value,previousRemember=$('rememberEmail').checked;\n mode=next; $('authForm').reset();restoreRememberedEmail(previousEmail);$('rememberEmail').checked=previousRemember||$('rememberEmail').checked;resetPasswordVisibility();$('authMsg').textContent='';")
replace_once("$('authHint').textContent=reset?'Te enviaremos un enlace para cambiar tu contraseña.':update?'Elige una contraseña de al menos 6 caracteres.':'Accede con tu correo y contraseña.';", "$('authHint').textContent=reset?'Te enviaremos un enlace para cambiar tu contraseña.':update?'Elige una contraseña única de al menos 12 caracteres.':'Accede con tu correo y contraseña.';")
replace_once("$('emailField').hidden=update;$('email').required=!update;", "$('emailField').hidden=false;$('email').required=!update;$('email').readOnly=update;if(update)$('email').value=session?.user.email||previousEmail;\n $('rememberEmailLabel').hidden=update;$('recoveryHelp').hidden=!reset;")
replace_once("$('passwordField').hidden=reset;$('password').required=!reset;$('password').minLength=6;$('confirmPassword').minLength=6;", "$('passwordField').hidden=reset;$('password').required=!reset;$('password').disabled=reset;$('password').minLength=next==='login'?6:12;$('confirmPassword').minLength=12;")
replace_once("if(code==='weak_password')return 'Usa una contraseña de al menos 6 caracteres y combina letras, números y símbolos.';", "if(code==='weak_password')return 'Usa una contraseña única de al menos 12 caracteres.';")
replace_once("startResetCooldown(60);$('authMsg').textContent='Si el correo tiene una cuenta, recibirás un enlace. Revisa también la carpeta de spam.';return;", "rememberEmailChoice();startResetCooldown(60);$('authMsg').textContent='Si el correo tiene una cuenta, recibirás un enlace. Revisa también la carpeta de spam. Si el enlace abre una versión de pruebas, utiliza la opción de recuperación alternativa de abajo.';return;")
replace_once("result=await sb.auth.updateUser({password});if(result.error)throw result.error;", "if(password.length<12){$('authMsg').textContent='Usa al menos 12 caracteres.';return;}\n const verified=await sb.auth.getUser();if(verified.error||!session||verified.data.user?.id!==session.user.id)throw {code:'invalid_token'};\n result=await sb.auth.updateUser({password});if(result.error)throw result.error;")
replace_once("recovery=false;history.replaceState(null,'',location.pathname);$('authForm').reset();await sb.auth.signOut();clearSession();setMode('login');$('authMsg').textContent='Contraseña actualizada. Ya puedes ingresar.';return;", "setRecovery(false);history.replaceState(null,'',location.pathname);$('authForm').reset();await sb.auth.signOut({scope:'local'});clearSession();setMode('login');$('email').value=email;$('authMsg').textContent='Contraseña actualizada. Ingresa y guárdala en el gestor del navegador cuando te lo ofrezca.';return;")
replace_once("if(result.error)throw result.error;\n $('authMsg').textContent=mode==='signup'?", "if(result.error)throw result.error;\n rememberEmailChoice();\n if(mode==='login'&&result.data?.session){setRecovery(false);handleAuth('SIGNED_IN',result.data.session);}\n $('authMsg').textContent=mode==='signup'?")
replace_once("if(event==='PASSWORD_RECOVERY'){clearSession();session=current;recovery=true;setMode('update');return;}\n if(!current){recovery=false;clearSession();return;}\n if(recovery)return;", "if(event==='PASSWORD_RECOVERY'){clearSession();session=current;setRecovery(true);setMode('update');return;}\n if(!current){setRecovery(false);clearSession();return;}\n if(recovery){clearSession();session=current;setMode('update');return;}")
replace_once("function init(){\n initTheme();", "function init(){\n restoreRememberedEmail();\n try{recovery=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'||sessionStorage.getItem(RECOVERY_KEY)==='1';}catch(_error){}\n $('rememberEmail').onchange=()=>{if(!$('rememberEmail').checked){try{localStorage.removeItem(REMEMBER_EMAIL_KEY);}catch(_error){}}};\n $('closeLeadDetail').onclick=()=>closeLeadDetails();\n $('leadDetailDialog').addEventListener('close',()=>{$('leadDetailContent').replaceChildren();rememberPage();});\n initTheme();")
replace_once("if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.activityLead)", "if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.leadDetail){openLeadDetails(b.dataset.leadDetail);return;}if(b.dataset.activityLead)")
replace_once("clearSession();recovery=false;}setMode('login');", "clearSession();setRecovery(false);}setMode('login');")
replace_once("sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK');", "sb=window.supabase.createClient('https://qzfprdhmcaucqcdqgqiz.supabase.co','sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});")
replace_once("const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}", "const params=new URLSearchParams(location.hash.slice(1));if(params.has('error')){setRecovery(false);setMode('reset');$('authMsg').textContent='El enlace de acceso venció o no es válido. Solicita uno nuevo.';history.replaceState(null,'',location.pathname);}\n if(typeof sb.auth.getSession==='function')sb.auth.getSession().then(({data,error})=>{if(!error)handleAuth('INITIAL_SESSION',data.session);}).catch(()=>{$('authMsg').textContent='No se pudo verificar la sesión. Recarga la página.';});")
helpers = r'''
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
 const tasks=(data.tasks||[]).filter(row=>row.lead_id===id);
 const field=(label,value)=>'<div class="lead-detail-row"><dt>'+esc(label)+'</dt><dd>'+esc(value||'Sin registrar')+'</dd></div>';
 $('leadDetailTitle').textContent=lead.title||'Solicitud comercial';
 $('leadDetailContent').innerHTML='<p class="muted">'+(dataSource==='demo'?'Demostración, sin datos reales.':'Registro real · vista de consulta, sin modificaciones automáticas.')+'</p><dl>'+field('Estado',enums.status[lead.status]||lead.status)+field('Institución',institution?.name||'Pendiente de vincular')+field('Contacto',contact?nameOf(contact):'Pendiente de vincular')+(contact?field('Correo',contact.email)+field('Teléfono',contact.phone):'')+field('Origen',lead.source)+field('Próxima acción',lead.next_action)+field('Fecha de seguimiento',date(lead.next_action_date))+'</dl><h3>Solicitud e interacciones registradas</h3>'+(activities.length?activities.map(row=>'<article class="lead-note"><h4>'+esc(row.subject||enums.activityType[row.type]||'Interacción')+'</h4><small>'+esc(date(row.occurred_at))+'</small><p>'+esc(row.notes||row.need_summary||'Sin notas adicionales')+'</p></article>').join(''):'<p class="muted">Todavía no hay interacciones vinculadas a este prospecto.</p>')+'<h3>Tareas vinculadas</h3>'+(tasks.length?tasks.map(row=>'<article class="lead-note"><strong>'+esc(row.title)+'</strong><p>'+esc(enums.taskStatus[row.status]||row.status)+' · '+esc(date(row.due_at))+'</p></article>').join(''):'<p class="muted">Sin tareas vinculadas.</p>');
 rememberPage(id);$('leadDetailDialog').showModal();
}
'''
replace_once("function init(){", helpers+"\nfunction init(){")
p.write_text(s)
p=root/'index.html';h=p.read_text()
def html_replace(old,new):
 global h
 assert h.count(old)==1, f'HTML anchor missing {old[:80]!r}'
 h=h.replace(old,new,1)
html_replace('<title>Xicronix | Inteligencia comercial</title>', '<meta name="robots" content="noindex,nofollow"><meta name="xicronix-release" content="2026-09-18-v2.1">\n<title>Xicronix V2 | Inteligencia comercial</title>')
html_replace('<link rel="stylesheet" href="analytics.css">','<link rel="stylesheet" href="analytics.css">\n<link rel="stylesheet" href="production.css?v=20260918-v2.1">')
html_replace('<script type="module" src="app.js"></script>','<script type="module" src="app.js?v=20260918-v2.1"></script>')
html_replace('<input id="email" type="email" autocomplete="username" required>', '<input id="email" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required>')
html_replace('<input id="password" type="password" autocomplete="current-password" required minlength="6">','<input id="password" name="password" type="password" autocomplete="current-password" required minlength="6">')
html_replace('<input id="confirmPassword" type="password" autocomplete="new-password" minlength="6">','<input id="confirmPassword" name="confirm-password" type="password" autocomplete="new-password" minlength="12">')
html_replace('  <button id="authBtn" class="primary wide">Ingresar</button>', '  <label id="rememberEmailLabel" class="remember-email"><input id="rememberEmail" type="checkbox">Recordar mi correo en este equipo personal</label>\n  <button id="authBtn" class="primary wide">Ingresar</button>')
html_replace('  <p class="auth-note">Una cuenta nueva necesita ser vinculada', '  <p id="recoveryHelp" class="auth-note" hidden>¿El correo te lleva a una pantalla de pruebas? <a href="recuperar.html">Recuperar acceso de forma alternativa</a>.</p>\n  <p class="auth-note">La sesión se conserva en este navegador. Guarda tu contraseña en su gestor; en equipos compartidos, cierra sesión al terminar.</p>\n  <p class="auth-note">Una cuenta nueva necesita ser vinculada')
html_replace('<div class="sidebar-bottom"><span id="userRole"></span><button id="logoutBtn">Cerrar sesión</button></div>', '<div class="sidebar-bottom"><small class="release-label">V2 · 18 SEP 2026</small><a id="complaintsLink" class="complaints-link" href="complaints.html" hidden>Libro de Reclamaciones</a><span id="userRole"></span><button id="logoutBtn">Cerrar sesión</button></div>')
html_replace('<noscript>', '<dialog id="leadDetailDialog" aria-labelledby="leadDetailTitle"><header class="dialog-header"><h2 id="leadDetailTitle">Solicitud comercial</h2><button id="closeLeadDetail" type="button" aria-label="Cerrar detalle">Cerrar</button></header><div id="leadDetailContent"></div></dialog>\n<noscript>')
p.write_text(h)
(root/'production.css').write_text('''/* Shared production integration; existing V2 styles remain the design base. */
.remember-email{display:flex;align-items:center;gap:10px;font-weight:400;font-size:.86rem;line-height:1.5;margin:14px 0}.remember-email input{width:18px;height:18px;flex:none;margin:0}.release-label{display:block;color:#a8bcd6;font-size:.68rem;letter-spacing:.1em;margin-bottom:12px}.complaints-link{display:block;color:#d7e6ff;padding:10px 0;font-size:.83rem;line-height:1.4}.sidebar-collapsed .complaints-link,.sidebar-collapsed .release-label{display:none}#leadDetailDialog{width:min(820px,calc(100% - 24px));max-height:90vh;overflow:auto}.lead-detail-row{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px;border-bottom:1px solid var(--line);padding:10px 0}.lead-detail-row dt{font-weight:700}.lead-detail-row dd{margin:0;overflow-wrap:anywhere}.lead-note{padding:14px 0;border-bottom:1px solid var(--line)}.lead-note h4{margin:0 0 6px}.lead-note p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.lead-note small{color:var(--muted)}#leadDetailTitle{overflow-wrap:anywhere}#recoveryHelp a{font-weight:700}a:focus-visible{outline:3px solid #ff8a1f;outline-offset:3px}.sidebar-bottom{flex-shrink:0}.sidebar nav{min-height:0;overflow-y:auto}.auth-card{max-width:100%}@media(max-width:700px){.sidebar-bottom{flex-wrap:wrap;gap:10px}.sidebar-bottom .release-label{margin:0}.sidebar nav{overflow-y:hidden}.lead-detail-row{grid-template-columns:1fr;gap:5px}#leadDetailDialog{padding:18px}.auth-card{padding:24px 18px}.header-actions{flex-wrap:wrap}}\n''')
p=root/'tests/app-workspace.test.mjs';t=p.read_text()
start=t.index("test('new ADMIN sees the complete demo by default")
end=t.index("test('demo save and import",start)
t=t[:start]+'''test('new ADMIN starts with actual records; demonstration is an explicit choice',async()=>{
 const h=harness('ADMIN',null,null);await h.boot();
 assert.equal(h.run('dataSource'),'live');
 assert.equal(h.run('data.leads.length'),2);
 assert.match(h.nodes.get('sourceBadge').textContent,/DATOS REALES/);
 assert.doesNotMatch(h.nodes.get('dashboard').innerHTML,/Valeria Torres|Camila Ríos/);
 assert.equal(h.queries.some(query=>query.table==='leads'),true);
 assert.equal(h.queries.some(query=>query.operation!=='select'),false);
 await h.click('sourceToggle');
 assert.equal(h.run('dataSource'),'demo');
 assert.equal(h.run('data.users.length'),5);assert.equal(h.run('data.leads.length'),40);
 assert.match(h.nodes.get('sourceBadge').textContent,/DEMOSTRACIÓN/);
});
'''+t[end:]
t += '''
test('production uses one canonical recovery destination and keeps original session namespace',()=>{
 const h=harness();
 assert.equal(h.run('authRedirectUrl()'),'https://xicronix-commercial-intelligence.vercel.app/');
 assert.match(html,/xicronix-release.*2026-09-18-v2.1/);
 assert.doesNotMatch(source,/git-improvemen-2952f5/);
 assert.doesNotMatch(html,/src=".*(?:auth-access|workspace-navigation)\\.js/);
});
test('original web request and tasks are readable without modifying a prospect',async()=>{
 const h=harness();h.db.activities[0].notes='<script>untrusted()</script> Solicitud de diagnóstico';
 h.db.tasks[0].lead_id='own-lead';await h.boot();
 h.run('navigate("leads");openLeadDetails("own-lead")');
 assert.equal(h.nodes.get('leadDetailDialog').open,true);
 assert.match(h.nodes.get('leadDetailContent').innerHTML,/Solicitud de diagnóstico/);
 assert.match(h.nodes.get('leadDetailContent').innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(h.nodes.get('leadDetailContent').innerHTML,/<script>/);
 assert.match(h.nodes.get('leadDetailContent').innerHTML,/Tarea propia/);
 assert.equal(h.queries.some(query=>query.operation!=='select'),false);
 h.run('closeLeadDetails()');assert.equal(h.nodes.get('leadDetailDialog').open,false);
});
test('seller cannot open another owner request details',async()=>{
 const h=harness('SALES');await h.boot();h.run('openLeadDetails("other-lead")');
 assert.equal(h.nodes.get('leadDetailDialog').open,false);
 assert.equal(h.nodes.get('complaintsLink').hidden,true);
});
test('complaints console is linked only for a real administrator workspace',async()=>{
 const h=harness();await h.boot();assert.equal(h.nodes.get('complaintsLink').hidden,false);
 await h.click('sourceToggle');assert.equal(h.nodes.get('complaintsLink').hidden,true);
 await h.click('sourceToggle');await h.click('sellerModeBtn');assert.equal(h.nodes.get('complaintsLink').hidden,true);
});
'''
t=t.replace('addEventListener(name,fn){this[name]=fn;}', 'addEventListener(name,fn){this._listeners??={};this._listeners[name]=fn;if(name!=="close")this[name]=fn;}')
t=t.replace('close(){this.open=false;}', 'close(){this.open=false;this._listeners?.close?.();}')
p.write_text(t)
print('Production integration applied; no records, roles, passwords or database policies changed.')
