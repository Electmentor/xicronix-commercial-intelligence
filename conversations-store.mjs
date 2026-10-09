const DEV_REF='rmximatxuaczhpqbcuho';
const STORAGE_ERRORS=['forbidden','not_found','stale_revision','event_conflict','identity_conflict','closure_blocked','scope_mismatch','takeover_required','follow_up_required','next_action_required'];
// Diagnostic categories carry no upstream text, URL, credentials or identifiers.
export const STORAGE_DIAGNOSTICS=Object.freeze(['service_key_missing','service_key_public','service_key_invalid','service_key_whitespace','service_key_conflict','storage_timeout','storage_network','storage_auth_rejected','storage_permission_denied','storage_rpc_missing','storage_parameters_invalid','storage_rate_limited','storage_http_error','storage_invalid_json','storage_schema_mismatch']);
const diagnostics=new WeakMap();
function storageFailure(code){const error=Error('storage_unavailable');diagnostics.set(error,code);return error;}
export const storageDiagnosticCode=error=>diagnostics.get(error);
function httpDiagnostic(status,code){
 if(code==='42501')return 'storage_permission_denied';
 if(['42703','42P01'].includes(code))return 'storage_schema_mismatch';
 if(['PGRST202','42883'].includes(code))return 'storage_rpc_missing';
 if(['22P02','22023'].includes(code))return 'storage_parameters_invalid';
 if(status===401||status===403)return 'storage_auth_rejected';
 if(status===429)return 'storage_rate_limited';
 return 'storage_http_error';
}
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
  let response;
  try{
   response=await fetcher(base+path,{method:body?'POST':'GET',redirect:'error',headers:{...headers,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
  }catch(error){
   throw storageFailure(['TimeoutError','AbortError'].includes(error?.name)?'storage_timeout':'storage_network');
  }
  let data;
  try{data=await response.json();}catch{
   throw storageFailure(response.ok?'storage_invalid_json':httpDiagnostic(response.status));
  }
  if(response.ok)return data;
  const known=STORAGE_ERRORS.find(code=>typeof data?.message==='string'&&data.message.includes(code));
  if(known)throw Error(known);
  throw storageFailure(httpDiagnostic(response.status,data?.code));
 }
 async function userRequest(path,token) {
  if(!nonempty(publicKey)||!(publicKey.startsWith('sb_publishable_')||jwtRole(publicKey)==='anon')||secretKey(publicKey)||publicKey===serviceKey)throw Error('storage_unavailable');
  if(!nonempty(token)||token.startsWith('sb_')||secretKey(token)||token===serviceKey)throw Error('forbidden');
  return request(path,{apikey:publicKey,authorization:'Bearer '+token});
 }
 async function serviceRequest(path,body) {
  if(!nonempty(serviceKey))throw storageFailure('service_key_missing');
  if(serviceKey!==serviceKey.trim())throw storageFailure('service_key_whitespace');
  if(serviceKey===publicKey)throw storageFailure('service_key_conflict');
  if(serviceKey.startsWith('sb_publishable_')||jwtRole(serviceKey)==='anon')throw storageFailure('service_key_public');
  if(!secretKey(serviceKey))throw storageFailure('service_key_invalid');
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
