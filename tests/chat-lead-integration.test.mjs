import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let source=readFileSync('supabase/functions/xicronix-web-leads/index.ts','utf8').replace(/^import .*\n/gm,'');
source=stripTypeScriptTypes(source);
const rows=[], activities=[], emails=[];let handler;let failMail=false;let failCrm=false;
const db={auth:{admin:{getUserById:async()=>({data:{user:{email:'admin@example.test'}}})}},from(table){const q={filter:{},op:'select',payload:null,count:false,select(_,opts){this.count=opts?.count;return this},eq(k,v){this.filter[k]=v;return this},ilike(k,v){this.filter[k]=v;return this},gte(){return this},limit(){return this},insert(v){this.op='insert';this.payload=v;return this},update(v){this.op='update';this.payload=v;return this},single(){return this.run()},maybeSingle(){return this.run()},then(a,b){return this.run().then(a,b)},async run(){let data=null;
if(table==='web_leads'){
if(this.op==='insert'){data={id:'row-'+rows.length,...this.payload};rows.push(data)}
else if(this.op==='update'){data=rows.find(r=>r.id===this.filter.id);Object.assign(data,this.payload)}
else if(this.count)return {count:rows.filter(r=>r.email===this.filter.email).length};
else data=rows.find(r=>r.external_lead_id===this.filter.external_lead_id)||null;
}else if(table==='organizations')data={id:'org'};
else if(table==='profiles')data=this.filter.role==='ADMIN'&&this.filter.organization_id?[{id:'admin'}]:{id:'admin'};
else if(table==='contacts'&&this.op==='insert')data={id:'contact'};
else if(table==='leads'&&this.op==='insert'){if(failCrm)return{error:{message:'simulated CRM failure'}};data={id:'crm-lead'}}
else if(table==='activities'&&this.op==='insert')activities.push(this.payload);
return {data,error:null};}};return q;}};
const context={Response,Request,URL,AbortSignal,console,createClient:()=>db,Deno:{env:{get:k=>k==='RESEND_API_KEY'?'test':'value'},serve:fn=>handler=fn},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);emails.push(body);return Response.json(failMail?{error:'failed'}:{id:'mail-'+emails.length},{status:failMail?503:200})}};
vm.runInNewContext(source,context);
const input={leadId:'11111111-1111-4111-a111-111111111111',source:'xicronix-web',submittedAt:new Date().toISOString(),contact:{name:'Prueba Chat',email:'tester@example.test'},request:{message:'Quiero información para un laboratorio de ciencias.',context:{channel:'web_chat',emailInformationRequested:true}},privacyNotice:{acknowledged:true,version:'2026-09-25.1',acknowledgedAt:new Date().toISOString()}};
async function send(x){const r=await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(x)}));return{status:r.status,data:await r.json()}}
let r=await send({...input,privacyNotice:{acknowledged:false}});assert.equal(r.status,400);assert.equal(rows.length,0);assert.equal(emails.length,0);
r=await send(input);assert.equal(r.status,201);assert.equal(r.data.synced,true);assert.equal(r.data.acknowledgement,'sent');assert.equal(activities.length,1);assert.equal(activities[0].notes,input.request.message);assert.equal(rows[0].submission_context.channel,'web_chat');assert.equal(rows[0].submission_context.acknowledgementEmailId,'mail-2');assert.match(emails[1].text,/https:\/\/www.xicronix.com\/soluciones/);assert.doesNotMatch(emails[1].text,/Quiero información para/);
r=await send(input);assert.equal(r.data.duplicate,true);assert.equal(emails.length,2);assert.equal(rows.length,1);
r=await send({...input,contact:{...input.contact,email:'attacker@example.test'}});assert.equal(r.status,409);assert.equal(emails.length,2);
failMail=true;r=await send({...input,leadId:'22222222-2222-4222-a222-222222222222'});assert.equal(r.status,201);assert.equal(r.data.acknowledgement,'failed');assert.equal(r.data.synced,true);
failCrm=true;r=await send({...input,leadId:'33333333-3333-4333-a333-333333333333'});assert.equal(r.data.synced,false);
r=await send({...input,leadId:'44444444-4444-4444-a444-444444444444'});assert.equal(r.status,429);
console.log('PASS: consent, CRM context, public email, durable idempotency, conflict protection, mail/CRM failures and daily limit');
