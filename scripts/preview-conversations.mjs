// Local synthetic preview only. Never deployed as an API or connected to production.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createFixture,IDs} from '../tests/helpers/conversations-db.mjs';
import {createHandler} from '../api/conversations.mjs';
import {createHandler as bridgeHandler} from '../api/conversations-bridge.mjs';
const fixture=await createFixture();await fixture.migrate();
const env={VERCEL_ENV:'preview',CONVERSATIONS_DEV_ENABLED:'true',CONVERSATIONS_SUPABASE_URL:'https://rmximatxuaczhpqbcuho.supabase.co',CONVERSATIONS_BRIDGE_TOKEN:'synthetic-only',CONVERSATIONS_TEST_ORG_ID:IDs.org,CONVERSATIONS_TEST_CONTACT_ID:IDs.contact,CONVERSATIONS_TEST_OWNER_ID:IDs.owner};
const api=createHandler({env,store:fixture.store}),bridge=bridgeHandler({env,store:fixture.store});
const page=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>A009 · Preview sintética</title><link rel="stylesheet" href="/conversations.css"><style>body{font:16px system-ui;margin:24px;background:#f7f9fc;color:#152b43}button{cursor:pointer;padding:10px;border-radius:8px;border:1px solid #bac8d9}header{padding:16px;background:#112a47;color:white}textarea{width:90%;min-height:70px}</style><header><h1>Conversaciones · Xicronix</h1><p>SIMULACIÓN LOCAL · datos sintéticos · SQL persistente · sin proveedores externos</p></header><details open><summary>Nexa · visitante sintético</summary><form id="visitor"><label>Consulta<textarea name="message" required>Necesito información de laboratorio</textarea></label><button>Enviar consulta sintética</button></form><button id="poll">Recibir respuestas de Nexa</button><div id="visitorLog" role="log"></div></details><main id="conversationsView"></main><script type="module">
import {createConversationsView} from '/conversations-view.mjs';
const request=async(method,data,id)=>{const r=await fetch('/api/conversations'+(id?'?id='+id:''),{method,headers:{'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
const view=createConversationsView(document.querySelector('main'),{request,contacts:[{id:'${IDs.contact}',first_name:'Contacto sintético'}],users:[{id:'${IDs.owner}',full_name:'Ejecutivo sintético'}]});
const bridge=async(action,data)=>{const r=await fetch('/api/test-bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,data:{thread_id:'browser-synthetic',...data}})});const d=await r.json();if(!r.ok)throw Error(d.error);return d.result;};
document.querySelector('#visitor').onsubmit=async e=>{e.preventDefault();await bridge('receive',{event_key:crypto.randomUUID(),body:new FormData(e.target).get('message'),occurred_at:new Date().toISOString(),consent:true,consent_version:'synthetic-v1',source_page:'/colegios'});document.querySelector('#visitorLog').textContent='Consulta registrada';document.querySelector('#cv-refresh').click();};
document.querySelector('#poll').onclick=async()=>{const r=await bridge('poll',{});for(const m of r.messages){if(!document.getElementById(m.id)){const p=document.createElement('p');p.id=m.id;p.textContent=m.body;document.querySelector('#visitorLog').append(p);}await bridge('ack',{message_id:m.id});}document.querySelector('#cv-refresh').click();};
</script></html>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const part of req)chunks.push(part);
   const isBridge=url.pathname==='/api/test-bridge';
   const request=new Request(url,{method:req.method,headers:{authorization:'Bearer '+(isBridge?'synthetic-only':'admin'),'content-type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await(isBridge?bridge:api)(request);res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());return;
  }
  if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(page);return;}
  if(!['/conversations-reply-attempt.mjs','/conversations-view.mjs','/conversations.css','/domain.mjs'].includes(url.pathname)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'});res.end(await readFile(new URL('..'+url.pathname,import.meta.url)));
 }catch{res.writeHead(500);res.end('Preview failure');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('SYNTHETIC_PREVIEW http://127.0.0.1:'+server.address().port));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();server.closeAllConnections();await fixture.dispose();}
process.once('SIGTERM',()=>stop().catch(()=>process.exitCode=1));
process.once('SIGINT',()=>stop().catch(()=>process.exitCode=1));
