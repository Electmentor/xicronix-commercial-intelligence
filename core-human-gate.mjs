// Core remains the authority. This screen only uses its existing authenticated RPCs.
const DEV_HOST = 'xicronix-commercial-intelligence-git-dev-xicronix.vercel.app';
const PROJECT = 'https://yeslipuoriweapauwgog.supabase.co';
const ORG = 'a5c10048-d343-4f79-8c77-f230b0bd3fcb';
const TARGET = '9ddc3577-cc50-4b87-99c8-84dd1c11fff4';
const $ = id => document.getElementById(id);
const show = (id, value) => { $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
const renderJSON = value => JSON.stringify(value, null, 2);
let s, evo = null, factor = null, busy = false, draftEvidence = null;
const buttons = ['login','logout','check','enroll','verify','load','approve','probe','learn'];
function controls() {
  buttons.forEach(id => { $(id).disabled = busy || !s; });
  $('approve').disabled = busy || evo?.status !== 'awaiting_approval';
  $('probe').disabled = busy || evo?.status !== 'approved_dev';
  const canLearn = evo?.status === 'awaiting_learning_approval' && evo.evaluation_passed === true && !!evo.evidence_hash;
  $('learn').disabled = busy || !canLearn;
  $('knowledge').disabled = busy || !canLearn;
  $('confidence').disabled = busy || !canLearn;
}
async function rpc(name, args) {
  const {data,error} = await s.rpc(name,args);
  if(error) throw new Error(error.message);
  return data;
}
async function auth() {
  const {data,error} = await s.auth.getUser();
  if(error || !data?.user) { show('auth','Sin sesión verificada.'); show('gate','Inicia sesión para consultar tu autorización en el servidor.'); return false; }
  const a = await s.auth.mfa.getAuthenticatorAssuranceLevel();
  if(a.error) throw a.error;
  show('auth',data.user.email+' · '+a.data.currentLevel);
  await inspectGate();
  return true;
}
async function inspectGate() {
  const gate=await rpc('core_human_gate_status',{p_org:ORG});
  show('gate',{
    identidad_autenticada:gate.user_present && gate.authenticated_claim,
    administrador_activo:gate.active_admin_membership,
    sesion_vigente:gate.live_session,
    autenticacion_AAL2:gate.aal2,
    autorizado_por_backend:gate.ready
  });
  return gate;
}
async function requireReady() {
  const gate = await inspectGate();
  if(!gate.ready) throw new Error('Falta una sesión administradora activa con MFA/AAL2. Inicia sesión y verifica el código de tu autenticador.');
}
function learningDraft(q) {
  return renderJSON({
    classification:'CONCLUSIÓN PROVISIONAL',
    origin:'Xicronix Radar → A001 → experimento autorizado en Core DEV',
    recorded_context_at:new Date().toISOString(),
    event_problem:q.new_evidence,
    hypothesis:q.hypothesis,
    expected:q.success_criteria,
    observed:q.evaluation_checks,
    interpretation:'Los controles del contrato pasaron en esta ejecución. La evidencia respalda la hipótesis dentro del alcance comprobado.',
    conclusion:'El contrato privado de los tres registros adaptativos satisface los controles evaluados en DEV en esta ejecución.',
    conditions:['Solo xicronix-core-dev','Mismas tablas, permisos, funciones y baseline del experimento','Evidencia original vigente'],
    exceptions:['No certifica producción','No es auditoría exhaustiva del sistema','No demuestra ausencia de vulnerabilidades no cubiertas por estos controles'],
    derived_decision:'Conservar la arquitectura actual; reutilizar esta verificación antes de cambios relevantes. No modificar políticas ni producción.',
    review_policy:'Revisar o retirar ante evidencia contradictoria o cambios del contrato; utilizar el mecanismo de reversión existente.',
    affected_component:q.affected_component,
    trace:{evolution_id:q.id,proposal_hash:q.proposal_hash,baseline_hash:q.baseline_hash,evidence_id:q.evidence_id,evidence_hash:q.evidence_hash,evaluation_id:q.evaluation_id,execution_id:q.execution_id},
    actor:'El servidor registra el usuario autenticado, la aprobación y su sesión MFA en el ledger.'
  });
}
async function load() {
  await requireReady();
  const data = await rpc('core_human_gate_list',{p_limit:100});
  evo = (data.adaptive_queue||[]).find(q => q.id === TARGET) || null;
  if(!evo) throw new Error('La propuesta seleccionada no aparece en el listado autorizado. No se seleccionará otra automáticamente.');
  show('item',evo.affected_component+' · '+evo.status+' · '+evo.id);
  show('proposal',{hypothesis:evo.hypothesis,before:evo.current_system_state,change:evo.proposed_change,expected:evo.success_criteria,failure:evo.failure_criteria,risk:evo.risk,rollback:evo.rollback_plan,proposal_hash:evo.proposal_hash});
  if(evo.evaluation_id) show('result',{expected:evo.success_criteria,actual:evo.evaluation_checks,passed:evo.evaluation_passed,evidence_id:evo.evidence_id,evidence_hash:evo.evidence_hash});
  if(evo.approval_receipt && evo.status!=='learned') show('receipt',evo.approval_receipt);
  if(evo.status === 'awaiting_learning_approval' && evo.evaluation_passed === true && draftEvidence !== evo.evidence_hash) {
    $('knowledge').value = learningDraft(evo); draftEvidence = evo.evidence_hash;
  }
  if(evo.status === 'learned') show('status','Aprendizaje registrado. Falta la regresión final y su verificación por Work.');
  else if(evo.status === 'awaiting_learning_approval') show('status',evo.evaluation_passed ? 'Experimento verificado. Revisa el aprendizaje antes de aprobarlo.' : 'El experimento no pasó. No se propondrá un aprendizaje favorable.');
  else show('status','Identidad verificada. Estado: '+evo.status);
}
async function runProbe() {
  await requireReady();
  if(evo?.id !== TARGET || evo.status !== 'approved_dev') throw new Error('El experimento requiere aprobación vigente.');
  const data = await rpc('core_human_gate_run_probe',{p_evolution:TARGET});
  show('result',data); await load();
}
function bind(id, action) {
  $(id).onclick = async () => {
    if(busy) return;
    busy = true; controls();
    try { await action(); }
    catch(error) { show('status',error.message || 'No se pudo completar la operación.'); }
    finally { busy = false; controls(); }
  };
}
async function start() {
  // Prevent an accidental merge from activating this portal on production.
  if(location.hostname !== DEV_HOST) throw new Error('Este portal solo funciona en la dirección DEV autorizada.');
  if(!window.supabase?.createClient) throw new Error('No se pudo cargar la biblioteca de autenticación. Recarga la página.');
  s = window.supabase.createClient(PROJECT,'sb_publishable_OtpAmkZbyVRBYoM9it035A_LNPT0o9_',{
    auth:{storageKey:'xicronix-core-dev-human-gate-v2',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  bind('login',async()=>{
    const password = $('password').value;
    const {error} = await s.auth.signInWithPassword({email:$('email').value.trim(),password});
    $('password').value=''; if(error) throw error;
    evo=null; await auth(); show('status','Sesión iniciada. Comprueba o configura el autenticador.');
  });
  bind('logout',async()=>{
    const {error}=await s.auth.signOut({scope:'local'}); if(error) throw error;
    evo=null;factor=null;draftEvidence=null;$('qr').replaceChildren();$('code').value='';$('knowledge').value='';
    ['item','proposal','result','receipt'].forEach(id=>show(id,''));await auth();show('status','Sesión cerrada.');
  });
  bind('check',async()=>{
    if(!await auth()) throw new Error('Inicia sesión primero.');
    const {data,error}=await s.auth.mfa.listFactors();if(error) throw error;
    factor=data.totp.find(f=>f.status==='verified')?.id||null;
    show('mfa',factor?'Autenticador configurado. Introduce su código actual.':'Aún no hay autenticador verificado. Pulsa Configurar autenticador.');
  });
  bind('enroll',async()=>{
    if(!await auth()) throw new Error('Inicia sesión primero.');
    if(factor) throw new Error('Ya hay un factor seleccionado. Verifica su código antes de crear otro.');
    const existing=await s.auth.mfa.listFactors(); if(existing.error) throw existing.error;
    const verified=existing.data.totp.find(f=>f.status==='verified');
    if(verified){factor=verified.id;show('mfa','Ya tienes un autenticador. Introduce su código actual.');return;}
    const {data,error}=await s.auth.mfa.enroll({factorType:'totp',friendlyName:'Xicronix Core '+new Date().toISOString()});
    if(error) throw error;factor=data.id;
    const img=document.createElement('img');img.alt='Código QR para configurar tu autenticador';img.src=data.totp.qr_code;
    $('qr').replaceChildren(img);show('mfa','Escanea el QR con tu autenticador y escribe su código. No compartas el QR.');
  });
  bind('verify',async()=>{
    if(!factor) throw new Error('Comprueba o configura primero tu autenticador.');
    if(!/^\d{6}$/.test($('code').value.trim())) throw new Error('Introduce los seis dígitos del autenticador.');
    const {error}=await s.auth.mfa.challengeAndVerify({factorId:factor,code:$('code').value.trim()});
    $('code').value='';if(error) throw error;
    $('qr').replaceChildren();show('mfa','MFA verificado.');await auth();await load();
  });
  bind('load',load);
  bind('approve',async()=>{
    await requireReady();await load();
    if(evo?.status!=='awaiting_approval') throw new Error('La propuesta ya cambió de estado. Revisa el estado actualizado.');
    const approval=await rpc('core_adaptive_decide_experiment',{p_evolution:TARGET,p_expected_hash:evo.proposal_hash,p_approve:true,p_relation:'confirms',p_reason:'Autorizo schema_contract_readonly_v1 sobre los tres registros adaptativos, solo DEV, sin efectos externos ni cambios de permisos. Contexto: primer ciclo institucional; autenticación exigida: admin activo con sesión real MFA/AAL2.'});
    show('receipt',{experiment_approval_id:approval});await load();await runProbe();
  });
  bind('probe',async()=>{await load();await runProbe();});
  bind('learn',async()=>{
    await requireReady();await load();
    if(evo?.status!=='awaiting_learning_approval'||evo.evaluation_passed!==true||!evo.evidence_hash) throw new Error('Falta evidencia favorable verificada.');
    const confidence=Number($('confidence').value);
    if(!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('La confianza debe estar entre 0 y 1.');
    const id=await rpc('core_adaptive_accept_learning',{p_evolution:TARGET,p_evidence_hash:evo.evidence_hash,p_knowledge:$('knowledge').value,p_confidence:confidence,p_reason:'Apruebo esta conclusión provisional limitada al contrato observado en DEV, vinculada a la evidencia mostrada y sujeta a revisión futura; no es una regla universal.'});
    show('receipt',{learning_id:id,table:'core.core_learning_ledger',status:'Registrado; pendiente regresión final'});await load();
  });
  if(await auth()) {
    const gate=await rpc('core_human_gate_status',{p_org:ORG});
    if(gate.ready) await load(); else show('status','Completa la verificación del autenticador.');
  } else show('status','Inicia sesión con tu cuenta de Core DEV.');
}
start().catch(error=>show('status',error.message)).finally(controls);
