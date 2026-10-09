const DEV_REF='rmximatxuaczhpqbcuho';
const STORAGE_ERRORS=['forbidden','not_found','stale_revision','event_conflict','identity_conflict','closure_blocked','scope_mismatch','takeover_required','follow_up_required','next_action_required'];
function jwtRole(value) {
 // Classification prevents credential mix-ups; Supabase still verifies the JWT.
 try{return typeof value==='string'&&value.split('.').length===3?JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()).role:null;}catch{return null;}
}
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const secretKey=value=>nonempty(value)&&(value.startsWith('sb_secret_')||jwtRole(value)==='service_role');
export function enabled(env) {
 return env.VERCEL_ENV==='preview' && env.CONVERSATIONS_DEV_ENABLED==='true' && env.CONVERSATIONS_SUPABASE_URL===`https://${DEV_REF}.supabase.co`;
}
export function createStore(env,fetcher=fetch) {
 const base=env.CONVERSATIONS_SUPABASE_URL;
 const publicKey=env.CONVERSATIONS_PUBLIC_KEY,serviceKey=env.CONVERSATIONS_SERVICE_KEY;
 async function request(path,headers,body) {
  let code='storage_unavailable';
  try {
   const r=await fetcher(base+path,{method:body?'POST':'GET',redirect:'error',headers:{...headers,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
   if(r.ok)return await r.json();
   const d=await r.json();
   code=STORAGE_ERRORS.find(x=>String(d?.message).includes(x))||code;
  }catch{
   // Transport/JSON errors can contain request headers or response bodies.
   // Do not expose, retain as cause, or log their original message.
  }
  throw Error(code);
 }
 async function userRequest(path,token) {
  if(!nonempty(publicKey)||!(publicKey.startsWith('sb_publishable_')||jwtRole(publicKey)==='anon')||secretKey(publicKey)||publicKey===serviceKey)throw Error('storage_unavailable');
  if(!nonempty(token)||token.startsWith('sb_')||secretKey(token)||token===serviceKey)throw Error('forbidden');
  return request(path,{apikey:publicKey,authorization:'Bearer '+token});
 }
 async function serviceRequest(path,body) {
  if(!secretKey(serviceKey)||serviceKey===publicKey)throw Error('storage_unavailable');
  // Modern secret keys belong only in apikey; legacy service_role JWTs retain
  // their Bearer header for compatibility. Neither header is reused for users.
  const headers={apikey:serviceKey};
  if(!serviceKey.startsWith('sb_secret_'))headers.authorization='Bearer '+serviceKey;
  return request(path,headers,body);
 }
 return {
  async authenticate(token) {
   const u=await userRequest('/auth/v1/user',token);
   if(!u.id)return null;
   const p=await userRequest('/rest/v1/profiles?select=id,organization_id,role&id=eq.'+encodeURIComponent(u.id),token);
   return p[0]||null;
  },
  async list(token) {
   // Explicit fields exclude all cost/margin tables. RLS applies to both queries.
   return userRequest('/rest/v1/commercial_conversations?select=*&order=updated_at.desc&limit=200',token);
  },
  async detail(token,id) {
   const q=encodeURIComponent(id);
   const [conversations,messages,events]=await Promise.all([
    userRequest('/rest/v1/commercial_conversations?select=*&id=eq.'+q,token),
    userRequest('/rest/v1/commercial_messages?select=*&conversation_id=eq.'+q+'&order=occurred_at.asc,id.asc&limit=500',token),
    userRequest('/rest/v1/commercial_conversation_events?select=*&conversation_id=eq.'+q+'&order=occurred_at.asc&limit=500',token)]);
   if(!conversations[0])throw Error('not_found');
   return {conversation:conversations[0],messages,events};
  },
  command(org,actor,action,data) {return serviceRequest('/rest/v1/rpc/conversation_command',{p_org:org,p_actor:actor,p_action:action,p_data:data});},
  bridge(org,contact,thread,ack=null) {return serviceRequest('/rest/v1/rpc/conversation_bridge',{p_org:org,p_contact:contact,p_thread:thread,p_ack:ack});}
 };
}
