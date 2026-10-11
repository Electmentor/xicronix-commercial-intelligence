/* Browser test double only. No real accounts, tokens, customers or network requests. */
(()=>{
 const config=window.__testConfig||{};if(new URLSearchParams(location.search).has('opportunity'))config.opportunity=true;
 const originalFetch=window.fetch.bind(window);
 window.fetch=async(url,options)=>{
  if(url!=='/api/assistant')return originalFetch(url,options);
  const body=JSON.parse(options.body);await new Promise(resolve=>setTimeout(resolve,500));
  if(body.message==='SIMULAR ERROR')return Response.json({error:'PROVIDER_ERROR'},{status:502});
  if(config.opportunity){
   const {loadOpportunity,opportunityReply}=await import('/assistant-opportunity.mjs');
   const auth={id:user.id,organization_id:org,role:'ADMIN'};
   const active=await loadOpportunity(body,auth,'Bearer synthetic',{base:'https://fixture.invalid',key:'synthetic',fetcher:async url=>{const u=new URL(url),table=u.pathname.split('/').at(-1);return Response.json((db[table]||[]).filter(r=>[...u.searchParams].every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):v==='is.null'?r[k]==null:true)));}});
   if(active)return Response.json(opportunityReply(active,body.message,auth));
  }
  const {buildEvidence,queryIntent,renderEvidence}=await import('/assistant-policy.mjs');
  const evidence=buildEvidence({records:{radar:db.commercial_radar_dashboard,tasks:db.tasks,opportunities:db.opportunities,leads:db.leads,meetings:db.meetings},page:body.context.page,role:'ADMIN',source:'demo',intent:queryIntent(body.message),focus:body.context.focus});
  const plan={evidence_ids:evidence.facts.slice(0,3).map(f=>f.id),recommendation_ids:evidence.recommendations.slice(0,1).map(f=>f.id),insufficient:!evidence.facts.length};
  return Response.json({answer:'PRUEBA AISLADA — '+renderEvidence(evidence,plan),focus:evidence.focus});
 };
 const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.invalid'};
 const org='22222222-2222-4222-8222-222222222222';
 const leadId='33333333-3333-4333-8333-333333333333';
 const base={organization_id:org,created_by:user.id,created_at:'2026-09-18T12:00:00Z',updated_at:'2026-09-18T12:00:00Z'};
 const row=(id,extra)=>({...base,id,...extra});
 let session=config.loggedOut?null:{user,access_token:'isolated-test-token'};let callback=()=>{};
 const db={
 profiles:config.unlinked?[]:[row(user.id,{full_name:'Dirección · PRUEBA AISLADA',role:config.role||'ADMIN'})],
 institutions:[row('inst-1',{name:'Institución de validación',type:'SCHOOL',city:'Lima',country:'Perú'})],
 contacts:[row('contact-1',{first_name:'Contacto',last_name:'de prueba',email:'contacto@example.invalid',institution_id:'inst-1',decision_level:'UNKNOWN'})],
 leads:[row(leadId,{title:'Institución de validación · Diagnóstico',source:'WEBSITE',status:'NEW',owner_user_id:user.id,institution_id:'inst-1',contact_id:'contact-1',next_action:'Coordinar reunión de diagnóstico',next_action_date:'2026-09-19T14:00:00Z',estimated_value:0,commercial_milestone:'M1',maturity_percent:15,milestone_updated_at:'2026-09-18T12:00:00Z'}),row('demo-lead',{title:'[SIMULADO] Prueba histórica',status:'NEW',owner_user_id:user.id}),row('other-lead',{title:'Prospecto de otro vendedor',status:'NEW',owner_user_id:'someone-else',created_by:'someone-else'})],
 opportunities:config.opportunity?[row('44444444-4444-4444-8444-444444444444',{name:'Laboratorio de validación',stage:'NEGOTIATION',institution_id:'inst-1',contact_id:'contact-1',lead_id:leadId,owner_user_id:user.id,value:25000,probability:40,next_action:'Validar alcance'})]:[],
 commercial_radar_dashboard:[row('radar-1',{institution_id:'inst-1',lead_id:leadId,institution_name:'Colegio Radar de prueba',city:'Lima',region:'Lima',lab_status:'PLANNED',estimated_value:200000,budget_status:'PROBABLE',signal_date:'2026-09-22',decision_maker_name:'Directora de prueba',decision_maker_title:'Directora',contact_email:'directora@example.invalid',contact_phone:'987654321',contact_whatsapp:'987654321',signal_summary:'Proyecto de laboratorio en evaluación.',next_action:'Validar alcance del proyecto.',principal_risk:'Presupuesto por confirmar.',weighted_score:82,classification:'HIGH',classification_priority:2,geographic_priority:1,source_url:'https://example.invalid/evidence'})],
 commercial_mail_inbox:[row('mail-1',{provider:'ZOHO_MAIL',provider_message_id:'msg-1',sender_name:'Karen Rondón',from_address:'krondon@example.invalid',to_address:'info@xicronix.com',subject:'Diagnóstico del laboratorio',received_at:'2026-09-22T15:00:00Z',classification:'COMMERCIAL',priority:'HIGH',status:'NEW',lead_id:leadId})],
 commercial_mail_webhook_config:[],
 tasks:[row('task-1',{lead_id:leadId,title:'Responder la solicitud de prueba',status:'PENDING',priority:'HIGH',assigned_to:user.id,due_at:'2026-09-19T14:00:00Z'})],
 meetings:[],deliverables:[],documents:[],document_versions:[],
 activities:[row('activity-1',{lead_id:leadId,type:'NOTE',subject:'Solicitud recibida por la web',notes:'Solicitamos un diagnóstico del laboratorio.\n<em>Texto no confiable, no HTML</em>',occurred_at:'2026-09-18T12:00:00Z'})],
 scores:[row('score-1',{lead_id:leadId,total_score:25,recommendation:'Coordinar reunión',calculated_at:'2026-09-18T12:00:00Z'})],
 catalog_products:[row('product-1',{name:'Equipo de prueba',supplier_name:'Fabricante de prueba',supplier_sku:'TEST-001',category:'Fisica',currency:'USD',supplier_unit_price:100,origin_country:'Brasil',active:true})],
 cost_profiles:[],commercial_expenses:[],commercial_goals:[],complaints:[],complaint_events:[]
 };
 window.__testWrites=[];window.__testAuthCalls=[];window.__testStorage=[];window.__testDB=db;
 class Query{
  constructor(table){this.table=table;this.filters=[];this.op='select';}
  select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}order(){return this;}limit(){return this;}or(){this.mine=true;return this;}
  insert(v){this.op='insert';this.payload=v;return this;}update(v){this.op='update';this.payload=v;return this;}delete(){this.op='delete';return this;}
  result(single=false){
   if(config.failTable===this.table)return {data:null,error:{code:'NETWORK_ERROR'}};
   let rows=(db[this.table]||[]).filter(r=>this.filters.every(([k,v])=>r[k]===v));
   if(this.mine){const key=this.table==='tasks'?'assigned_to':'owner_user_id';rows=rows.filter(r=>r[key]===user.id||!r[key]&&r.created_by===user.id);}
   if(this.op!=='select')window.__testWrites.push({table:this.table,operation:this.op});
   if(this.op==='insert'){const inserted={...structuredClone(this.payload),id:'fixture-'+Date.now(),created_at:new Date().toISOString()};(db[this.table]||=[]).push(inserted);rows=[inserted];}
   if(this.op==='update')rows.forEach(row=>Object.assign(row,structuredClone(this.payload)));
   return {data:single?(rows[0]||null):structuredClone(rows),error:null};
  }
  async maybeSingle(){return this.result(true);}async single(){return this.result(true);}async range(){return this.result();}
  then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
 }
 window.supabase={createClient(_url,_key,options){window.__testAuthOptions=options;return {
 from:table=>new Query(table),
 storage:{from:bucket=>({
  async upload(path,file){window.__testStorage.push({action:'upload',bucket,path,name:file?.name,size:file?.size});return {data:{path},error:null};},
  async remove(paths){window.__testStorage.push({action:'remove',bucket,paths});return {data:paths,error:null};},
  async createSignedUrl(path){return {data:{signedUrl:'https://storage.example.invalid/'+encodeURIComponent(path)},error:null};}
 })},
 async rpc(name,args){
  if(name==='crm_transition_radar_signal'){
   const signal=db.commercial_radar_dashboard.find(r=>r.id===args.p_signal_id);
   if(!signal||!['ADMIN','MANAGER','SALES'].includes(config.role||'ADMIN'))return {data:null,error:{message:'NOT_AUTHORIZED'}};
   if((signal.workflow_status||'DETECTED')!==args.p_expected_status||(signal.updated_at||null)!==args.p_expected_updated_at)return {data:null,error:{message:'STALE_RADAR_SIGNAL'}};
   if(['RESOLVED','DISCARDED'].includes(signal.workflow_status))return {data:null,error:{message:'INVALID_TRANSITION'}};
   if(['RESOLVED','DISCARDED'].includes(args.p_status)&&!args.p_reason?.trim())return {data:null,error:{message:'REASON_REQUIRED'}};
   const stamp=new Date().toISOString(),event={from:signal.workflow_status||'DETECTED',to:args.p_status,at:stamp,actor_id:user.id,reason:args.p_reason};
   signal.workflow_status=args.p_status;signal.updated_at=stamp;if(['RESOLVED','DISCARDED'].includes(args.p_status))signal.actionable=false;
   (db.commercial_radar_evidence||=[]).push(row('evidence-'+Date.now(),{signal_id:signal.id,evidence_type:'WORKFLOW_TRANSITION',excerpt:JSON.stringify(event),observed_at:stamp}));
   return {data:{signal_id:signal.id,workflow_status:signal.workflow_status,updated_at:stamp,event},error:null};
  }
  if(name!=='crm_register_document_version')return {data:null,error:{code:'UNKNOWN_RPC'}};
  const doc=db.documents.find(row=>row.id===args.p_document_id);if(!doc)return {data:null,error:{code:'PGRST116'}};
  db.document_versions.filter(row=>row.document_id===doc.id&&row.is_current).forEach(row=>{row.is_current=false;if(row.status==='DRAFT')row.status='REPLACED';});
  const version=(db.document_versions.filter(row=>row.document_id===doc.id).reduce((m,row)=>Math.max(m,row.version_number||0),0)+1);
  const v=row('version-'+(db.document_versions.length+1),{document_id:doc.id,lead_id:doc.lead_id,version_number:version,is_current:true,status:args.p_status,storage_path:args.p_storage_path,file_name:args.p_file_name,mime_type:args.p_mime_type,size_bytes:args.p_size_bytes,uploaded_by:user.id});
  db.document_versions.push(v);doc.current_version=version;doc.status=args.p_status;doc.updated_at=new Date().toISOString();return {data:v,error:null};
 },
 auth:{
 onAuthStateChange(fn){callback=fn;setTimeout(()=>fn(config.recovery?'PASSWORD_RECOVERY':'INITIAL_SESSION',session),0);return {data:{subscription:{unsubscribe(){}}}};},
 async getSession(){return {data:{session},error:null};},async getUser(){return {data:{user:session?.user||null},error:null};},
 async signInWithPassword(input){window.__testAuthCalls.push({action:'signIn',email:input.email});session={user,access_token:'isolated-test-token'};setTimeout(()=>callback('SIGNED_IN',session),0);return {data:{session,user},error:null};},
 async signUp(){return {data:{session:null},error:null};},
 async resetPasswordForEmail(email,opts){window.__testAuthCalls.push({action:'reset',email,redirectTo:opts.redirectTo});return {data:{},error:null};},
 async updateUser(){window.__testAuthCalls.push({action:'updatePassword'});return {data:{user},error:null};},
 async signOut(){session=null;setTimeout(()=>callback('SIGNED_OUT',null),0);return {error:null};}
 }};}};
})();

/* Append to browser-fixture.js. Synthetic, isolated data and function responses only. */
(()=>{
 const config=window.__testConfig||{},db=window.__testDB,query=new URLSearchParams(location.search);
 const scenario=config.scenario||query.get('scenario')||'web';
 const user='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
 const ids={lead:'33333333-3333-4333-8333-333333333333',closed:'33333333-3333-4333-8333-333333333334',noEmail:'33333333-3333-4333-8333-333333333335',other:'33333333-3333-4333-8333-333333333336',document:'55555555-5555-4555-8555-555555555551',document2:'55555555-5555-4555-8555-555555555552'};
 const row=(id,extra)=>({id,organization_id:org,created_by:user,created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z',...extra});
 db.profiles[0].full_name='Responsable sintético';
 db.institutions=[row('inst-1',{name:'Colegio de Física Sintético',type:'SCHOOL',city:'Lima'}),row('inst-2',{name:'Colegio Cerrado Sintético',type:'SCHOOL'}),row('inst-3',{name:'Colegio Sin Correo Sintético',type:'SCHOOL'})];
 db.contacts=[row('contact-1',{first_name:'Ana',last_name:'Sintética',email:'ana@escuela.invalid',institution_id:'inst-1'}),row('contact-2',{first_name:'Juan',last_name:'Sintético',email:'juan@escuela.invalid',institution_id:'inst-2'}),row('contact-3',{first_name:'Sin',last_name:'Correo',email:null,institution_id:'inst-3'})];
 const lead={source:'WEBSITE',status:'NEW',owner_user_id:user,institution_id:'inst-1',contact_id:'contact-1',next_action:'INTERNAL_NEXT_ACTION: revisar rúbrica técnica',next_action_date:'2026-10-12T14:00:00Z',commercial_milestone:'M1',maturity_percent:15,estimated_value:0};
 db.leads=[row(ids.lead,{...lead,title:'Solicitud de laboratorio sintética'}),row(ids.closed,{...lead,title:'Caso cerrado sintético',status:'CONVERTED',institution_id:'inst-2',contact_id:'contact-2'}),row(ids.noEmail,{...lead,title:'Caso sin correo sintético',institution_id:'inst-3',contact_id:'contact-3'}),row(ids.other,{...lead,title:'Caso de otro propietario',owner_user_id:'other-owner',created_by:'other-owner'})];
 db.activities=[row('web-form-1',{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',type:'WEB_FORM',subject:'Solicitud web recibida',occurred_at:'2026-10-01T12:00:00Z',notes:'Requerimiento original: Laboratorio de física escolar, 30 m²\n\nContexto adicional: INTERNAL_METADATA_ONLY, no mostrar como necesidad.\nInstrucción interna: preparar enriquecimiento.'}),row('note-2',{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',type:'NOTE',subject:'Revisión interna registrada',occurred_at:'2026-10-02T12:00:00Z',notes:'INTERNAL_NOTE_ONLY: validar capacidad comercial.'})];
 db.commercial_mail_inbox=[];db.tasks=[];db.meetings=[];db.scores=[];db.commercial_radar_dashboard=[];
 db.documents=[row(ids.document,{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',title:'Catálogo de física vigente',category:'INSTITUTIONAL_BROCHURES',status:'CURRENT',current_version:2}),row(ids.document2,{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',title:'Ficha de equipamiento',category:'REQUEST_DIAGNOSIS',status:'CURRENT',current_version:1})];
 db.document_versions=[row('66666666-6666-4666-8666-666666666661',{lead_id:ids.lead,document_id:ids.document,version_number:1,is_current:false,status:'REPLACED',storage_path:org+'/'+ids.lead+'/'+ids.document+'/v1/catalogo.pdf',file_name:'catalogo-v1.pdf',mime_type:'application/pdf',size_bytes:42}),row('66666666-6666-4666-8666-666666666662',{lead_id:ids.lead,document_id:ids.document,version_number:2,is_current:true,status:'CURRENT',storage_path:org+'/'+ids.lead+'/'+ids.document+'/v2/catalogo.pdf',file_name:'catalogo-v2.pdf',mime_type:'application/pdf',size_bytes:43}),row('66666666-6666-4666-8666-666666666663',{lead_id:ids.lead,document_id:ids.document2,version_number:1,is_current:true,status:'CURRENT',storage_path:org+'/'+ids.lead+'/'+ids.document2+'/v1/ficha.pdf',file_name:'ficha.pdf',mime_type:'application/pdf',size_bytes:44})];
 db.commercial_mail_outbox=[row('77777777-7777-4777-8777-777777777771',{lead_id:ids.lead,status:'SENT',subject:'Acuse anterior sintético',body:'Acuse anterior conservado en historial.',to_address:'ana@escuela.invalid',provider_message_id:'fixture-old-provider',delivery_status:'UNCONFIRMED',sent_at:'2026-10-02T13:00:00Z'})];
 if(scenario==='context'){
  const message="Estimado equipo Xicronix: Muchas gracias por su comprensión y por mantenerse atentos a nuestra coordinación. Lamentamos haber dilatado un poco este proceso debido a las coordinaciones internas que hemos venido realizando. Les comento que el día miércoles me han otorgado un espacio de 15 minutos para exponer la necesidad identificada y presentar la propuesta. De acuerdo con lo que se determine en dicha reunión, podremos coordinar posteriormente una nueva reunión con ustedes y definir los siguientes pasos. Agradezco mucho su paciencia y comprensión durante este proceso, seguimos en contacto. Muchas gracias por su disposición y por mantenerse atentos. Atentamente, Mg. Persona Sintética Colegio Fixture";
  db.contacts[0].first_name='Alex';db.contacts[0].email='alex@example.invalid';
  db.leads[0].commercial_maturity_pct=85;db.leads[0].next_action='Iniciar diagnóstico y solicitar otra reunión';
  db.activities[0].occurred_at='2026-09-20T12:00:00Z';db.activities[0].created_at='2026-09-20T12:00:00Z';
  db.activities[1].occurred_at='2026-09-21T12:00:00Z';
  db.commercial_mail_outbox[0].sent_at='2026-09-25T13:00:00Z';db.commercial_mail_outbox[0].to_address='alex@example.invalid';
  db.commercial_mail_inbox=[row('88888888-8888-4888-8888-888888888881',{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',provider:'ZOHO_MAIL',provider_message_id:'fixture-context-message',provider_folder_id:'fixture-inbox',sender_name:'Alex Sintético',from_address:'alex@example.invalid',to_address:'info@xicronix.com',subject:'Coordinación de propuesta',body_text:message,summary:message,received_at:'2026-09-28T11:24:00-05:00',created_at:'2026-09-28T16:24:00Z',updated_at:'2026-09-28T16:24:00Z',direction:'IN',classification:'COMMERCIAL',priority:'HIGH',status:'NEW'})];
 }
 if(query.get('latest')==='web'){
  db.activities.unshift(row('web-latest-qa',{lead_id:ids.lead,institution_id:'inst-1',contact_id:'contact-1',type:'WEB_FORM',subject:'Solicitud desde el chat Nexa',occurred_at:'2026-10-10T15:00:00Z',notes:'Requerimiento original: Queremos revisar una propuesta actualizada para el laboratorio.\nContexto adicional: INTERNAL_ONLY_NOT_FOR_WHATSAPP'}));
 }
 const test=window.__caseTest={ids,scenario,calls:[],control:{outcomeMode:config.outcomeMode||query.get('result')||'success',capabilities:config.capabilities||{contract_version:3,attachments:true,idempotency:true},responses:config.responses||[],delay:config.functionDelay||0}};
 // Test-only handoff interception: no WhatsApp or external window can open.
 test.handoffs=[];
 window.open=(url,target,features)=>{
  test.handoffs.push({url:String(url),target,features});
  let result=document.getElementById('fixtureHandoffResult');
  if(!result){result=document.createElement('p');result.id='fixtureHandoffResult';result.setAttribute('role','status');(document.getElementById('caseWhatsappDialog')||document.body).append(result);}
  result.textContent='APERTURA INTERCEPTADA; NO ENVIADO. '+String(url);
  return null;
 };
 function simulatedResult(){
  const modes={
   success:{ok:true,status:'SENT',provider_message_id:'fixture-provider-accepted',delivery_status:'UNCONFIRMED'},
   network:{throw:'Synthetic network failure'},
   rejected:{errorResponse:{error:'provider_rejected',status:'FAILED',retry_allowed:true}},
   unknown:{ok:false,status:'UNKNOWN',requires_review:true,retry_allowed:false},
   accepted_pending:{ok:false,error:'accepted_record_pending',status:'UNKNOWN',provider_status:'ACCEPTED',provider_message_id:'fixture-provider-pending',outbox_id:'77777777-7777-4777-8777-777777777772',requires_review:true,retry_allowed:false},
   missing_provider:{ok:true,status:'SENT',delivery_status:'UNCONFIRMED'}
  };
  return structuredClone(modes[test.control.outcomeMode]||modes.success);
 }
 let updatePanel=()=>{};
 const createClient=window.supabase.createClient;
 window.supabase.createClient=function(...args){const client=createClient(...args);client.functions={async invoke(name,options){
  const body=structuredClone(options?.body||{});test.calls.push({name,method:options?.method||'POST',body});updatePanel();
  if(test.control.delay)await new Promise(resolve=>setTimeout(resolve,test.control.delay));
  if(body.action==='capabilities')return {data:structuredClone(test.control.capabilities),error:null};
  const next=test.control.responses.shift()||simulatedResult();
  if(next.throw)throw new Error(next.throw);
  if(next.errorResponse)return {data:null,error:{message:'Synthetic function error',context:{async json(){return structuredClone(next.errorResponse);}}}};
  if(next.ok&&next.status==='SENT'&&next.provider_message_id&&next.delivery_status==='UNCONFIRMED'){
   db.commercial_mail_outbox.push(row('fixture-send-'+test.calls.length,{...body,to_address:body.to,status:'SENT',provider_message_id:next.provider_message_id,delivery_status:next.delivery_status,sent_at:new Date().toISOString()}));
  }
  return {data:structuredClone(next),error:null};
 }};return client;};
 // Optional test-only controls, absent from normal fixture/browser regressions.
 if(config.qaPanel||query.get('qa')==='1'){
  const installPanel=()=>{
   const panel=document.createElement('details');panel.id='fixtureQaPanel';panel.dataset.testOnly='true';
   panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:340px;max-height:50vh;overflow:auto;padding:8px 12px;border:1px solid #607a98;border-radius:10px;background:#f4f7fb;color:#10243a;font:12px/1.4 sans-serif;box-shadow:0 3px 14px #0003';
   panel.innerHTML='<summary style="cursor:pointer;font-weight:700">QA sintética · sin envío real</summary><p>Escenario: <strong data-fixture-scenario></strong>. Todos los resultados son simulados en memoria.</p><label>Próximo resultado <select aria-label="Resultado sintético" data-fixture-result><option value="success">Éxito · entrega sin confirmar</option><option value="network">Error de red</option><option value="rejected">Rechazo confirmado</option><option value="unknown">Resultado desconocido</option><option value="accepted_pending">Aceptado · registro pendiente</option><option value="missing_provider">SENT sin ID del proveedor</option></select></label><label style="display:block;margin-top:8px"><input type="checkbox" data-fixture-contract checked> Contrato v3 disponible</label><p data-fixture-summary aria-live="polite"></p><pre data-fixture-last style="white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.3 monospace"></pre><small>Para una prueba limpia, recarga. No se altera el borrador ni su clave al cambiar la simulación.</small>';
   panel.querySelector('[data-fixture-scenario]').textContent=scenario;
   const result=panel.querySelector('[data-fixture-result]');result.value=test.control.outcomeMode;
   result.addEventListener('change',()=>{test.control.outcomeMode=result.value;updatePanel();});
   panel.querySelector('[data-fixture-contract]').addEventListener('change',event=>{test.control.capabilities={contract_version:event.target.checked?3:2,attachments:true,idempotency:true};updatePanel();});
   updatePanel=()=>{
    const sends=test.calls.filter(call=>call.body.action!=='capabilities'),last=sends.at(-1)?.body;
    panel.querySelector('[data-fixture-summary]').textContent='Capabilities: '+(test.calls.length-sends.length)+' · Intentos simulados: '+sends.length;
    panel.querySelector('[data-fixture-last]').textContent=last?JSON.stringify({idempotency_key:last.idempotency_key,document_ids:last.document_ids},null,2):'Sin llamadas de envío.';
   };
   const relocate=()=>{const host=document.getElementById('smartMailDialog')?.open?document.getElementById('smartMailDialog'):document.getElementById('leadDetailDialog')?.open?document.getElementById('leadDetailDialog'):document.body;if(panel.parentNode!==host)host.append(panel);};
   relocate();updatePanel();
   for(const id of ['smartMailDialog','leadDetailDialog']){const dialog=document.getElementById(id);if(dialog)new MutationObserver(relocate).observe(dialog,{attributes:true,attributeFilter:['open']});}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPanel,{once:true});else installPanel();
 }
})();
