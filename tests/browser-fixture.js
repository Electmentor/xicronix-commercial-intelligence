/* Browser test double only. No real accounts, tokens, customers or network requests. */
(()=>{
 const config=window.__testConfig||{};
 const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.invalid'};
 const org='22222222-2222-4222-8222-222222222222';
 const leadId='33333333-3333-4333-8333-333333333333';
 const base={organization_id:org,created_by:user.id,created_at:'2026-09-18T12:00:00Z',updated_at:'2026-09-18T12:00:00Z'};
 const row=(id,extra)=>({...base,id,...extra});
 let session=config.loggedOut?null:{user};let callback=()=>{};
 const db={
 profiles:config.unlinked?[]:[row(user.id,{full_name:'Dirección · PRUEBA AISLADA',role:config.role||'ADMIN'})],
 institutions:[row('inst-1',{name:'Institución de validación',type:'SCHOOL',city:'Lima',country:'Perú'})],
 contacts:[row('contact-1',{first_name:'Contacto',last_name:'de prueba',email:'contacto@example.invalid',institution_id:'inst-1',decision_level:'UNKNOWN'})],
 leads:[row(leadId,{title:'Institución de validación · Diagnóstico',source:'WEBSITE',status:'NEW',owner_user_id:user.id,institution_id:null,contact_id:null,next_action:'Coordinar reunión de diagnóstico',next_action_date:'2026-09-19T14:00:00Z',estimated_value:0}),row('demo-lead',{title:'[SIMULADO] Prueba histórica',status:'NEW',owner_user_id:user.id}),row('other-lead',{title:'Prospecto de otro vendedor',status:'NEW',owner_user_id:'someone-else',created_by:'someone-else'})],
 opportunities:[],tasks:[row('task-1',{lead_id:leadId,title:'Responder la solicitud de prueba',status:'PENDING',priority:'HIGH',assigned_to:user.id,due_at:'2026-09-19T14:00:00Z'})],
 activities:[row('activity-1',{lead_id:leadId,type:'NOTE',subject:'Solicitud recibida por la web',notes:'Solicitamos un diagnóstico del laboratorio.\n<em>Texto no confiable, no HTML</em>',occurred_at:'2026-09-18T12:00:00Z'})],
 scores:[row('score-1',{lead_id:leadId,total_score:25,recommendation:'Coordinar reunión',calculated_at:'2026-09-18T12:00:00Z'})],
 catalog_products:[row('product-1',{name:'Equipo de prueba',supplier_name:'Fabricante de prueba',supplier_sku:'TEST-001',category:'Fisica',currency:'USD',supplier_unit_price:100,origin_country:'Brasil',active:true})],
 cost_profiles:[],commercial_expenses:[],commercial_goals:[],complaints:[],complaint_events:[]
 };
 window.__testWrites=[];window.__testAuthCalls=[];window.__testDB=db;
 class Query{
  constructor(table){this.table=table;this.filters=[];this.op='select';}
  select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}order(){return this;}limit(){return this;}or(){this.mine=true;return this;}
  insert(v){this.op='insert';this.payload=v;return this;}update(v){this.op='update';this.payload=v;return this;}delete(){this.op='delete';return this;}
  result(single=false){
   if(config.failTable===this.table)return {data:null,error:{code:'NETWORK_ERROR'}};
   let rows=(db[this.table]||[]).filter(r=>this.filters.every(([k,v])=>r[k]===v));
   if(this.mine){const key=this.table==='tasks'?'assigned_to':'owner_user_id';rows=rows.filter(r=>r[key]===user.id||!r[key]&&r.created_by===user.id);}
   if(this.op!=='select')window.__testWrites.push({table:this.table,operation:this.op});
   return {data:single?(rows[0]||null):structuredClone(rows),error:null};
  }
  async maybeSingle(){return this.result(true);}async single(){return this.result(true);}async range(){return this.result();}
  then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
 }
 window.supabase={createClient(_url,_key,options){window.__testAuthOptions=options;return {
 from:table=>new Query(table),auth:{
 onAuthStateChange(fn){callback=fn;setTimeout(()=>fn(config.recovery?'PASSWORD_RECOVERY':'INITIAL_SESSION',session),0);return {data:{subscription:{unsubscribe(){}}}};},
 async getSession(){return {data:{session},error:null};},async getUser(){return {data:{user:session?.user||null},error:null};},
 async signInWithPassword(input){window.__testAuthCalls.push({action:'signIn',email:input.email});session={user};setTimeout(()=>callback('SIGNED_IN',session),0);return {data:{session,user},error:null};},
 async signUp(){return {data:{session:null},error:null};},
 async resetPasswordForEmail(email,opts){window.__testAuthCalls.push({action:'reset',email,redirectTo:opts.redirectTo});return {data:{},error:null};},
 async updateUser(){window.__testAuthCalls.push({action:'updatePassword'});return {data:{user},error:null};},
 async signOut(){session=null;setTimeout(()=>callback('SIGNED_OUT',null),0);return {error:null};}
 }};}};
})();
