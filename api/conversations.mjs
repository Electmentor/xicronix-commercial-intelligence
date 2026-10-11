import {createStore,enabled,storageDiagnosticCode,STORAGE_DIAGNOSTICS} from '../conversations-store.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function readBody(req) {
 const reader=req.body?.getReader();if(!reader)throw Error('invalid_body');let n=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>20000){await reader.cancel();throw Error('invalid_body');}chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString());
}
export function errorResponse(error) {
 const code=String(error.message);const known={forbidden:403,not_found:404,stale_revision:409,event_conflict:409,identity_conflict:409,closure_blocked:409,scope_mismatch:400,takeover_required:409,follow_up_required:400,next_action_required:400,invalid_body:400};
 const diagnostic=storageDiagnosticCode(error);
 return Response.json({ok:false,error:known[code]?code:'storage_unavailable',...(!known[code]&&STORAGE_DIAGNOSTICS.includes(diagnostic)?{diagnostic_code:diagnostic}:{})},{status:known[code]||503,headers:{'Cache-Control':'no-store'}});
}
export function createHandler({env=process.env,store=createStore(env)}={}) {
 return async req=>{
  const response=d=>Response.json(d,{headers:{'Cache-Control':'no-store'}});
  if(!enabled(env))return Response.json({ok:false,error:'dev_unavailable'},{status:503});
  if(!['GET','POST'].includes(req.method))return new Response(null,{status:405});
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token)return new Response(null,{status:401});
  try {
   const actor=await store.authenticate(token);
   if(!actor?.organization_id||!['ADMIN','MANAGER','SALES'].includes(actor.role))throw Error('forbidden');
   if(req.method==='GET'){
    const id=new URL(req.url).searchParams.get('id');
    if(id&&!uuid(id))throw Error('invalid_body');
    return response({ok:true,...(id?await store.detail(token,id):{conversations:await store.list(token)})});
   }
   const {action,data}=await readBody(req);
   if(!['takeover','supervise','update','reply'].includes(action)||!data||!uuid(data.conversation_id)||!Number.isInteger(data.revision))throw Error('invalid_body');
   if(action==='reply'&&(typeof data.body!=='string'||!data.body.trim()||data.body.length>4000||!uuid(data.event_key)))throw Error('invalid_body');
   if(action==='update'&&(!uuid(data.owner_id)||!['new','active','waiting','resolved','closed'].includes(data.status)||typeof data.next_action!=='string'||data.next_action.length>1000))throw Error('invalid_body');
   if(action==='update'&&((data.resolution_confirmed!==undefined&&typeof data.resolution_confirmed!=='boolean')||(data.follow_up_at&&!Number.isFinite(Date.parse(data.follow_up_at)))||(data.dependency_pending!==undefined&&typeof data.dependency_pending!=='boolean')||(data.closure_evidence!==undefined&&(typeof data.closure_evidence!=='string'||data.closure_evidence.length>2000))||(data.closed_reason!==undefined&&(typeof data.closed_reason!=='string'||data.closed_reason.length>1000))))throw Error('invalid_body');
   // Actor and tenant are derived from verified Auth, never from the request payload.
   return response({ok:true,result:await store.command(actor.organization_id,actor.id,action,data)});
  }catch(e){return errorResponse(e);}
 };
}
export default {fetch:createHandler()};
