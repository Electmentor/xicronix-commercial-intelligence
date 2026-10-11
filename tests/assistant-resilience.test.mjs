import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,deterministicFallbackPlan} from '../api/assistant.mjs';
import {buildEvidence} from '../assistant-policy.mjs';
import {resolveAssistantProvider,requestStructuredPlan} from '../assistant-provider.mjs';

const auth={id:'u',organization_id:'org',role:'ADMIN'};
const evidence=buildEvidence({records:{tasks:[{id:'t1',title:'Tarea crítica',status:'PENDING'}]},role:'ADMIN',now:Date.parse('2026-09-27T20:00:00Z')});
const request=message=>new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,context:{page:'dashboard',source:'live'},history:[]})});

test('provider selection defaults to Groq without coupling business rules',()=>{
 const p=resolveAssistantProvider({GROQ_API_KEY:'test'});
 assert.equal(p.id,'groq');
 assert.equal(p.endpoint,'https://api.groq.com/openai/v1/responses');
 assert.equal(p.model,'openai/gpt-oss-120b');
});

test('deterministic fallback selects only verified evidence from primary record',()=>{
 const p=deterministicFallbackPlan(evidence);
 assert.deepEqual(p.evidence_ids,['tasks:t1/status']);
 assert.deepEqual(p.recommendation_ids,['tasks:t1/review']);
 assert.equal(p.insufficient,false);
});

test('provider outage degrades to deterministic A009 response instead of failing the CRM',async()=>{
 const handler=createHandler({
  authenticate:async()=>auth,
  prepareOpportunity:async()=>null,
  prepare:async()=>structuredClone(evidence),
  generate:async()=>{throw Error('PROVIDER_ERROR');}
 });
 const response=await handler(request('¿Qué es lo más importante?'));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.provider_status,'degraded');
 assert.match(body.answer,/Tarea crítica/);
 assert.match(body.answer,/Proveedor IA no disponible/);
});

test('unexpected internal errors still fail closed',async()=>{
 const handler=createHandler({
  authenticate:async()=>auth,
  prepareOpportunity:async()=>null,
  prepare:async()=>{throw Error('DATABASE_CORRUPTION');},
  generate:async()=>({})
 });
 const response=await handler(request('prioridad'));
 assert.equal(response.status,500);
});

test('provider transport keeps no storage and structured output',async()=>{
 const provider={name:'Groq',endpoint:'https://example.invalid',model:'m',key:'k'};
 let sent;
 const answer=await requestStructuredPlan({
  provider,
  payload:{message:'prioridad',history:[],evidence},
  schema:{type:'object',properties:{evidence_ids:{type:'array',items:{type:'string'}},recommendation_ids:{type:'array',items:{type:'string'}},insufficient:{type:'boolean'}},required:['evidence_ids','recommendation_ids','insufficient'],additionalProperties:false},
  instructions:'select ids',
  fetcher:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({output:[{content:[{type:'output_text',text:'{"evidence_ids":[],"recommendation_ids":[],"insufficient":false}'}]}]});}
 });
 assert.equal(sent.store,false);
 assert.equal(sent.tools,undefined);
 assert.match(answer,/evidence_ids/);
});
