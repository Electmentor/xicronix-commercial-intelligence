import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/public-chat.mjs';

// Request contract tests only. No network and no claims about live model quality.
globalThis.fetch=()=>{throw Error('NETWORK_DISABLED_FOR_TESTS');};
const env={GROQ_API_KEY:'synthetic',PUBLIC_CHAT_BRIDGE_TOKEN:'synthetic-structured'};
const fields=['message','options','handoff','appointment_request','requested_date','requested_time'];
const valid={message:'Un circuito conecta una fuente con una carga.',options:[],handoff:false,appointment_request:false,requested_date:null,requested_time:null};
let id=12000;
const request=(body={messages:[{role:'user',content:'Explica un circuito sencillo.'}]},authorized=true)=>new Request('https://example.test/api/public-chat',{
 method:'POST',headers:{authorization:authorized?'Bearer synthetic-structured':'Bearer wrong','x-chat-client':(++id).toString(16).padStart(64,'0')},body:JSON.stringify(body)
});
const completion=(answer=valid,extra={})=>Response.json({choices:[{message:{content:JSON.stringify(answer)},...extra}]});
async function capture(overrides={},body){
 let sent,calls=0;
 const response=await createHandler({env:{...env,...overrides},fetcher:async(url,options)=>{
  calls++; assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');sent=JSON.parse(options.body);return completion();
 }})(request(body));
 return {sent,calls,response};
}

test('observed 120b model uses closed strict schema for all six existing fields',async()=>{
 const {sent,calls,response}=await capture();
 assert.equal(calls,1);assert.equal(response.status,200);
 assert.equal(sent.model,'openai/gpt-oss-120b');
 assert.equal(sent.response_format.type,'json_schema');
 assert.equal(sent.response_format.json_schema.strict,true);
 const schema=sent.response_format.json_schema.schema;
 assert.equal(schema.type,'object');assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.required,fields);assert.deepEqual(Object.keys(schema.properties),fields);
 assert.deepEqual(schema.properties.message,{type:'string'});
 assert.deepEqual(schema.properties.options,{type:'array',items:{type:'string'}});
 assert.deepEqual(schema.properties.handoff,{type:'boolean'});
 assert.deepEqual(schema.properties.appointment_request,{type:'boolean'});
 assert.deepEqual(schema.properties.requested_date,{type:['string','null']});
 assert.deepEqual(schema.properties.requested_time,{type:['string','null']});
});
test('other reviewed gpt-oss model supports strict format without changing selected model',async()=>{
 const {sent}=await capture({PUBLIC_CHAT_MODEL:'openai/gpt-oss-20b'});
 assert.equal(sent.model,'openai/gpt-oss-20b');assert.equal(sent.response_format.json_schema.strict,true);
});
test('unreviewed custom models retain their previous JSON object request format',async()=>{
 const {sent}=await capture({PUBLIC_CHAT_MODEL:'custom-model-synthetic'});
 assert.equal(sent.model,'custom-model-synthetic');assert.deepEqual(sent.response_format,{type:'json_object'});
});
test('history, client order, source context and provider generation limits are preserved',async()=>{
 const messages=[{role:'user',content:'¿Quién te desarrolló?'},{role:'assistant',content:'Soy una asistente de IA de Xicronix.'},{role:'user',content:'¿Conoces a una persona concreta?'}];
 const {sent,calls}=await capture({}, {messages,sourcePage:'/colegios'});
 assert.deepEqual(sent.messages.slice(1),messages);assert.equal(sent.messages[0].role,'system');
 assert.equal(sent.messages.filter(m=>m.role==='system').length,1);
 assert.equal(sent.temperature,0.25);assert.equal(sent.max_completion_tokens,1200);assert.equal(sent.reasoning_effort,'low');
 assert.equal(calls,1);assert.match(sent.messages[0].content,/No inventes/);
});
test('public successful response shape and no-store header remain unchanged',async()=>{
 const {response}=await capture();
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{ok:true,message:valid.message,options:[],handoff:false,provider:'groq',degraded:false});
});
test('receipt context and server-owned policy are preserved',async()=>{
 const receipt={reference:'XIC-20261011-1',email:'accepted',expiresAt:Date.now()+60000};
 const {sent}=await capture({}, {messages:[{role:'user',content:'¿Mi solicitud quedó registrada?'}],requestReceipt:receipt,system:'SYNTHETIC_OVERRIDE'});
 assert.match(sent.messages[0].content,/ESTADO CONFIRMADO POR EL SERVIDOR/);
 assert.doesNotMatch(sent.messages[0].content,/SYNTHETIC_OVERRIDE/);
});
test('commercial handoff still uses existing safe server rendering',async()=>{
 const response=await createHandler({env,fetcher:async()=>completion({...valid,message:'Un mensaje comercial.',handoff:true})})(request());
 const answer=await response.json();
 assert.equal(answer.handoff,true);assert.deepEqual(answer.options,[]);assert.match(answer.message,/autoriza su envío/);
});
test('json_validate_failed is not retried or converted to unrestricted text',async()=>{
 let calls=0;const previous=console.warn;const logs=[];console.warn=(...args)=>logs.push(args);
 try{
  const response=await createHandler({env,fetcher:async()=>{calls++;return Response.json({error:{code:'json_validate_failed',type:'invalid_request_error',message:'SYNTHETIC_PRIVATE_ERROR',failed_generation:'SYNTHETIC_PRIVATE_GENERATION'}},{status:400});}})(request());
  assert.equal(calls,1);assert.equal(response.status,502);
  assert.deepEqual(await response.json(),{ok:false,reason:'provider_http',status:400});
  assert.equal(logs[0][1].code,'json_validate_failed');assert.doesNotMatch(JSON.stringify(logs),/SYNTHETIC_PRIVATE/);
 }finally{console.warn=previous;}
});
test('truncated or non-JSON content remains closed, with no second request',async()=>{
 for(const content of ['{"message":"unfinished','plain provider response']){
  let calls=0;
  const response=await createHandler({env,fetcher:async()=>{calls++;return Response.json({choices:[{message:{content},finish_reason:'length'}]});}})(request());
  assert.equal(calls,1);assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false,reason:'provider_schema'});
 }
});
test('refusal or missing content is not exposed as unvalidated chat text',async()=>{
 let calls=0;
 const response=await createHandler({env,fetcher:async()=>{calls++;return Response.json({choices:[{message:{content:null,refusal:'SYNTHETIC_REFUSAL'}}]});}})(request());
 assert.equal(calls,1);assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false,reason:'provider_schema'});
});
test('runtime length and shape checks remain enforced despite strict provider format',async()=>{
 for(const answer of [{...valid,message:'x'.repeat(4001)},{...valid,options:'wrong'},{...valid,handoff:'false'}]){
  const response=await createHandler({env,fetcher:async()=>completion(answer)})(request());
  assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false,reason:'provider_schema'});
 }
});
test('unauthorized requests still do not invoke the provider',async()=>{
 let calls=0;const response=await createHandler({env,fetcher:async()=>{calls++;return completion();}})(request(undefined,false));
 assert.equal(response.status,401);assert.equal(calls,0);
});
