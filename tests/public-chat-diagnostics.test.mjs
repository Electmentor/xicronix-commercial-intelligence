import test from 'node:test';
import assert from 'node:assert/strict';
import {publicChatFailureDiagnostic} from '../public-chat-diagnostics.mjs';
import {createHandler} from '../api/public-chat.mjs';

// No real network, secrets, customers or provider requests in this suite.
globalThis.fetch = () => { throw new Error('NETWORK_DISABLED_FOR_TESTS'); };
const RID = 'req_' + '0'.repeat(26);
const MODEL = 'openai/gpt-oss-120b';
const sample = (error, headers = {}) => Response.json({error}, {status:400,headers:{'x-request-id':RID,...headers}});
const secret = 'SYNTHETIC_SECRET_DO_NOT_LOG';
const personal = 'SYNTHETIC_PRIVATE_TEXT_DO_NOT_LOG';

test('400 records only the explicit diagnostic keys', async () => {
 const result = await publicChatFailureDiagnostic(sample({code:'json_validate_failed',type:'invalid_request_error',message:personal,failed_generation:personal,authorization:secret}),MODEL);
 assert.deepEqual(result, {version:1,provider:'groq',status:400,code:'json_validate_failed',type:'invalid_request_error',request_id:RID,model:MODEL,body_state:'json'});
 assert(!JSON.stringify(result).includes(personal));
 assert(!JSON.stringify(result).includes(secret));
});
test('unknown code, type and model are reduced to other', async () => {
 const result = await publicChatFailureDiagnostic(sample({code:secret,type:personal}),secret);
 assert.equal(result.code,'other'); assert.equal(result.type,'other'); assert.equal(result.model,'other');
 assert(!JSON.stringify(result).includes(secret)); assert(!JSON.stringify(result).includes(personal));
});
test('structured values cannot pass allowlists', async () => {
 const result = await publicChatFailureDiagnostic(sample({code:{secret},type:[personal]}),{secret});
 assert.equal(result.code,'other'); assert.equal(result.type,'other'); assert.equal(result.model,'other');
});
test('missing error fields become null', async () => {
 const result = await publicChatFailureDiagnostic(Response.json({ok:false},{status:502}),MODEL);
 assert.equal(result.code,null); assert.equal(result.type,null); assert.equal(result.request_id,null);
});
test('unrecognized request IDs are discarded', async () => {
 for (const value of [secret, 'req_short', 'req_'+'a'.repeat(27), 'Bearer '+secret, 'req_'+'A'.repeat(26)]) {
  const result = await publicChatFailureDiagnostic(sample({}, {'x-request-id':value}),MODEL);
  assert.equal(result.request_id,null); assert(!JSON.stringify(result).includes(secret));
 }
});
test('non-JSON body is not logged', async () => {
 const result = await publicChatFailureDiagnostic(new Response('<html>'+personal+'</html>',{status:502}),MODEL);
 assert.equal(result.body_state,'non_json'); assert(!JSON.stringify(result).includes(personal));
});
test('empty body has bounded fixed classification', async () => {
 const result = await publicChatFailureDiagnostic(new Response(null,{status:503}),MODEL);
 assert.equal(result.body_state,'empty');
});
test('oversized body is rejected without logging it', async () => {
 let cancelled=false;
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(secret.repeat(1000)));},cancel(){cancelled=true;}});
 const result=await publicChatFailureDiagnostic(new Response(body,{status:400}),MODEL);
 assert.equal(result.body_state,'too_large'); assert.equal(cancelled,true);
 assert(!JSON.stringify(result).includes(secret));
});
test('stalled body is bounded at 250 ms and canceled', async () => {
 let cancelled=false;
 const body=new ReadableStream({cancel(){cancelled=true;}});
 const result=await publicChatFailureDiagnostic(new Response(body,{status:400}),MODEL);
 assert.equal(result.body_state,'timeout'); assert.equal(cancelled,true);
});
test('read failures contain no exception text', async () => {
 const body=new ReadableStream({start(controller){controller.error(new Error(secret));}});
 const result=await publicChatFailureDiagnostic(new Response(body,{status:502}),MODEL);
 assert.equal(result.body_state,'unreadable'); assert(!JSON.stringify(result).includes(secret));
});
test('HTTP status and recognized error classification stay independent', async () => {
 for (const status of [400,401,403,429,500,502,503,504]) {
  const result=await publicChatFailureDiagnostic(Response.json({error:{type:'rate_limit_error',code:'rate_limit_exceeded'}},{status}),MODEL);
  assert.equal(result.status,status); assert.equal(result.type,'rate_limit_error'); assert.equal(result.code,'rate_limit_exceeded');
 }
});
test('second reviewed model is logged; arbitrary env values are not', async () => {
 const result=await publicChatFailureDiagnostic(sample({}),'openai/gpt-oss-20b');
 assert.equal(result.model,'openai/gpt-oss-20b');
});

let client=8000;
function request({authorized=true}={}) {
 return new Request('https://example.test/api/public-chat',{method:'POST',headers:{authorization:authorized?'Bearer synthetic-regression':'Bearer invalid','x-chat-client':(++client).toString(16).padStart(64,'0')},body:JSON.stringify({messages:[{role:'user',content:'Prueba sintética sin datos personales.'}]})});
}
const env={GROQ_API_KEY:'synthetic',PUBLIC_CHAT_BRIDGE_TOKEN:'synthetic-regression'};
test('handler 400 preserves the existing public response and has one provider attempt', async () => {
 const logs=[]; const previous=console.warn; console.warn=(...args)=>logs.push(args);
 try {
  let calls=0;
  const handler=createHandler({env,fetcher:async(url,options)=>{
   calls++; assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   assert.equal(JSON.parse(options.body).model,MODEL);
   return sample({code:'json_validate_failed',type:'invalid_request_error',message:personal,failed_generation:secret});
  }});
  const candidateResponse=await handler(request());
  assert.equal(candidateResponse.status,502);
  assert.equal(candidateResponse.headers.get('cache-control'),'no-store');
  assert.deepEqual(await candidateResponse.json(),{ok:false,reason:'provider_http',status:400});
  assert.equal(calls,1);
  const record=logs.find(line=>typeof line[1]==='object');
  assert.equal(record[0],'PUBLIC_CHAT_PROVIDER_FAILURE');
  assert.equal(record[1].code,'json_validate_failed');
  assert(!JSON.stringify(logs).includes(personal)); assert(!JSON.stringify(logs).includes(secret));
 } finally {console.warn=previous;}
});
test('handler success contract is unchanged and adds no diagnostic log', async () => {
 const logs=[]; const previous=console.warn; console.warn=(...args)=>logs.push(args);
 const providerResult=()=>Response.json({choices:[{message:{content:JSON.stringify({message:'Un circuito une una fuente con una carga.',options:[],handoff:false})}}]});
 try {
  const candidateResponse=await createHandler({env,fetcher:async()=>providerResult()})(request());
  assert.equal(candidateResponse.status,200);
  assert.deepEqual(await candidateResponse.json(),{ok:true,message:'Un circuito une una fuente con una carga.',options:[],handoff:false,provider:'groq',degraded:false});
  assert.deepEqual(logs,[]);
 } finally {console.warn=previous;}
});
test('unauthorized request does not invoke the provider', async () => {
 let calls=0;
 const result=await createHandler({env,fetcher:async()=>{calls++;throw Error('unreachable');}})(request({authorized:false}));
 assert.equal(result.status,401); assert.equal(calls,0);
});
test('logging failure cannot alter public error response', async () => {
 const previous=console.warn; console.warn=()=>{throw Error(secret);};
 try {
  const result=await createHandler({env,fetcher:async()=>sample({code:'json_validate_failed',type:'invalid_request_error'})})(request());
  assert.equal(result.status,502);
  assert.deepEqual(await result.json(),{ok:false,reason:'provider_http',status:400});
 } finally {console.warn=previous;}
});

test('minimal existing error mocks preserve their public contract', async () => {
 const previous=console.warn; console.warn=()=>{};
 try {
  for (const providerResponse of [
   {ok:false,status:400},
   {ok:false,status:400,headers:{get(){throw Error(secret);}}},
   {ok:false,status:400,get headers(){throw Error(secret);},get body(){throw Error(personal);}}
  ]) {
   const result=await createHandler({env,fetcher:async()=>providerResponse})(request());
   assert.equal(result.status,502);
   assert.deepEqual(await result.json(),{ok:false,reason:'provider_http',status:400});
  }
 } finally {console.warn=previous;}
});

test('diagnostic exceptions cannot change the public response or log exception text', async () => {
 const previous=console.warn; const logs=[]; console.warn=(...args)=>logs.push(args);
 try {
  let reads=0;
  const providerResponse={ok:false,get status(){if (++reads===2) throw Error(secret); return 400;}};
  const result=await createHandler({env,fetcher:async()=>providerResponse})(request());
  assert.equal(result.status,502);
  assert.deepEqual(await result.json(),{ok:false,reason:'provider_http',status:400});
  assert(!JSON.stringify(logs).includes(secret));
 } finally {console.warn=previous;}
});

