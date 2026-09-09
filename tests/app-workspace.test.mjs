// Runtime integration tests with an isolated DOM/Data API double; no real accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as domain from '../domain.mjs';
import * as workspace from '../workspace.mjs';
import * as demo from '../demo.mjs';
import * as executive from '../executive.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness(role='ADMIN',saved=null,sourceChoice='live'){
 const nodes=new Map(),listeners={},storage=new Map();
 class Element{
  constructor(id){this.id=id;this.dataset={};this.attributes={};this.value='';this.hidden=false;this.disabled=false;this.open=false;this._html='';this.textContent='';this.classList={toggle(){}};}
  set innerHTML(value){this._html=value;for(const match of value.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));}
  get innerHTML(){return this._html;}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  getAttribute(k){return this.attributes[k];}
  replaceChildren(){this._html='';this.textContent='';}
  addEventListener(name,fn){this[name]=fn;}
  insertAdjacentHTML(_where,value){this.innerHTML+=value;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  reset(){}
  querySelectorAll(){return [];}
  closest(){return this;}
 }
 for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));
 const document={readyState:'loading',documentElement:{dataset:{}},getElementById:id=>{if(!nodes.has(id))throw Error('Unknown element '+id);return nodes.get(id);},addEventListener:(name,fn)=>{listeners[name]=fn;},querySelectorAll:()=>[],createElement:()=>new Element('created')};
 const base={organization_id:'org',created_by:'me',created_at:'2026-09-09',updated_at:'2026-09-09'};
 const row=(id,extra={})=>({...base,id,...extra});
 const db={
  profiles:[row('me',{full_name:'Cuenta de prueba',role}),row('colleague',{role:'SALES',full_name:'Vendedor de prueba'})],
  institutions:[row('institution',{name:'Institución propia',type:'UNIVERSITY'}),row('other-institution',{name:'Otra institución',type:'SCHOOL',created_by:'colleague'})],
  contacts:[row('contact',{first_name:'Contacto propio',institution_id:'institution'})],
  leads:[row('own-lead',{title:'Prospecto propio',owner_user_id:'me',institution_id:'institution',contact_id:'contact',status:'NEW'}),row('other-lead',{title:'Prospecto ajeno',created_by:'colleague',owner_user_id:'colleague',status:'NEW'})],
  opportunities:[row('own-opp',{name:'Oportunidad propia',value:1000,estimated_cost:500,owner_user_id:'me',stage:'WON'}),row('other-opp',{name:'Oportunidad ajena',created_by:'colleague',owner_user_id:'colleague',value:2000,stage:'PROPOSAL'})],
  tasks:[row('own-task',{title:'Tarea propia',assigned_to:'me',status:'PENDING'})],
  activities:[row('activity',{lead_id:'own-lead',subject:'Interacción propia',type:'CALL',occurred_at:'2026-09-09T12:00:00Z'})],
  scores:[row('score',{lead_id:'own-lead',total_score:88,recommendation:'Llamar'})],
  commercial_goals:[row('goal',{period_start:'2026-09-01',period_end:'2026-09-30',target_margin:10000,target_won_value:50000})]
 };
 const queries=[];let profileGate=null;
 class Query{
  constructor(table){this.table=table;this.filters=[];this.operation='select';queries.push(this);}
  select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}order(){return this;}
  or(value){this.ownerFilter=value;return this;}
  update(payload){this.operation='update';this.payload=payload;return this;}
  insert(payload){this.operation='insert';this.payload=payload;return this;}
  delete(){this.operation='delete';return this;}
  result(single=false){
   if(!db[this.table])return {data:null,error:{code:'MISSING_TABLE'}};
   let rows=db[this.table].filter(row=>this.filters.every(([key,value])=>row[key]===value));
   if(this.ownerFilter){const key=this.table==='tasks'?'assigned_to':'owner_user_id';rows=rows.filter(row=>row[key]==='me'||(!row[key]&&row.created_by==='me'));}
   if(this.operation==='update')rows.forEach(row=>Object.assign(row,this.payload));
   if(this.operation==='insert'){rows=(Array.isArray(this.payload)?this.payload:[this.payload]).map(payload=>({...base,id:'new-'+db[this.table].length,...payload}));db[this.table].push(...rows);}
   if(this.operation==='delete')db[this.table]=db[this.table].filter(row=>!rows.includes(row));
   return {data:single?(rows[0]||null):rows.map(row=>({...row})),error:null};
  }
  async maybeSingle(){if(profileGate)await profileGate;return this.result(true);}
  async single(){return this.result(true);}
  async range(){return this.result();}
  then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
 }
 const sb={from:table=>new Query(table),auth:{onAuthStateChange(){},signOut:async()=>({error:null})}};
 if(saved)storage.set(workspace.workspaceKey('me','org'),saved);
 if(sourceChoice)storage.set(workspace.workspaceKey('me','org')+':source-v'+demo.DEMO_VERSION,sourceChoice);
 const context=vm.createContext({...domain,esc:domain.escapeHTML,...workspace,...demo,...executive,console,document,window:{supabase:{createClient:()=>sb},confirm:()=>true},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},location:{hostname:'test.invalid',origin:'https://test.invalid',pathname:'/',hash:''},history:{replaceState(){}},URLSearchParams,URL,Blob,Date,setTimeout,clearTimeout,setInterval,clearInterval,FormData:class {get(key){return nodes.get('field-'+key)?.value??null;}}});
 const run=code=>vm.runInContext(code,context);
 run(source);run('init();session={user:{id:"me",email:"test@example.invalid"}};');
 return {run,nodes,db,queries,storage,boot:()=>run('reload()'),gate:promise=>{profileGate=promise;},click:id=>nodes.get(id).onclick()};
}
test('ADMIN starts in executive mode; data is loaded from existing profiles/goals tables',async()=>{
 const h=harness();await h.boot();
 assert.equal(h.run('workspace'),'admin');
 assert.equal(h.nodes.get('pageTitle').textContent,'Centro de decisiones');
 assert.equal(h.nodes.get('adminModeBtn').hidden,false);
 assert.equal(h.nodes.get('adminModeBtn').getAttribute('aria-pressed'),'true');
 assert.match(h.nodes.get('dashboard').innerHTML,/LECTURA EJECUTIVA/);
 assert.match(h.nodes.get('navigation').innerHTML,/data-page="goals"/);
 assert.ok(h.queries.some(q=>q.table==='profiles'));
 assert.ok(h.queries.some(q=>q.table==='commercial_goals'));
 assert.equal(h.queries.some(q=>q.table==='users'||q.table==='goals'),false);
});
test('mode buttons switch both experiences, clear management data, reset filters and persist choice',async()=>{
 const h=harness();await h.boot();
 h.nodes.get('search').value='un filtro anterior';
 await h.click('sellerModeBtn');
 assert.equal(h.run('workspace'),'seller');
 assert.equal(h.run('profile.role'),'ADMIN','never mutate the real account role');
 assert.equal(h.nodes.get('sellerModeBtn').getAttribute('aria-pressed'),'true');
 assert.equal(h.nodes.get('dashboard').innerHTML,'');
 assert.equal(h.nodes.get('search').value,'');
 assert.match(h.nodes.get('pageTitle').textContent,/Mi cartera/);
 assert.match(h.nodes.get('sellerSummary').innerHTML,/Mi operación comercial/);
 assert.match(h.nodes.get('recordList').innerHTML,/Prospecto propio/);
 assert.doesNotMatch(h.nodes.get('recordList').innerHTML,/Prospecto ajeno|Eliminar/);
 assert.doesNotMatch(h.nodes.get('navigation').innerHTML,/dashboard|users|goals/);
 assert.equal(h.run('data.users.length+data.goals.length'),0);
 assert.equal(h.run('data.opportunities[0].estimated_cost'),undefined);
 assert.equal(h.storage.get(workspace.workspaceKey('me','org')),'seller');
 await h.click('adminModeBtn');
 assert.equal(h.run('workspace'),'admin');
 assert.match(h.nodes.get('dashboard').innerHTML,/LECTURA EJECUTIVA/);
 assert.equal(h.run('data.leads.length'),2);
 assert.equal(h.run('data.opportunities[0].estimated_cost'),500);
});
for(const role of ['SALES','MANAGER','VIEWER']){
 test(role+' cannot enter administrator mode, including a manipulated saved preference',async()=>{
  const h=harness(role,'admin');await h.boot();
  assert.equal(h.run('workspace'),'seller');
  assert.equal(h.nodes.get('adminModeBtn').hidden,true);
  await h.run('setWorkspace("admin")');
  for(const page of ['dashboard','users','goals','unknown']){
   h.run('navigate('+JSON.stringify(page)+')');
   assert.equal(h.run('page'),'leads');
  }
  assert.equal(h.run('workspace'),'seller');
  assert.equal(h.queries.some(q=>q.table==='commercial_goals'),false);
  assert.equal(h.run('canDelete()'),false);
  if(role==='VIEWER'){
   h.run('openEditor("leads","own-lead")');
   assert.equal(h.nodes.get('saveBtn').hidden,true);
   assert.equal(h.nodes.get('newBtn').hidden,true);
   assert.equal(h.nodes.get('importBtn').hidden,true);
   await h.run('saveRecord({preventDefault(){}})');
   assert.equal(h.queries.some(q=>q.operation!=='select'),false);
  }
 });
}
test('admin can create/edit all wired modules; seller cannot open another owner or admin form',async()=>{
 const h=harness();await h.boot();
 for(const table of ['institutions','contacts','leads','opportunities','tasks','activities','goals']){
  h.run('openEditor('+JSON.stringify(table)+')');
  assert.equal(h.nodes.get('editor').open,true,table);
  assert.equal(h.nodes.get('saveBtn').hidden,false,table);
  h.nodes.get('editor').close();
 }
 h.run('openEditor("users","colleague")');
 assert.equal(h.nodes.get('editor').open,true);
 h.nodes.get('editor').close();
 await h.click('sellerModeBtn');
 for(const code of ['openEditor("goals")','openEditor("users","colleague")','openEditor("leads","other-lead")','openActivityForLead("other-lead")']){
  h.run(code);assert.equal(h.nodes.get('editor').open,false,code);
 }
 h.run('openEditor("opportunities","own-opp")');
 assert.doesNotMatch(h.nodes.get('fields').innerHTML,/name="estimated_cost"|name="owner_user_id"/);
});
test('an open form is preserved on mode switch; cancelling then switching works',async()=>{
 const h=harness();await h.boot();h.run('openEditor("leads","own-lead")');
 await h.click('sellerModeBtn');
 assert.equal(h.run('workspace'),'admin');
 assert.equal(h.nodes.get('editor').open,true);
 assert.match(h.nodes.get('status').textContent,/Guarda o cancela/);
 h.click('cancelEditor');await h.click('sellerModeBtn');
 assert.equal(h.run('workspace'),'seller');
 assert.equal(h.nodes.get('fields').innerHTML,'');
 assert.equal(h.run('editTable'),null);
});
test('seller save works and does not submit admin-only ownership or cost fields',async()=>{
 const h=harness('SALES');await h.boot();h.run('openEditor("opportunities","own-opp")');
 h.nodes.get('field-name').value='Nombre actualizado';h.nodes.get('field-stage').value='WON';
 h.nodes.get('field-value').value='1200';
 await h.run('saveRecord({preventDefault(){}})');
 const update=h.queries.find(q=>q.operation==='update');
 assert.ok(update);assert.equal(update.table,'opportunities');
 assert.equal(update.payload.estimated_cost,undefined);assert.equal(update.payload.owner_user_id,undefined);
 assert.equal(h.db.opportunities[0].estimated_cost,500);
 assert.equal(h.db.opportunities[0].name,'Nombre actualizado');
 assert.equal(h.nodes.get('editor').open,false);
 assert.match(h.nodes.get('status').textContent,/guardado correctamente/);
});
test('goals save to commercial_goals and profile edits to profiles',async()=>{
 const h=harness();await h.boot();h.run('openEditor("goals")');
 for(const [key,value] of Object.entries({period_start:'2026-10-01',period_end:'2026-10-31',target_margin:'10000',target_won_value:'20000'}))h.nodes.get('field-'+key).value=value;
 await h.run('saveRecord({preventDefault(){}})');
 assert.ok(h.queries.some(q=>q.operation==='insert'&&q.table==='commercial_goals'));
 h.run('openEditor("users","colleague")');h.nodes.get('field-full_name').value='Nuevo nombre';h.nodes.get('field-role').value='SALES';
 await h.run('saveRecord({preventDefault(){}})');
 assert.ok(h.queries.some(q=>q.operation==='update'&&q.table==='profiles'));
});
test('saved seller mode restores after reload and remains independent of night theme',async()=>{
 const h=harness('ADMIN','seller');await h.boot();
 assert.equal(h.run('workspace'),'seller');
 h.click('themeToggle');
 assert.equal(h.run('document.documentElement.dataset.theme'),'night');
 await h.click('adminModeBtn');
 assert.equal(h.run('document.documentElement.dataset.theme'),'night');
});
test('logout invalidates in-flight data and clears both views and editors',async()=>{
 const h=harness();await h.boot();
 let release;h.gate(new Promise(resolve=>{release=resolve;}));
 const pending=h.run('reload()');
 assert.equal(h.nodes.get('sellerModeBtn').disabled,true);
 h.run('clearSession()');release();await pending;
 assert.equal(h.run('profile'),null);assert.equal(h.run('data.leads.length'),0);
 assert.equal(h.nodes.get('dashboard').innerHTML,'');
 assert.equal(h.nodes.get('recordList').innerHTML,'');
 assert.equal(h.nodes.get('workspaceControls').hidden,true);
});
test('failed goal query is visible without breaking mode switching',async()=>{
 const h=harness();delete h.db.commercial_goals;await h.boot();
 assert.equal(h.run('failures.goals'),true);
 assert.match(h.nodes.get('status').textContent,/Metas/);
 await h.click('sellerModeBtn');
 assert.equal(h.run('workspace'),'seller');
 assert.equal(h.run('failures.goals'),undefined);
});

test('new ADMIN sees the complete demo by default without loading or creating real commercial records',async()=>{
 const h=harness('ADMIN',null,null);await h.boot();
 assert.equal(h.run('dataSource'),'demo');
 assert.equal(h.run('data.users.length'),5);assert.equal(h.run('data.leads.length'),40);
 assert.equal(h.run('data.opportunities.length'),30);
 assert.match(h.nodes.get('dashboard').innerHTML,/Valeria Torres|Camila Ríos/);
 assert.match(h.nodes.get('sourceBadge').textContent,/DEMOSTRACIÓN/);
 assert.equal(h.queries.some(query=>query.table!=='profiles'),false);
});
test('demo save and import never issue Data API writes and survive refresh',async()=>{
 const h=harness('ADMIN',null,'demo');await h.boot();h.run('openEditor("institutions")');
 h.nodes.get('field-name').value='Institución creada en demo';h.nodes.get('field-type').value='SCHOOL';h.nodes.get('field-country').value='Perú';
 await h.run('saveRecord({preventDefault(){}})');
 assert.equal(h.run('data.institutions.length'),21);
 assert.equal(h.nodes.get('editor').open,false);
 assert.equal(h.queries.some(q=>q.operation!=='select'),false);
 await h.boot();assert.equal(h.run('data.institutions.length'),21);
 h.run('navigate("institutions")');
 await h.run('importCsvFile({target:{files:[{text:async()=>"name,type,country\\nCSV demo,SCHOOL,Perú"}],value:""}})');
 assert.equal(h.run('data.institutions.length'),22);
 assert.equal(h.queries.some(q=>q.operation!=='select'),false);
});
test('source switching isolates simulated data from live operations and clears demo form state',async()=>{
 const h=harness('ADMIN',null,'demo');await h.boot();
 await h.click('sourceToggle');
 assert.equal(h.run('dataSource'),'live');
 assert.equal(h.run('data.users.length'),2);
 assert.equal(h.run('data.institutions.some(row=>row.is_simulated)'),false);
 await h.click('sourceToggle');
 assert.equal(h.run('dataSource'),'demo');assert.equal(h.run('data.users.length'),5);
});
test('demo seller selection changes only fictional portfolios, not authentication or role',async()=>{
 const h=harness('ADMIN',null,'demo');await h.boot();await h.click('sellerModeBtn');
 assert.equal(h.run('data.leads.length'),8);
 assert.equal(h.nodes.get('demoSellerField').hidden,false);
 h.nodes.get('demoSeller').value='demo-seller-3';h.nodes.get('demoSeller').onchange();
 assert.equal(h.run('data.leads.every(row=>row.owner_user_id==="demo-seller-3")'),true);
 assert.equal(h.run('session.user.id'),'me');assert.equal(h.run('profile.role'),'ADMIN');
 assert.equal(h.run('data.users.length'),0);
});
test('KPI drilldown applies a removable executive filter and clears when navigating',async()=>{
 const h=harness('ADMIN',null,'demo');await h.boot();
 h.run('openExecutiveView("won","demo-seller-1")');
 assert.equal(h.run('page'),'opportunities');
 assert.equal(h.run('filtered().every(row=>row.stage==="WON"&&row.owner_user_id==="demo-seller-1")'),true);
 assert.equal(h.nodes.get('recordContext').hidden,false);
 h.click('clearRecordContext');assert.equal(h.run('filtered().length'),30);
 h.run('navigate("leads")');assert.equal(h.run('executiveFilter'),"");
});
test('converted leads keep their historical score but show conversion-aware guidance',async()=>{
 const h=harness('ADMIN',null,'live');await h.boot();
 h.run('data.leads[0].status="CONVERTED";data.opportunities[0].lead_id="own-lead";navigate("leads");');
 assert.match(h.nodes.get('recordList').innerHTML,/Potencial al convertir/);
 assert.match(h.nodes.get('recordList').innerHTML,/Lead convertido/);
 h.run('openEditor("leads","own-lead")');
 assert.match(h.nodes.get('fields').innerHTML,/Potencial al convertir/);
 assert.doesNotMatch(h.nodes.get('fields').innerHTML,/Convertir en oportunidad/);
});
