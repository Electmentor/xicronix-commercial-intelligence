import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function prepareCaseWhatsapp('),end=app.indexOf('\nfunction init()',start);
function harness(){const calls=[],notices=[];const data={leads:[{id:'l',contact_id:'c',institution_id:'i'}],contacts:[{id:'c',phone:'995586874'}],institutions:[{id:'i'}],tasks:[{id:'t',lead_id:'l'}],radar:[{id:'r',lead_id:'l',contact_whatsapp:'999999999'}],activities:[],mail:[],commercial_mail_outbox:[{lead_id:'l',status:'SENT'}]};const ctx={profile:{id:'user',organization_id:'org'},session:{user:{id:'user'}},loading:false,busy:false,dataSource:'live',workspace:'seller',loadVersion:1,data,scopedRows:key=>data[key]||[],openCaseWhatsapp:x=>calls.push(x),notice:(...args)=>notices.push(args)};vm.createContext(ctx);vm.runInContext(app.slice(start,end),ctx);return {ctx,calls,notices,data};}
test('four UI entry points use composer buttons rather than direct WhatsApp navigation',()=>{assert.equal((app.match(/>WhatsApp<\/button>/g)||[]).length,4);assert.equal((app.match(/>WhatsApp<\/a>/g)||[]).length,0);});
for(const dataset of [{caseWhatsappLead:'l'},{caseWhatsappTask:'t'},{caseWhatsappRadar:'r'}])test('entry resolves scoped case and retains outbound continuity '+JSON.stringify(dataset),()=>{const h=harness();h.ctx.prepareCaseWhatsapp({dataset});assert.equal(h.calls[0].lead.id,'l');assert.equal(h.calls[0].contact.phone,'995586874');assert.equal(h.calls[0].data.commercial_mail_outbox.length,1);});
test('stale/foreign lead does not open draft',()=>{const h=harness();h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'other'}});assert.equal(h.calls.length,0);assert.equal(h.notices.length,1);});
test('unlinked radar opens manual composer without inventing case context',()=>{const h=harness();delete h.data.radar[0].lead_id;h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappRadar:'r'}});assert.equal(h.calls[0].lead,null);assert.equal(h.calls[0].contact,null);assert.equal(h.calls[0].radar.id,'r');});


test('demo source is passed to the compositor instead of silently using real mode',()=>{const h=harness();h.ctx.dataSource='demo';h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});assert.equal(h.calls[0].dataSource,'demo');assert.equal(h.calls[0].isCurrent(),true);});
test('live handoff guard rejects session, organization, data source and workspace changes',()=>{
 for(const [field,value] of [['session',{user:{id:'other'}}],['session',null],['profile',{organization_id:'other'}],['dataSource','demo'],['workspace','admin']]){
  const h=harness();h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});assert.equal(h.calls[0].isCurrent(),true);h.ctx[field]=value;assert.equal(h.calls[0].isCurrent(),false,field);
 }
});
test('a case removed from the current scope invalidates an already open compositor',()=>{const h=harness();h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});h.data.leads=[];assert.equal(h.calls[0].isCurrent(),false);});
test('direct invocation cannot prepare an unauthenticated or loading compositor',()=>{for(const patch of [{session:null},{profile:null},{loading:true},{busy:true}]){const h=harness();Object.assign(h.ctx,patch);h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});assert.equal(h.calls.length,0);}});

function lifecycleHarness(){
 const nodes=new Map(),events={},calls=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{open:false,hidden:false,dataset:{},classList:{contains:()=>true},replaceChildren(){this.cleared=true;},close(){this.open=false;}});return nodes.get(id);};
 const ctx={profile:{id:'user',organization_id:'org',role:'ADMIN'},session:{user:{id:'user'}},workspace:'seller',ADMIN:'admin',SELLER:'seller',workspaceIdentity:'identity',dataSource:'live',busy:false,loading:false,recovery:false,loadVersion:1,page:'leads',smartMailState:{},smartMailUploadState:{},smartMailDrafts:new Map([['old','private draft']]),aiSelected:null,aiAssistant:null,data:{private:'old'},performanceFilters:{},performanceAdjustment:20,performancePage:null,dailyBriefingShownForSession:true,mailWebhookConfig:null,emptyData:()=>({}),$:node,closeCaseWhatsapp:()=>{calls.push('whatsapp');node('caseWhatsappDialog').close();node('caseWhatsappDialog').replaceChildren();},closeQuoteEditor(){},closeAiAssistant(){},stopLiveIntelligence(){},stopLiveMailRealtime(){},closeLeadDetails:()=>{calls.push('detail');node('leadDetailDialog').close();},localStorage:{setItem(){}},document:{querySelector:()=>null},isAdminAccount:()=>true,effectiveWorkspace:(_profile,next)=>next,notice(){},sourceKey:()=>'',canViewDashboard:()=>false,navigate:page=>{ctx.page=page;},reload:async()=>{calls.push('reload');},readEntryRoute:()=>({page:'leads'}),history:{replaceState(){},pushState(){calls.push('history');}},location:{pathname:'/',search:'',hash:'#page=leads'},window:{addEventListener:(event,fn)=>events[event]=fn},mobileNavMode:()=>false,applySidebar(){},renderHistoryPage:page=>{ctx.page=page;}};
 const extract=name=>{const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);const offset=app.slice(match.index+1).search(/\n(?:async )?function /);return app.slice(match.index,match.index+1+offset);};
 vm.createContext(ctx);vm.runInContext(['clearWorkspaceViews','clearSession','setWorkspace','setDataSource','installHistoryGuard'].map(extract).join('\n'),ctx);
 return {ctx,node,events,calls};
}
test('clearSession discards WhatsApp before clearing identity and customer data',()=>{const h=lifecycleHarness();h.node('caseWhatsappDialog').open=true;h.ctx.clearSession();assert.equal(h.calls[0],'whatsapp');assert.equal(h.node('caseWhatsappDialog').open,false);assert.equal(h.node('caseWhatsappDialog').cleared,true);assert.equal(h.ctx.session,null);assert.equal(h.ctx.profile,null);assert.deepEqual(h.ctx.data,{});});
test('Back dismisses WhatsApp before the case beneath it',()=>{const h=lifecycleHarness();h.ctx.installHistoryGuard();h.calls.length=0;h.node('caseWhatsappDialog').open=true;h.node('leadDetailDialog').open=true;h.events.popstate({state:{xicronix:true,page:'dashboard'}});assert.equal(h.node('caseWhatsappDialog').open,false);assert.equal(h.node('leadDetailDialog').open,true);assert.equal(h.calls[0],'whatsapp');assert.equal(h.calls.includes('detail'),false);h.events.popstate({state:{xicronix:true,page:'dashboard'}});assert.equal(h.node('leadDetailDialog').open,false);});
test('data-source and workspace changes discard the old compositor',async()=>{for(const change of ['setDataSource','setWorkspace']){const h=lifecycleHarness();h.node('caseWhatsappDialog').open=true;await h.ctx[change](change==='setDataSource'?'demo':'admin');assert.equal(h.node('caseWhatsappDialog').open,false);assert.equal(h.node('caseWhatsappDialog').cleared,true);assert.ok(h.calls.indexOf('whatsapp')<h.calls.indexOf('reload'));}});


test('ordinary data refresh retains a draft when identity, mode and scope remain valid',()=>{const h=harness();h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});h.ctx.loadVersion++;assert.equal(h.calls[0].isCurrent(),true);});


test('transient loading or busy waits without invalidating the current identity and draft',()=>{for(const field of ['loading','busy']){const h=harness();h.ctx.prepareCaseWhatsapp({dataset:{caseWhatsappLead:'l'}});h.ctx[field]=true;assert.equal(h.calls[0].isCurrent(),true);assert.equal(h.calls[0].isReady(),false);h.ctx[field]=false;assert.equal(h.calls[0].isCurrent(),true);assert.equal(h.calls[0].isReady(),true);}});
