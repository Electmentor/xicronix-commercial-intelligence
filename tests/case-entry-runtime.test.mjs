// Execute the application's real routing and mobile-label functions; no browser or services.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {canAccessPage,ADMIN,SELLER} from '../workspace.mjs';
import {escapeHTML} from '../domain.mjs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function extract(name){
 const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(source);
 assert.ok(match,'Missing application function '+name);
 const end=source.slice(match.index+1).search(/\n(?:async )?function /);
 return source.slice(match.index,end<0?source.length:match.index+1+end);
}
const functions=['readEntryRoute','rememberPage','navigate','applyEntryRoute','renderHistoryPage','renderWorkspaceControls'].map(extract).join('\n');
const LEAD='33333333-3333-4333-8333-333333333333';
function harness({role='ADMIN',hash='',search='',visibleLead=true}={}){
 const nodes=new Map(),renders=[],opened=[],notices=[],performanceCalls=[],historyCalls=[];
 const profile={id:'user',role,organization_id:'org',full_name:'Cuenta sintética'};
 const workspace=role==='ADMIN'?ADMIN:SELLER;
 const location={pathname:'/',search,hash};
 function node(id){
  if(!nodes.has(id))nodes.set(id,{dataset:{},value:'',open:false,hidden:false,disabled:false,textContent:'',innerHTML:'',label:{textContent:''},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},querySelector(selector){return selector==='small'?this.label:null;}});
  return nodes.get(id);
 }
 const sandbox={profile,workspace,session:{user:{email:'fixture@example.invalid'}},ADMIN,SELLER,URLSearchParams,location,entryRoute:null,page:'leads',pageIndex:0,busy:false,loading:false,recovery:false,executiveFilter:'',executiveOwner:'',sellerQuickFilter:'',sellerManagementSearch:'',aiSelected:null,dataSource:'live',workspaceEntryChosen:true,demoSeller:'fixture',DEMO_SELLERS:[{id:'fixture',full_name:'Cuenta sintética'}],modules:{leads:{label:'Mis casos',options:{NEW:'Nuevo'}},dashboard:{label:'Rendimiento'},tasks:{label:'Tareas'},users:{label:'Usuarios'}},performancePages:{sales:{}},$:node,esc:escapeHTML,accessible:page=>canAccessPage(profile,workspace,page),canViewDashboard:()=>workspace===ADMIN,isAdminAccount:()=>profile.role==='ADMIN',mobileNavMode:()=>false,applySidebar(){},scopedRows:()=>visibleLead?[{id:LEAD}]:[],openLeadDetails:id=>opened.push(id),notice:(...args)=>notices.push(args),openPerformance:value=>performanceCalls.push(value),render:()=>renders.push(sandbox.page)};
 function recordHistory(mode,state,_title,url){historyCalls.push({mode,state,url});const parsed=new URL(url,'https://fixture.invalid');location.search=parsed.search;location.hash=parsed.hash;}
 sandbox.history={pushState:(...args)=>recordHistory('push',...args),replaceState:(...args)=>recordHistory('replace',...args)};
 const context=vm.createContext(sandbox);
 vm.runInContext(functions+'\nentryRoute=readEntryRoute();',context);
 return {context,node,renders,opened,notices,historyCalls,performanceCalls,run:code=>vm.runInContext(code,context)};
}

for(const role of ['ADMIN','SALES']){
 test(role+' starts without a hash in Mis casos after applying the actual entry route',()=>{
  const h=harness({role});
  assert.equal(h.run('readEntryRoute().page'),'leads');
  h.run('applyEntryRoute()');
  assert.equal(h.context.page,'leads');
  assert.deepEqual(h.renders,['leads']);
  assert.equal(h.context.location.hash,'#page=leads');
  assert.equal(h.context.entryRoute,null);
  h.run('applyEntryRoute()');
  assert.equal(h.renders.length,1,'An entry route is consumed once');
 });
 test(role+' retains explicit dashboard and task deep links',()=>{
  for(const page of ['dashboard','tasks']){
   const h=harness({role,hash:'#page='+page});
   assert.equal(h.run('readEntryRoute().page'),page);
   h.run('applyEntryRoute()');
   assert.equal(h.context.page,page);
   assert.deepEqual(h.renders,[page]);
  }
 });
 test(role+' history without a target falls back to Mis casos',()=>{
  for(const target of [undefined,null,'']){
   const h=harness({role});h.context.page='dashboard';h.context.target=target;
   h.run('renderHistoryPage(target)');
   assert.equal(h.context.page,'leads');assert.deepEqual(h.renders,['leads']);
  }
 });
 test(role+' mobile Home has the same Mis casos label and target',()=>{
  const h=harness({role});h.run('renderWorkspaceControls()');
  assert.equal(h.node('mobileNavHome').dataset.page,'leads');
  assert.equal(h.node('mobileNavHome').label.textContent,'Mis casos');
  assert.equal(h.node('mobileNavNow').dataset.page,'dashboard');
  assert.equal(h.node('mobileNavNow').label.textContent,'Rendimiento');
 });
 test(role+' valid lead links still open the visible case over an explicit dashboard hash',()=>{
  const h=harness({role,search:'?lead='+LEAD,hash:'#page=dashboard'});
  h.run('applyEntryRoute()');
  assert.equal(h.context.page,'leads');assert.deepEqual(h.opened,[LEAD]);assert.equal(h.notices.length,0);
 });
}

test('explicit administrative performance deep link is preserved',()=>{
 const h=harness({hash:'#page=dashboard',search:'?performance=sales'});h.run('applyEntryRoute()');
 assert.equal(h.context.page,'dashboard');assert.deepEqual(h.performanceCalls,['sales']);
});
test('inaccessible deep links and invalid lead IDs safely return to cases',()=>{
 const h=harness({role:'SALES',hash:'#page=users',search:'?lead=not-a-uuid'});
 assert.equal(h.run('readEntryRoute().lead'),null);h.run('applyEntryRoute()');
 assert.equal(h.context.page,'leads');assert.deepEqual(h.opened,[]);
 const invalid=harness({hash:'#page=not-a-page'});invalid.run('applyEntryRoute()');assert.equal(invalid.context.page,'leads');
});
test('an unavailable lead stays in the case list and reports the visibility limit',()=>{
 const h=harness({search:'?lead='+LEAD,visibleLead:false});h.run('applyEntryRoute()');
 assert.equal(h.context.page,'leads');assert.deepEqual(h.opened,[]);assert.match(h.notices[0][0],/cartera visible/);
});
test('loading or recovery preserves the pending route without navigation',()=>{
 for(const key of ['loading','recovery']){
  const h=harness();h.context[key]=true;h.run('applyEntryRoute()');
  assert.equal(h.renders.length,0);assert.equal(h.context.entryRoute.page,'leads');
  h.context[key]=false;h.run('applyEntryRoute()');assert.deepEqual(h.renders,['leads']);
 }
});
