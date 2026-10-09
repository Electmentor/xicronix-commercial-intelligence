const ID='8d5b1ebb-791a-46c9-ae64-6b2a9f65eea7';
const OWNER='3c535c00-3c3d-4fc1-b410-e8b8ce8a50da';
const endpoint='/api/conversations-dev-demo';
const $=id=>document.getElementById(id);
let current,busy=false;
const attemptKey='xicronix-dev-demo-attempt:'+ID;
function message(text){$('result').textContent=text;}
async function api(action,data){
 const res=await fetch(endpoint+(action?'':'?id='+ID),action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:{conversation_id:ID,revision:current.revision,...data}})}:{cache:'no-store'});
 const value=await res.json();if(!res.ok||!value.ok)throw Error(value.error||'No se pudo comprobar el resultado');return value;
}
async function refresh(){
 const value=await api();current=value.conversation;
 $('summary').textContent=`Caso sintético · ${current.status} · ${current.attention} · revisión ${current.revision} · responsable de prueba asignado`;
 $('messages').replaceChildren(...value.messages.map(m=>{const el=document.createElement('article');el.textContent=`${m.direction==='in'?'Consulta':'Respuesta'} · ${m.status}\n${m.body}`;return el;}));
 $('status').value=current.status==='new'?'active':current.status;
 $('next').value=current.next_action||'';
 $('follow').value=current.follow_up_at?new Date(new Date(current.follow_up_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 $('dependency').checked=!!current.dependency_pending;$('reason').value=current.closed_reason||'';$('evidence').value=current.closure_evidence||'';
 $('audit').textContent=JSON.stringify(value,null,2);
 return value;
}
async function run(fn){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await fn();}catch(e){message('No completado: '+e.message);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}}
$('refresh').onclick=()=>run(()=>refresh());
$('takeover').onclick=()=>run(async()=>{await api('takeover',{});await refresh();message('Control de prueba registrado.');});
$('send').onclick=()=>run(async()=>{
 const body=$('reply').value.trim();if(!body)throw Error('Escribe una respuesta sintética');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let attempt=JSON.parse(localStorage.getItem(attemptKey)||'null');
 if(attempt&&attempt.digest!==digest)throw Error('Hay un intento incierto con otro texto; comprueba primero el historial');
 attempt||={digest,event_key:crypto.randomUUID()};localStorage.setItem(attemptKey,JSON.stringify(attempt));
 const response=await api('reply',{body,event_key:attempt.event_key});
 const value=await refresh();const saved=value.messages.find(m=>m.event_key===attempt.event_key&&m.body===body);
 if(!saved)throw Error('Respuesta sin comprobante persistido; conserva el texto para reintentar');
 localStorage.removeItem(attemptKey);$('reply').value='';message('Respuesta persistida: '+saved.status+'. La entrega se comprueba por separado.');
});
$('save').onclick=()=>run(async()=>{const follow=$('follow').value;await api('update',{owner_id:OWNER,status:$('status').value,next_action:$('next').value,follow_up_at:follow?new Date(follow).toISOString():null,dependency_pending:$('dependency').checked,closed_reason:$('reason').value,closure_evidence:$('evidence').value,resolution_confirmed:$('confirmed').checked});await refresh();message('Seguimiento o cierre guardado y comprobado.');});
run(()=>refresh());

