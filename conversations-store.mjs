const DEV_REF='rmximatxuaczhpqbcuho';
export function enabled(env) {
 return env.VERCEL_ENV==='preview' && env.CONVERSATIONS_DEV_ENABLED==='true' && env.CONVERSATIONS_SUPABASE_URL===`https://${DEV_REF}.supabase.co`;
}
export function createStore(env,fetcher=fetch) {
 const base=env.CONVERSATIONS_SUPABASE_URL;
 async function request(path,token,body) {
  const r=await fetcher(base+path,{method:body?'POST':'GET',redirect:'error',headers:{apikey:env.CONVERSATIONS_PUBLIC_KEY,authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
  if(!r.ok) {const d=await r.json().catch(()=>({}));throw Error(['forbidden','not_found','stale_revision','event_conflict','identity_conflict','closure_blocked','scope_mismatch','takeover_required'].find(x=>String(d.message).includes(x))||'storage_unavailable');}
  return r.json();
 }
 return {
  async authenticate(token) {
   const u=await request('/auth/v1/user',token);
   if(!u.id)return null;
   const p=await request('/rest/v1/profiles?select=id,organization_id,role&id=eq.'+encodeURIComponent(u.id),token);
   return p[0]||null;
  },
  async list(token) {
   // Explicit fields exclude all cost/margin tables. RLS applies to both queries.
   return request('/rest/v1/commercial_conversations?select=*&order=updated_at.desc&limit=200',token);
  },
  async detail(token,id) {
   const q=encodeURIComponent(id);
   const [conversations,messages,events]=await Promise.all([
    request('/rest/v1/commercial_conversations?select=*&id=eq.'+q,token),
    request('/rest/v1/commercial_messages?select=*&conversation_id=eq.'+q+'&order=occurred_at.asc,id.asc&limit=500',token),
    request('/rest/v1/commercial_conversation_events?select=*&conversation_id=eq.'+q+'&order=occurred_at.asc&limit=500',token)]);
   if(!conversations[0])throw Error('not_found');
   return {conversation:conversations[0],messages,events};
  },
  command(org,actor,action,data) {return request('/rest/v1/rpc/conversation_command',env.CONVERSATIONS_SERVICE_KEY,{p_org:org,p_actor:actor,p_action:action,p_data:data});},
  bridge(org,contact,thread,ack=null) {return request('/rest/v1/rpc/conversation_bridge',env.CONVERSATIONS_SERVICE_KEY,{p_org:org,p_contact:contact,p_thread:thread,p_ack:ack});}
 };
}
