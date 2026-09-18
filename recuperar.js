/* Verifies only server-issued, one-time recovery tokens with Supabase Auth. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const authHost = 'qzfprdhmcaucqcdqgqiz.supabase.co';
 let token = new URLSearchParams(location.hash.slice(1)).get('recovery_token_hash') || '';
 if (location.hash) history.replaceState(null, '', location.pathname + location.search);
 $('paste').hidden = !!token;
 let accountId = null;
 let busy = false;
 const client = window.supabase.createClient('https://' + authHost, 'sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK', {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'xicronix-recovery-session'}});
 const message = (text,error=false) => { $('status').textContent=text; $('status').className=error?'error':''; };
 function parseLink(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== authHost || url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== 'recovery') throw new Error('invalid_link');
  return url.searchParams.get('token') || '';
 }
 $('continue').onclick = async () => {
  if(busy)return;
  busy=true;$('continue').disabled=true;message('Verificando el enlace…');
  try {
   if(!token) token=parseLink($('recoveryLink').value.trim());
   $('recoveryLink').value='';
   if(!/^[a-f0-9]{40,128}$/i.test(token))throw new Error('invalid_link');
   const submittedToken=token;token='';
   const {data,error}=await client.auth.verifyOtp({token_hash:submittedToken,type:'recovery'});
   if(error || !data.session || !data.user) throw new Error('expired_link');
   accountId=data.user.id;$('email').value=data.user.email||'';
   $('verify').hidden=true;$('reset').hidden=false;$('title').textContent='Elige tu nueva contraseña';message('');$('password').focus();
  }catch{
   token='';$('paste').hidden=false;
   message('No se pudo verificar el enlace. Puede haber vencido o haber sido utilizado. Solicita uno nuevo desde «Olvidé mi contraseña» y pega aquí la dirección del botón recibido.',true);
  }finally{busy=false;$('continue').disabled=false;}
 };
 $('confirm').oninput = () => $('confirm').setCustomValidity('');
 $('reset').onsubmit = async e => {
  e.preventDefault();if(busy || !$('reset').reportValidity())return;
  if($('password').value!==$('confirm').value){$('confirm').setCustomValidity('Las contraseñas no coinciden.');$('confirm').reportValidity();return;}
  busy=true;$('save').disabled=true;message('Guardando la nueva contraseña…');
  try {
   const verified=await client.auth.getUser();
   if(verified.error || !accountId || verified.data.user?.id!==accountId)throw new Error('session_expired');
   const {error}=await client.auth.updateUser({password:$('password').value});
   if(error){message(error.code==='same_password'?'Elige una contraseña diferente a la anterior.':error.code==='weak_password'?'Elige una contraseña más segura, de al menos 12 caracteres.':'No se pudo guardar la contraseña. Revisa tu conexión e inténtalo nuevamente.',true);return;}
   $('password').value='';$('confirm').value='';accountId=null;
   try{await client.auth.signOut({scope:'local'});}catch{/* Recovery session is in memory only. */}
   $('reset').hidden=true;$('done').hidden=false;$('title').textContent='Acceso recuperado';message('');
  }catch{message('La sesión de recuperación venció o no pudo verificarse. Solicita un nuevo enlace antes de cambiar la contraseña.',true);}
  finally{busy=false;$('save').disabled=false;}
 };
})();
