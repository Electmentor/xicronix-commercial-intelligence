import {buildCaseReply,caseReplyContext} from '../case-reply.mjs';
// Exercises the production functions in an isolated VM. This is NOT browser/render QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity,caseOutboundStatus} from '../case-attention.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const names=['smartMailDraftForLead','openSmartMailDraft','rememberSmartMailDraft','toggleSmartMaterial','smartMailFeedback','setSmartMailBusy','smartMailAttempt','sendSmartMailDirect','unconfirmedMailForLead','openSmartMailInZoho'];
function extract(name){const re=new RegExp('^(?:async )?function '+name+'\\(','m');const m=re.exec(source);assert.ok(m,`Missing ${name}`);const end=source.slice(m.index+1).search(/\n(?:async )?function /);return source.slice(m.index,end<0?source.length:m.index+1+end);}
const functions=names.map(extract).join('\n');
const LEAD='33333333-3333-4333-8333-333333333333',DOC='55555555-5555-4555-8555-555555555551',DOC2='55555555-5555-4555-8555-555555555552';
const accepted={data:{ok:true,status:'SENT',provider_message_id:'synthetic-provider-1',delivery_status:'UNCONFIRMED',reply_to_inbox_id:null},error:null};
const capability={data:{contract_version:3,attachments:true,idempotency:true,reply_binding:true},error:null};
const clone=v=>JSON.parse(JSON.stringify(v));
function harness({responses=[],capabilities=capability,confirm=true,reloadError=false,crypto=webcrypto,invokeHook=null,clipboardHook=null,handoffHook=null}={}){
 const nodes=new Map(),materials=[],storage=new Map(),calls=[],notices=[],detailCalls=[],state={confirmed:[],reloads:0,clipboard:[],handoffs:[],opened:[]};
 const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
 class Node{
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;this.children=[];this.dataset={};this.className='';this._html='';const self=this;this.classList={contains:c=>self.className.split(' ').includes(c),toggle(c){self.className=this.contains(c)?self.className.replace(c,'').trim():self.className+' '+c;},add(c){if(!this.contains(c))self.className+=' '+c;}};}
  set innerHTML(html){this._html=html;if(this.id!=='smartMailContent')return;materials.length=0;for(const m of html.matchAll(/<input[^>]+id="([^"]+)"[^>]+value="([^"]*)"/g))node(m[1]).value=decode(m[2]);for(const m of html.matchAll(/<textarea[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))node(m[1]).value=decode(m[2]);for(const m of html.matchAll(/<button[^>]+class="([^"]*)"[^>]+data-smart-material="([^"]+)"/g)){const b=new Node();b.className=m[1];b.dataset.smartMaterial=m[2];materials.push(b);}}
  get innerHTML(){return this._html;}
  querySelectorAll(selector){return selector.includes('selected')?materials.filter(b=>b.classList.contains('selected')):[...nodes.values(),...materials].filter(n=>n.id!=='closeSmartMail');}
  focus(){state.focus=this.id;}
  showModal(){this.open=true;}
  close(){this.open=false;state.closed=(state.closed||0)+1;}
  setAttribute(k,v){this[k]=v;}
  prepend(n){this.children.unshift(n);}
 }
 function node(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);}
 const data={leads:[{id:LEAD,status:'NEW',owner_user_id:'user-1',contact_id:'contact-1',institution_id:'inst-1',next_action:'INTERNAL_NEXT_ACTION'}],contacts:[{id:'contact-1',first_name:'Ana',email:'ana@escuela.invalid'}],institutions:[{id:'inst-1',name:'Colegio Sintético'}],activities:[{id:'web-1',lead_id:LEAD,type:'WEB_FORM',notes:'Requerimiento original: Laboratorio de física escolar, 30 m²\nContexto adicional: INTERNAL_METADATA',occurred_at:'2026-10-01T12:00:00Z'}],mail:[],commercial_mail_outbox:[],documents:[{id:DOC,lead_id:LEAD,title:'Catálogo',status:'CURRENT',category:'INSTITUTIONAL_BROCHURES'},{id:DOC2,lead_id:LEAD,title:'Ficha',status:'CURRENT',category:'REQUEST_DIAGNOSIS'}]};
 const sandbox={TextEncoder,crypto,console,data,$:node,window:{confirm(s){state.confirmed.push(s);return confirm;},open(...args){state.opened.push(args);}},navigator:{clipboard:{async writeText(text){state.clipboard.push(text);if(clipboardHook)await clipboardHook(sandbox);}}},rememberSmartMailHandoff:async(...args)=>{state.handoffs.push(args);if(handoffHook)await handoffHook(sandbox);},zohoMailComposeHref:()=> 'https://mail.example.invalid/compose',document:{querySelector(selector){return materials.find(b=>selector.includes(b.dataset.smartMaterial));},querySelectorAll(selector){return node('smartMailContent').querySelectorAll(selector);},createElement(){return new Node();}},CSS:{escape:String},esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity,caseOutboundStatus,buildCaseReply,caseReplyContext,date:value=>value||'Sin fecha',enums:{documentCategory:{INSTITUTIONAL_BROCHURES:'Folleto',REQUEST_DIAGNOSIS:'Diagnóstico'}},zohoMailMessageHref:()=>'',scopedRows:table=>data[table]||[],writableFor:()=>true,notice:(...v)=>notices.push(v),reload:async()=>{state.reloads++;if(reloadError)throw new Error('Synthetic reload failure');},openLeadDetails:id=>detailCalls.push(id),session:{user:{id:'user-1'}},profile:{organization_id:'org-1'},dataSource:'live',busy:false,loading:false,smartMailState:null,smartMailDrafts:new Map(),sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sb:{functions:{async invoke(name,options){const body=clone(options.body);calls.push({name,body});if(invokeHook)await invokeHook(body,sandbox);if(body.action==='capabilities')return clone(capabilities);const r=responses.shift()||{...accepted,data:{...accepted.data,reply_to_inbox_id:body.reply_to_inbox_id}};if(r.throw)throw new Error(r.throw);if(r.errorResponse)return {data:null,error:{context:{json:async()=>r.errorResponse}}};return clone(r);}}}};
 vm.createContext(sandbox);vm.runInContext(functions,sandbox);sandbox.openSmartMailDraft(LEAD);
 return {ctx:sandbox,node,data,calls,storage,notices,state,detailCalls,materials,send:()=>sandbox.sendSmartMailDirect(LEAD),fill(){node('smartMailBody').value='Hola Ana, revisemos el laboratorio de 30 m².';sandbox.toggleSmartMaterial(DOC);},attempt(){return JSON.parse([...storage.values()][0]||'null');},sends(){return calls.filter(c=>!c.body.action);}};
}
test('draft displays evidenced WEB_FORM context and keeps manual response free of internal instructions',()=>{const h=harness();assert.match(h.node('smartMailContent').innerHTML,/Laboratorio de física escolar, 30 m²/);assert.doesNotMatch(h.node('smartMailBody').value,/INTERNAL_/);assert.match(h.node('smartMailBody').value,/\[Escribe aquí/);});
test('placeholder blocks provider and focuses draft',async()=>{const h=harness();await h.send();assert.equal(h.calls.length,0);assert.match(h.node('smartMailFeedback').textContent,/Sustituye/);assert.equal(h.state.focus,'smartMailBody');});
test('missing email prevents opening composer',()=>{const h=harness();h.node('smartMailDialog').close();h.data.contacts[0].email='';h.ctx.openSmartMailDraft(LEAD);assert.equal(h.node('smartMailDialog').open,false);assert.match(h.notices.at(-1)[0],/correo registrado/);});
test('unconfirmed outbox directs to review instead of compose',()=>{const h=harness();h.node('smartMailDialog').close();h.data.commercial_mail_outbox=[{lead_id:LEAD,status:'UNKNOWN'}];h.ctx.openSmartMailDraft(LEAD);assert.equal(h.node('smartMailDialog').open,false);assert.equal(h.detailCalls.at(-1),LEAD);});
test('cancelled confirmation does not invoke endpoint',async()=>{const h=harness({confirm:false});h.fill();await h.send();assert.equal(h.calls.length,0);assert.equal(h.node('smartMailDialog').open,true);});
for(const invalid of [{contract_version:2,attachments:true,idempotency:true},{contract_version:3,attachments:false,idempotency:true},{contract_version:3,attachments:true,idempotency:false}])test('capability guard '+JSON.stringify(invalid),async()=>{const h=harness({capabilities:{data:invalid,error:null}});h.fill();const before=h.node('smartMailBody').value;await h.send();assert.equal(h.sends().length,0);assert.equal(h.node('smartMailBody').value,before);assert.match(h.node('smartMailFeedback').textContent,/no está habilitado/);assert.equal(h.ctx.busy,false);});
test('valid contract sends selected UUID document IDs and idempotency key',async()=>{const h=harness();h.fill();h.ctx.toggleSmartMaterial(DOC2);await h.send();assert.equal(h.calls[0].body.action,'capabilities');const sent=h.sends()[0].body;assert.deepEqual(sent.document_ids,[DOC,DOC2]);assert.match(sent.idempotency_key,/^[0-9a-f-]{36}$/);assert.match(h.state.confirmed[0],/info@xicronix.com/);assert.match(h.state.confirmed[0],/Catálogo, Ficha/);assert.equal(h.attempt().status,'SENT');assert.equal(h.data.leads[0].status,'NEW');assert.match(h.node('leadDetailContent').children[0].textContent,/Entrega al destinatario pendiente/);assert.equal(h.node('smartMailDialog').open,false);});
test('attempt storage contains identifiers and digest but not recipient or draft',async()=>{const h=harness();h.fill();await h.send();const stored=[...h.storage.values()].join('');assert.doesNotMatch(stored,/Ana|escuela.invalid|laboratorio/);assert.match(h.attempt().fingerprint,/^[a-f0-9]{64}$/);});
test('foreign-case attachment is rejected before confirmation or endpoint',async()=>{const h=harness();h.fill();h.data.documents[0].lead_id='foreign';await h.send();assert.equal(h.calls.length,0);assert.equal(h.state.confirmed.length,0);assert.match(h.node('smartMailFeedback').textContent,/ya no pertenece/);});
test('more than 10 selected attachments blocked',async()=>{const h=harness();h.fill();for(let i=0;i<10;i++)h.materials.push({dataset:{smartMaterial:'extra-'+i},classList:{contains:()=>true}});await h.send();assert.equal(h.calls.length,0);assert.match(h.node('smartMailFeedback').textContent,/máximo 10/);});
test('rapid repeated send only makes one provider call',async()=>{let release;const gate=new Promise(resolve=>release=resolve);const h=harness({invokeHook:async body=>{if(body.action)await gate;}});h.fill();const first=h.send();assert.equal(h.ctx.busy,true);assert.equal(h.node('closeSmartMail').disabled,true);await h.send();release();await first;assert.equal(h.sends().length,1);assert.equal(h.ctx.busy,false);assert.equal(h.node('closeSmartMail').disabled,false);});
test('network error preserves draft, attachments, and UNKNOWN attempt',async()=>{const h=harness({responses:[{throw:'synthetic network failure'}]});h.fill();const before=h.node('smartMailBody').value;await h.send();assert.equal(h.attempt().status,'UNKNOWN');assert.equal(h.node('smartMailBody').value,before);assert.equal(h.materials[0].classList.contains('selected'),true);assert.equal(h.node('smartMailDialog').open,true);assert.match(h.node('smartMailFeedback').textContent,/No se pudo confirmar/);});
test('network retry uses exact same payload and key',async()=>{const h=harness({responses:[{throw:'synthetic network failure'}]});h.fill();await h.send();await h.send();assert.equal(h.sends().length,2);assert.deepEqual(h.sends()[0].body,h.sends()[1].body);assert.equal(h.attempt().status,'SENT');});
test('uncertain attempt prevents modified new payload',async()=>{const h=harness({responses:[{throw:'synthetic network failure'}]});h.fill();await h.send();h.node('smartMailBody').value+=' MODIFICADO';await h.send();assert.equal(h.sends().length,1);assert.equal(h.attempt().status,'UNKNOWN');assert.match(h.node('smartMailFeedback').textContent,/envío anterior sin confirmar/);});
test('transient explicit pre-provider error keeps same key',async()=>{const h=harness({responses:[{data:{error:'invalid_attachments',status:'READY',retry_allowed:true},error:null}]});h.fill();await h.send();await h.send();assert.deepEqual(h.sends()[0].body,h.sends()[1].body);});
test('confirmed FAILED retains draft and permits new attempt key',async()=>{const h=harness({responses:[{errorResponse:{error:'provider_rejected',status:'FAILED',retry_allowed:true}}]});h.fill();const before=h.node('smartMailBody').value;await h.send();assert.equal(h.attempt().status,'FAILED');assert.equal(h.node('smartMailBody').value,before);assert.match(h.node('smartMailFeedback').textContent,/rechazó/);await h.send();assert.notEqual(h.sends()[0].body.idempotency_key,h.sends()[1].body.idempotency_key);assert.equal(h.sends()[0].body.body,h.sends()[1].body.body);});
test('retry_allowed false leaves UNKNOWN',async()=>{const h=harness({responses:[{data:{error:'provider_rejected',status:'FAILED',retry_allowed:false},error:null}]});h.fill();await h.send();assert.equal(h.attempt().status,'UNKNOWN');});
for(const result of [{ok:true,status:'SENT',delivery_status:'UNCONFIRMED'},{ok:true,status:'SENT',provider_message_id:'synthetic',delivery_status:'DELIVERED'}])test('malformed SENT cannot be treated as reusable READY: '+JSON.stringify(result),async()=>{const h=harness({responses:[{data:result,error:null}]});h.fill();await h.send();assert.equal(h.node('smartMailDialog').open,true);assert.equal(h.node('leadDetailContent').children.length,0);assert.equal(h.attempt().status,'UNKNOWN','Unproven SENT result must freeze changed payloads to avoid duplicates');});
test('same successful payload cannot be sent a second time',async()=>{const h=harness();h.fill();await h.send();await h.send();assert.equal(h.sends().length,1);assert.match(h.node('smartMailFeedback').textContent,/ya fue enviado/);});
test('confirmed provider acceptance survives subsequent reload failure',async()=>{const h=harness({reloadError:true});h.fill();await h.send();assert.equal(h.attempt().status,'SENT','A refresh error must not downgrade confirmed send');assert.equal(h.sends().length,1);});
test('session change during capabilities stops send',async()=>{const h=harness({invokeHook:body=>{if(body.action)h.ctx.session={user:{id:'different-user'}};}});h.fill();await h.send();assert.equal(h.sends().length,0);assert.equal(h.ctx.busy,false);});
test('session change during fingerprint preparation stops send',async()=>{let release;const gate=new Promise(resolve=>release=resolve);const crypto={randomUUID:()=>webcrypto.randomUUID(),subtle:{async digest(...args){await gate;return webcrypto.subtle.digest(...args);}}};const h=harness({crypto});h.fill();const sending=h.send();await new Promise(resolve=>setImmediate(resolve));h.ctx.session={user:{id:'different-user'}};release();await sending;assert.equal(h.sends().length,0,'Do not invoke send after actor changes during async preparation');});
test('session change after provider call avoids updating next user detail',async()=>{const h=harness({invokeHook:body=>{if(!body.action)h.ctx.session={user:{id:'different-user'}};}});h.fill();await h.send();assert.equal(h.state.reloads,0);assert.equal(h.detailCalls.length,0);assert.equal(h.node('leadDetailContent').children.length,0);});
test('remember draft restores body, recipient and selected attachments',()=>{const h=harness();h.fill();h.node('smartMailTo').value='otro@escuela.invalid';h.ctx.rememberSmartMailDraft();h.node('smartMailDialog').close();h.ctx.openSmartMailDraft(LEAD);assert.equal(h.node('smartMailBody').value,'Hola Ana, revisemos el laboratorio de 30 m².');assert.equal(h.node('smartMailTo').value,'otro@escuela.invalid');assert.equal(h.materials[0].classList.contains('selected'),true);});
test('accepted but registration pending freezes attempt and retains provider/outbox IDs',async()=>{const result={ok:false,status:'UNKNOWN',error:'accepted_record_pending',provider_status:'ACCEPTED',provider_message_id:'synthetic-provider-pending',outbox_id:'77777777-7777-4777-8777-777777777771',requires_review:true,retry_allowed:false};const h=harness({responses:[{data:result,error:null}]});h.fill();const draft=h.node('smartMailBody').value;await h.send();assert.equal(h.attempt().status,'UNKNOWN');assert.equal(h.attempt().provider_message_id,result.provider_message_id);assert.equal(h.attempt().outbox_id,result.outbox_id);assert.equal(h.node('smartMailDialog').open,true);assert.equal(h.node('smartMailBody').value,draft);assert.match(h.node('smartMailFeedback').textContent,/proveedor aceptó/);assert.match(h.node('smartMailFeedback').textContent,/No lo reenvíes/);assert.match(h.node('smartMailFeedback').textContent,new RegExp(result.outbox_id));assert.equal(h.node('leadDetailContent').children.length,0);});

const IN_A='88888888-8888-4888-8888-888888888881',IN_B='88888888-8888-4888-8888-888888888882';
const incoming=(overrides={})=>({id:IN_A,lead_id:LEAD,from_address:'support@service.invalid',sender_name:'Support',subject:'Re: [## 1001 ##] Consulta de acceso',body_text:'La cuenta está en revisión. Te avisaremos cuando termine.',received_at:'2026-10-06T12:00:00Z',source_payload:{message_id:'<thread-a@service.invalid>'},...overrides});
function withMail(h,rows,selected=null){h.data.mail=rows;h.data.leads[0].title='[COMMERCIAL] Correo recibido · [## 1000 ##]';h.ctx.openSmartMailDraft(LEAD,selected);return h;}
test('screenshot regression: missing content stays empty and blocked after replacing body',async()=>{
 const h=harness();Object.assign(h.data.contacts[0],{first_name:'info',email:'info@service.invalid'});withMail(h,[incoming({body_text:undefined,provider:'RESEND_FORWARD',provider_message_id:'provider-a',source_payload:{source:'resend-forward',email_id:'provider-a'},summary:'Contenido del correo no disponible todavía. Requiere recuperación del cuerpo original antes de interpretar o responder.'})]);
 assert.equal(h.node('smartMailBody').value,'');assert.equal(h.node('smartMailSend').disabled,true);
 assert.equal(h.node('smartMailTo').value,'support@service.invalid');assert.match(h.node('smartMailTitle').textContent,/1001/);assert.doesNotMatch(h.node('smartMailTitle').textContent,/COMMERCIAL|1000/);
 h.node('smartMailBody').value='Gracias por escribirnos.';await h.send();assert.equal(h.calls.length,0);assert.equal(h.state.confirmed.length,0);assert.match(h.node('smartMailFeedback').textContent,/contenido acreditado/);
 h.ctx.setSmartMailBusy(false);assert.equal(h.node('smartMailSend').disabled,true);
});
test('truncated inbound cannot be sent after manual body entry',async()=>{
 const h=withMail(harness(),[incoming({body_truncated:true})]);h.node('smartMailBody').value='Texto escrito manualmente';await h.send();assert.equal(h.calls.length,0);assert.equal(h.node('smartMailSend').disabled,true);assert.match(h.node('smartMailFeedback').textContent,/contenido completo/);
});
test('one source controls title recipient subject body and chosen link even if case title is old',()=>{
 const h=harness();h.ctx.zohoMailMessageHref=row=>row.id===IN_A?'https://mail.example.invalid/thread-a':'';
 withMail(h,[incoming(),incoming({id:IN_B,from_address:'other@service.invalid',subject:'[## 2002 ##] Otro hilo',body_text:'Mensaje del segundo hilo',received_at:'2026-10-08T12:00:00Z',source_payload:{message_id:'<thread-b@service.invalid>'}})],IN_A);
 const draft=h.ctx.smartMailDraftForLead(h.data.leads[0],IN_A);
 assert.equal(draft.thread.id,IN_A);assert.equal(draft.reply.mailId,IN_A);assert.equal(h.node('smartMailTo').value,'support@service.invalid');assert.match(h.node('smartMailSubject').value,/1001/);assert.match(h.node('smartMailContent').innerHTML,/La cuenta está en revisión/);assert.doesNotMatch(h.node('smartMailContent').innerHTML,/Mensaje del segundo hilo|Hola Support|Hola info/);
});
test('undated selected context never borrows a different dated subject or recipient',()=>{
 const h=withMail(harness(),[incoming(),incoming({id:IN_B,received_at:null,from_address:'second@service.invalid',subject:'[## 2002 ##] Sin fecha',body_text:'Texto segundo',source_payload:{message_id:'<thread-b@service.invalid>'}})]);
 assert.match(h.node('smartMailSubject').value,/2002/);assert.equal(h.node('smartMailTo').value,'second@service.invalid');assert.match(h.node('smartMailContent').innerHTML,/Texto segundo/);
});
test('inbox related only by contact cannot authorize a reply',async()=>{
 const h=withMail(harness(),[incoming({lead_id:null,contact_id:'contact-1'})]);h.node('smartMailBody').value='Manual';await h.send();assert.equal(h.calls.length,0);assert.match(h.node('smartMailFeedback').textContent,/vinculado de forma explícita/);
});
test('same-case explicit inbox sends its ID and cannot substitute contact or edited recipient',async()=>{
 const h=withMail(harness(),[incoming()]);h.node('smartMailBody').value='Gracias por informar sobre la cuenta.';h.node('smartMailTo').value='ana@escuela.invalid';await h.send();assert.equal(h.calls.length,0);assert.match(h.node('smartMailFeedback').textContent,/destinatario no coincide/);
 h.node('smartMailTo').value='support@service.invalid';await h.send();assert.equal(h.sends().length,1);assert.equal(h.sends()[0].body.reply_to_inbox_id,IN_A);assert.equal(h.sends()[0].body.to,'support@service.invalid');
});
test('missing RFC message ID fails closed rather than claiming a provider conversation',async()=>{
 for(const source_payload of [{messageId:'provider-internal-number'},{email_id:'provider-a'},{}]){
  const h=withMail(harness(),[incoming({source_payload})]);h.node('smartMailBody').value='Manual';await h.send();assert.equal(h.calls.length,0);assert.match(h.node('smartMailFeedback').textContent,/cabecera original/);
 }
});
test('cached drafts stay associated with source and are not silently restored over a new inbound',()=>{
 const h=withMail(harness(),[incoming()]);h.node('smartMailBody').value='Respuesta para A';h.ctx.rememberSmartMailDraft();const oldKey=h.ctx.smartMailState.draftKey;
 h.data.mail.push(incoming({id:IN_B,subject:'Ticket B',body_text:'Contenido B',received_at:'2026-10-09T12:00:00Z',source_payload:{message_id:'<b@service.invalid>'}}));h.ctx.openSmartMailDraft(LEAD);
 assert.notEqual(h.ctx.smartMailState.draftKey,oldKey);assert.notEqual(h.node('smartMailBody').value,'Respuesta para A');assert.equal(h.ctx.smartMailDrafts.get(oldKey).body,'Respuesta para A');
 h.ctx.openSmartMailDraft(LEAD,IN_A);assert.equal(h.node('smartMailBody').value,'Respuesta para A');
});
test('new inbound while preparing capabilities blocks before fingerprint or provider',async()=>{
 const h=withMail(harness({invokeHook:body=>{if(body.action)h.data.mail.push(incoming({id:IN_B,received_at:'2026-10-09T12:00:00Z',subject:'Nuevo mensaje',body_text:'No enviar aún',source_payload:{message_id:'<b@service.invalid>'}}));}}),[incoming()]);
 h.node('smartMailBody').value='Respuesta a A';await h.send();assert.equal(h.sends().length,0);assert.equal(h.attempt(),null);assert.match(h.node('smartMailFeedback').textContent,/contexto|asociación/);assert.equal(h.node('smartMailSend').disabled,true);
});
test('selected original stays bound when a newer unrelated ticket arrives during capabilities',async()=>{
 const h=withMail(harness({invokeHook:body=>{if(body.action)h.data.mail.push(incoming({id:IN_B,received_at:'2026-10-09T12:00:00Z',subject:'Nuevo ticket B',body_text:'Consulta B',source_payload:{message_id:'<b@service.invalid>'}}));}}),[incoming()],IN_A);
 h.node('smartMailBody').value='Respuesta al ticket A';await h.send();assert.equal(h.sends().length,1);assert.equal(h.sends()[0].body.reply_to_inbox_id,IN_A);assert.match(h.sends()[0].body.subject,/1001/);
});
test('provider capability without reply binding cannot send even a filled draft',async()=>{
 const h=harness({capabilities:{data:{contract_version:3,attachments:true,idempotency:true},error:null}});h.fill();await h.send();assert.equal(h.sends().length,0);assert.match(h.node('smartMailFeedback').textContent,/canal de envío seguro/);
});
test('existing mail-entry route propagates inbox ID through detail and composer',()=>{
 assert.match(source,/data-mail-inbox="'\+esc\(row.id\)/);assert.match(source,/openLeadDetails\(b.dataset.mailLead,b.dataset.mailInbox\|\|null\)/);assert.match(source,/openSmartMailDraft\(b.dataset.smartMail,b.dataset.smartMailInbox\|\|null\)/);
});
test('empty Zoho handoff fields do not restore an automatic draft or record anything',async()=>{
 for(const field of ['smartMailBody','smartMailTo','smartMailSubject']){
  const h=harness();h.fill();h.node(field).value='';await h.ctx.openSmartMailInZoho(LEAD);assert.equal(h.state.clipboard.length,0);assert.equal(h.state.handoffs.length,0);assert.equal(h.state.opened.length,0);
 }
});
test('Zoho handoff revalidates actor and source after clipboard await',async()=>{
 for(const mutate of [ctx=>ctx.session={user:{id:'changed-user'}},ctx=>ctx.data.mail.push(incoming())]){
  const h=harness({clipboardHook:mutate});h.fill();await h.ctx.openSmartMailInZoho(LEAD);assert.equal(h.state.clipboard.length,1);assert.equal(h.state.handoffs.length,0);assert.equal(h.state.opened.length,0);
 }
});
test('Zoho handoff does not open a stale conversation after recording await',async()=>{
 const h=harness({handoffHook:ctx=>ctx.profile={organization_id:'changed-org'}});h.fill();await h.ctx.openSmartMailInZoho(LEAD);assert.equal(h.state.handoffs.length,1);assert.equal(h.state.opened.length,0);
});
test('frontend digest binds precisely the source content reviewed in the composer',async()=>{
 const h=withMail(harness(),[incoming()]);h.node('smartMailBody').value='Respuesta revisada';const snapshot=h.ctx.smartMailDraftForLead(h.data.leads[0]).sourceSnapshot;await h.send();const sent=h.sends()[0].body;
 const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));assert.equal(sent.reply_source_hash,Buffer.from(digest).toString('hex'));assert.deepEqual(Object.keys(JSON.parse(snapshot)),['id','lead_id','from_address','subject','received_at','message_id','content']);
});
test('frontend source digest is accepted by real backend core with only synthetic adapters',async()=>{
 const row=incoming({provider:'RESEND_FORWARD',provider_message_id:'synthetic-inbound',body_text:undefined,summary:'La cuenta está en revisión.',source_payload:{source:'resend-forward',email_id:'synthetic-inbound',message_id:'<thread-a@service.invalid>'}});
 const h=withMail(harness(),[row]);h.node('smartMailBody').value='Gracias por informar sobre la cuenta.';await h.send();const payload=h.sends()[0].body;
 const {createHandler}=await import('../supabase/functions/commercial-mail-send-v3/core.mjs');
 const org='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111',out='99999999-9999-4999-8999-999999999999';let claimed=null,mail=null,providerCalls=0;
 const sourceRow={...row,organization_id:org,contact_id:null};
 const repository={authenticate:async()=>({user:{id:user},profile:{id:user,organization_id:org,role:'ADMIN'}}),capabilities:async()=>({contract_version:3,attachments:true,idempotency:true,bucket_private:true}),getLead:async()=>({id:LEAD,organization_id:org}),getAttempt:async()=>null,getUnresolved:async()=>null,getPendingCase:async()=>null,getInbound:async()=>structuredClone(sourceRow),getInboundActivities:async()=>[],hasInbound:async()=>true,claim:async record=>{claimed=record;return {claimed:true,row:{id:out}};},finalize:async()=>({status:'SENT',provider_message_id:'synthetic-accepted'})};
 const provider={send:async value=>{providerCalls++;mail=value;return {accepted:true,id:'synthetic-accepted'};}};
 const handler=createHandler({repository,provider});const response=await handler(new Request('https://fixture.invalid/send',{method:'POST',headers:{authorization:'Bearer synthetic-only'},body:JSON.stringify(payload)}));const result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(providerCalls,1);assert.equal(claimed.inbound_mail_id,IN_A);assert.equal(mail.headers['In-Reply-To'],'<thread-a@service.invalid>');assert.equal(result.reply_to_inbox_id,IN_A);assert.equal(result.delivery_status,'UNCONFIRMED');
});
