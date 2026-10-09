import test from 'node:test';import assert from 'node:assert/strict';
import {createStore,STORAGE_DIAGNOSTICS} from '../conversations-store.mjs';
import {errorResponse} from '../api/conversations.mjs';
import {createHandler} from '../api/conversations-bridge.mjs';
const secret='sb_secret_SYNTHETIC_DO_NOT_EXPOSE',pub='sb_publishable_SYNTHETIC',privateText='SYNTHETIC_PRIVATE_BODY_NOT_FOR_OUTPUT';
const env={VERCEL_ENV:'preview',CONVERSATIONS_DEV_ENABLED:'true',CONVERSATIONS_SUPABASE_URL:'https://rmximatxuaczhpqbcuho.supabase.co',CONVERSATIONS_PUBLIC_KEY:pub,CONVERSATIONS_SERVICE_KEY:secret,CONVERSATIONS_BRIDGE_TOKEN:'synthetic-bridge',CONVERSATIONS_TEST_ORG_ID:'11111111-1111-4111-8111-111111111111',CONVERSATIONS_TEST_OWNER_ID:'22222222-2222-4222-8222-222222222222',CONVERSATIONS_TEST_CONTACT_ID:'33333333-3333-4333-8333-333333333333'};
const request=()=>new Request('https://preview.invalid/api/conversations-bridge',{method:'POST',headers:{authorization:'Bearer synthetic-bridge','content-type':'application/json'},body:JSON.stringify({action:'poll',data:{thread_id:'synthetic-diagnostic'}})});
async function probe(config,fetcher){const response=await createHandler({env:config,store:createStore(config,fetcher)})(request());const body=await response.json();assert.equal(response.status,503);assert.equal(body.ok,false);assert.equal(body.error,'storage_unavailable');assert.deepEqual(Object.keys(body).sort(),['diagnostic_code','error','ok']);for(const value of [secret,pub,privateText,config.CONVERSATIONS_SUPABASE_URL])assert.equal(JSON.stringify(body).includes(value),false);return body.diagnostic_code;}
test('closed service credential configuration categories never fetch or expose values',async()=>{
 const cases=[['service_key_missing',undefined,pub],['service_key_missing',' ',pub],['service_key_public','sb_publishable_other',pub],['service_key_invalid','synthetic-malformed',pub],['service_key_whitespace',secret+'\n',pub],['service_key_conflict',secret,secret]];
 for(const [expected,value,publicKey] of cases){let calls=0;assert.equal(await probe({...env,CONVERSATIONS_SERVICE_KEY:value,CONVERSATIONS_PUBLIC_KEY:publicKey},async()=>{calls++;throw Error(privateText);}),expected);assert.equal(calls,0);}
});
test('HTTP/RPC diagnostic categories are bounded with original message discarded',async()=>{
 const cases=[['storage_auth_rejected',401,'PGRST301'],['storage_auth_rejected',403,null],['storage_permission_denied',403,'42501'],['storage_rpc_missing',404,'PGRST202'],['storage_rpc_missing',500,'42883'],['storage_schema_mismatch',500,'42703'],['storage_schema_mismatch',500,'42P01'],['storage_parameters_invalid',400,'22P02'],['storage_parameters_invalid',400,'22023'],['storage_rate_limited',429,null],['storage_http_error',502,null]];
 for(const [expected,status,code] of cases)assert.equal(await probe(env,async()=>Response.json({code,message:privateText,details:secret,hint:env.CONVERSATIONS_SUPABASE_URL},{status})),expected);
 assert.equal(await probe(env,async()=>new Response(privateText,{status:401})),'storage_auth_rejected');
});
test('network timeout and response decoding remain sanitized',async()=>{
 assert.equal(await probe(env,async()=>{throw Object.assign(Error(privateText),{name:'TimeoutError',cause:secret});}),'storage_timeout');
 assert.equal(await probe(env,async()=>{throw Error(secret+privateText);}),'storage_network');
 assert.equal(await probe(env,async()=>new Response(secret+privateText,{status:200})),'storage_invalid_json');
});
test('diagnostic cannot be injected by arbitrary error properties or upstream JSON',async()=>{
 const fake=Object.assign(Error('storage_unavailable'),{diagnostic_code:secret,diagnostic:'service_key_missing',cause:privateText});
 assert.deepEqual(await errorResponse(fake).json(),{ok:false,error:'storage_unavailable'});
 assert.equal(await probe(env,async()=>Response.json({diagnostic_code:'service_key_missing',code:secret,message:privateText},{status:500})),'storage_http_error');
});
test('domain errors retain original status and no storage diagnostic',async()=>{
 const config=env,fetcher=async()=>Response.json({message:'not_found',details:secret},{status:400});
 const response=await createHandler({env:config,store:createStore(config,fetcher)})(request());assert.equal(response.status,404);assert.deepEqual(await response.json(),{ok:false,error:'not_found'});
});
test('production gate blocks before storage classification or fetch',async()=>{
 let calls=0;const config={...env,VERCEL_ENV:'production'};const response=await createHandler({env:config,store:createStore(config,async()=>{calls++;throw Error(secret);})})(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,error:'dev_unavailable'});assert.equal(calls,0);
});
test('wire category contract is fixed and contains no runtime strings',()=>{assert.deepEqual([...STORAGE_DIAGNOSTICS].sort(),['service_key_missing','service_key_public','service_key_invalid','service_key_whitespace','service_key_conflict','storage_timeout','storage_network','storage_auth_rejected','storage_permission_denied','storage_rpc_missing','storage_parameters_invalid','storage_rate_limited','storage_http_error','storage_invalid_json','storage_schema_mismatch'].sort());});
