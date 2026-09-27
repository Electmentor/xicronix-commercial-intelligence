import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssistantProvider,requestEvidencePlan} from '../assistant-provider.mjs';

const payload={
 message:'prioridad',
 history:[],
 evidence:{
  policy:'a009-evidence-v1.1',page:'dashboard',intent:'priority',source:'live',
  items:[{id:'tasks:t1',title:'Tarea',gate:{state:'UNKNOWN'}}],
  facts:[{id:'tasks:t1/status',field:'status',value:'PENDING'}],
  recommendations:[{id:'tasks:t1/review',text:'Revisar'}],
  limitations:[]
 }
};
const schema={type:'object',properties:{evidence_ids:{type:'array',items:{type:'string'}},recommendation_ids:{type:'array',items:{type:'string'}},insufficient:{type:'boolean'}},required:['evidence_ids','recommendation_ids','insufficient'],additionalProperties:false};

test('provider config is isolated from business logic and defaults to Groq',()=>{
 const p=resolveAssistantProvider({GROQ_API_KEY:'secret'});
 assert.equal(p.id,'groq');
 assert.equal(p.endpoint,'https://api.groq.com/openai/v1/responses');
 assert.equal(p.model,'openai/gpt-oss-120b');
 assert.equal(p.key,'secret');
});

test('unsupported providers fail closed',()=>{
 assert.throws(()=>resolveAssistantProvider({ASSISTANT_PROVIDER:'unknown'}),/PROVIDER_NOT_SUPPORTED/);
});

test('provider transport sends bounded structured evidence with no storage',async()=>{
 let sent;
 const provider={name:'Groq',endpoint:'https://example.invalid/responses',model:'model',key:'secret'};
 const result=await requestEvidencePlan({provider,payload,schema,instructions:'select ids',fetcher:async(url,options)=>{
  assert.equal(url,provider.endpoint);
  assert.equal(options.headers.Authorization,'Bearer secret');
  sent=JSON.parse(options.body);
  return Response.json({output:[{content:[{type:'output_text',text:'{"evidence_ids":[],"recommendation_ids":[],"insufficient":false}'}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}});
 }});
 assert.equal(sent.store,false);
 assert.equal(sent.model,'model');
 assert.equal(sent.text.format.strict,true);
 assert.equal(sent.tools,undefined);
 assert.match(result.answer,/evidence_ids/);
});

test('provider transport maps quota, auth and rate failures without exposing secrets',async()=>{
 const base={provider:{name:'Groq',endpoint:'https://example.invalid',model:'m',key:'secret'},payload,schema,instructions:'x'};
 await assert.rejects(requestEvidencePlan({...base,fetcher:async()=>Response.json({error:{code:'credit_balance_exhausted'}},{status:402})}),/PROVIDER_CREDIT/);
 await assert.rejects(requestEvidencePlan({...base,fetcher:async()=>Response.json({},{status:401})}),/PROVIDER_AUTH/);
 await assert.rejects(requestEvidencePlan({...base,fetcher:async()=>Response.json({},{status:429,headers:{'retry-after':'1'}})}),/RATE_LIMIT/);
});
