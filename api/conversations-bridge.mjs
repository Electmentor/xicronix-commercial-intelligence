import {timingSafeEqual} from 'node:crypto';
import {createStore,enabled} from '../conversations-store.mjs';
import {readBody,errorResponse} from './conversations.mjs';
export function createHandler({env=process.env,store=createStore(env)}={}) {
 return async req=>{
  if(!enabled(env))return Response.json({ok:false,error:'dev_unavailable'},{status:503});
  if(req.method!=='POST')return new Response(null,{status:405});
  const expected='Bearer '+(env.CONVERSATIONS_BRIDGE_TOKEN||'');const actual=req.headers.get('authorization')||'';
  if(!env.CONVERSATIONS_BRIDGE_TOKEN||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return new Response(null,{status:401});
  try{
   const {action,data}=await readBody(req);
   if(!data||typeof data.thread_id!=='string'||!data.thread_id||data.thread_id.length>200)throw Error('invalid_body');
   // DEV allowlist: no caller can pick a real customer or tenant. Synthetic contact only.
   if(!env.CONVERSATIONS_TEST_CONTACT_ID||!env.CONVERSATIONS_TEST_OWNER_ID||!env.CONVERSATIONS_TEST_ORG_ID)throw Error('forbidden');
   let result;
   if(action==='receive'){
    if(data.consent!==true||typeof data.consent_version!=='string'||!data.consent_version||typeof data.body!=='string'||!data.body.trim()||data.body.length>4000||typeof data.event_key!=='string'||!data.event_key||data.event_key.length>200||!Number.isFinite(Date.parse(data.occurred_at)))throw Error('invalid_body');
    result=await store.command(env.CONVERSATIONS_TEST_ORG_ID,null,'receive',{...data,channel:'nexa',contact_id:env.CONVERSATIONS_TEST_CONTACT_ID,owner_id:env.CONVERSATIONS_TEST_OWNER_ID});
   }else if(action==='poll'||action==='ack'){
    if(action==='ack'&&!/^[0-9a-f-]{36}$/i.test(data.message_id||''))throw Error('invalid_body');
    result=await store.bridge(env.CONVERSATIONS_TEST_ORG_ID,env.CONVERSATIONS_TEST_CONTACT_ID,data.thread_id,action==='ack'?data.message_id:null);
   }else throw Error('invalid_body');
   return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
 };
}
export default {fetch:createHandler()};
