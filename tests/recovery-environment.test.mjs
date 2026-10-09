import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createHandler} from '../api/conversations-config.mjs';
const source=readFileSync(new URL('../recuperar.js',import.meta.url),'utf8');
const devOrigin='https://xicronix-commercial-intelligence-gg703b5jy-xicronix.vercel.app';
const devUrl='https://rmximatxuaczhpqbcuho.supabase.co';
const redirect='https://xicronix-commercial-intelligence-git-work-a009-116bc1-xicronix.vercel.app/';
async function boot(origin,config={ok:true,url:devUrl,key:'sb_publishable_synthetic',recoveryRedirectUrl:redirect}){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,textContent:'',focus(){}});return nodes.get(id);};let created=[],verified=[];
 const createClient=(url,key,options)=>{
  created.push({url,key,options});
  return {auth:{verifyOtp:async data=>{verified.push(data);return {error:{}};}}};
 };
 await vm.runInNewContext(source,{
  document:{getElementById:node},
  location:{origin,hostname:new URL(origin).hostname,hash:'',pathname:'/recuperar.html',search:''},
  history:{replaceState(){}},URL,URLSearchParams,AbortSignal,
  fetch:async()=>({ok:!!config.ok,json:async()=>config}),
  window:{supabase:{createClient}}
 });
 return {nodes,node,created,verified};
}
test('recovery config exists only on isolated enabled DEV and publishes canonical DEV redirect',async()=>{
 const env={VERCEL_ENV:'preview',CONVERSATIONS_DEV_ENABLED:'true',CONVERSATIONS_SUPABASE_URL:devUrl,CONVERSATIONS_PUBLIC_KEY:'sb_publishable_synthetic'};
 const result=await createHandler(env)();assert.equal(result.status,200);assert.equal((await result.json()).recoveryRedirectUrl,redirect);
 assert.equal((await createHandler({...env,VERCEL_ENV:'production'})()).status,503);
});
test('alternative DEV recovery uses DEV Auth only and rejects a PROD link before verifyOtp',async()=>{
 const h=await boot(devOrigin);assert.equal(h.created[0].url,devUrl);assert.equal(h.created[0].options.auth.storageKey,'xicronix-recovery-dev-session');
 h.node('recoveryLink').value='https://qzfprdhmcaucqcdqgqiz.supabase.co/auth/v1/verify?type=recovery&token='+'a'.repeat(64);
 await h.node('continue').onclick();assert.equal(h.verified.length,0);
 h.node('recoveryLink').value=devUrl+'/auth/v1/verify?type=recovery&token='+'a'.repeat(64);
 await h.node('continue').onclick();assert.equal(h.verified.length,1);
});
test('alternative DEV recovery cannot fall back when config is missing or wrong',async()=>{
 for(const config of [{ok:false},{ok:true,url:'https://qzfprdhmcaucqcdqgqiz.supabase.co',key:'public',recoveryRedirectUrl:redirect},{ok:true,url:devUrl,key:'public',recoveryRedirectUrl:'https://xicronix-commercial-intelligence.vercel.app/'}]){
  const h=await boot(devOrigin,config);assert.equal(h.created.length,0);assert.equal(h.node('continue').disabled,true);assert.match(h.node('status').textContent,/No se verificará/);
 }
});
test('alternative recovery rejects malformed DEV origins before creating any Auth client',async()=>{
 for(const origin of [devOrigin.replace('https:','http:'),devOrigin+':444',devOrigin+'.evil.test',devOrigin.replace('https://','https://user@')]){const h=await boot(origin);assert.equal(h.created.length,0);}
});
test('production alternative recovery retains its original Auth and in-memory namespace',async()=>{
 const h=await boot('https://xicronix-commercial-intelligence.vercel.app');assert.equal(h.created[0].url,'https://qzfprdhmcaucqcdqgqiz.supabase.co');assert.equal(h.created[0].options.auth.storageKey,'xicronix-recovery-session');assert.equal(h.created[0].options.auth.persistSession,false);
});
