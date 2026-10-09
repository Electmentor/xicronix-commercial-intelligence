import {createHandler,errorResponse} from './conversations.mjs';
import {createStore,enabled} from '../conversations-store.mjs';

export const DEMO=Object.freeze({
 origin:'https://xicronix-commercial-intelligence-git-work-a009-116bc1-xicronix.vercel.app',
 branch:'work/a009-conversations-dev-20261008',
 conversation:'8d5b1ebb-791a-46c9-ae64-6b2a9f65eea7',
 org:'823522c3-930f-44d4-9c22-26efee6da960',
 contact:'f449b8d2-c00a-4dc1-811a-8304d83daeda',
 owner:'3c535c00-3c3d-4fc1-b410-e8b8ce8a50da'
});
const deny=()=>Response.json({ok:false,error:'dev_demo_unavailable'},{status:403,headers:{'Cache-Control':'no-store'}});
export function demoEnabled(env,req){
 return enabled(env)&&env.VERCEL_GIT_COMMIT_REF===DEMO.branch&&
  env.CONVERSATIONS_TEST_ORG_ID===DEMO.org&&env.CONVERSATIONS_TEST_CONTACT_ID===DEMO.contact&&
  env.CONVERSATIONS_TEST_OWNER_ID===DEMO.owner&&new URL(req.url).origin===DEMO.origin;
}
export function createDemoHandler({env=process.env,fetcher=fetch,store=createStore(env,fetcher)}={}){
 async function read(path){
  const key=env.CONVERSATIONS_SERVICE_KEY||'';
  let legacy=false;try{legacy=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{}
  if(key!==key.trim()||(!key.startsWith('sb_secret_')&&!legacy))throw Error('forbidden');
  const headers={apikey:key};if(legacy)headers.authorization='Bearer '+key;
  const res=await fetcher(env.CONVERSATIONS_SUPABASE_URL+'/rest/v1/'+path,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('storage_unavailable');return res.json();
 }
 async function conversation(){
  const rows=await read('commercial_conversations?select=*&id=eq.'+DEMO.conversation+'&organization_id=eq.'+DEMO.org+'&contact_id=eq.'+DEMO.contact);
  if(rows.length!==1||rows[0].owner_user_id!==DEMO.owner)throw Error('forbidden');return rows[0];
 }
 const scoped={
  async authenticate(){
   await conversation();
   const rows=await read('profiles?select=id,organization_id,role&id=eq.'+DEMO.owner+'&organization_id=eq.'+DEMO.org);
   return rows[0];
  },
  async list(){return [await conversation()];},
  async detail(token,id){
   if(id!==DEMO.conversation)throw Error('forbidden');
   const c=await conversation();
   const [messages,events]=await Promise.all([
    read('commercial_messages?select=*&conversation_id=eq.'+DEMO.conversation+'&order=created_at.asc,id.asc&limit=500'),
    read('commercial_conversation_events?select=*&conversation_id=eq.'+DEMO.conversation+'&order=occurred_at.asc&limit=500')]);
   return {conversation:c,messages,events};
  },
  async command(org,actor,action,data){
   if(org!==DEMO.org||actor!==DEMO.owner||data.conversation_id!==DEMO.conversation||
    (data.owner_id!==undefined&&data.owner_id!==DEMO.owner)||Object.keys(data).some(k=>!['conversation_id','revision','owner_id','status','next_action','follow_up_at','dependency_pending','closure_evidence','closed_reason','resolution_confirmed','body','event_key'].includes(k)))throw Error('forbidden');
   await conversation();return store.command(org,actor,action,data);
  }
 };
 const handle=createHandler({env,store:scoped});
 return async req=>{
  if(!demoEnabled(env,req)||!['GET','POST'].includes(req.method))return deny();
  const site=req.headers.get('sec-fetch-site');
  if(site&&site!=='same-origin'&&site!=='none')return deny();
  if(req.method==='POST'&&(req.headers.get('origin')!==DEMO.origin||!req.headers.get('content-type')?.startsWith('application/json')))return deny();
  try{
   const headers=new Headers(req.headers);headers.set('authorization','Bearer synthetic-demo-only');
   const response=await handle(new Request(req,{headers}));
   response.headers.set('X-Robots-Tag','noindex, nofollow');
   response.headers.set('Content-Security-Policy',"frame-ancestors 'none'");
   return response;
  }catch(e){return errorResponse(e);}
 };
}
export default {fetch:createDemoHandler()};

