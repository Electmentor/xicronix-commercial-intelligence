import test from 'node:test';
import assert from 'node:assert/strict';
import {latestWhatsappContext,whatsappDraft,whatsappPhone,whatsappUrl,openCaseWhatsapp,closeCaseWhatsapp} from '../case-whatsapp.mjs';
const lead={id:'lead1',contact_id:'c1',organization_id:'o1'};
const now=Date.parse('2026-10-11T12:00:00Z');
const mail={id:'mail1',lead_id:'lead1',organization_id:'o1',subject:'Coordinar',received_at:'2026-10-06T12:00:00Z',body_text:'Tenemos un espacio de coordinaciones internas para presentar la necesidad el viernes.'};
const web={id:'web1',lead_id:'lead1',type:'WEB_FORM',subject:'Solicitud desde el chat',occurred_at:'2026-10-10T12:00:00Z',notes:'Requerimiento original: Quisiera revisar la propuesta\nContexto adicional: SECRET_INTERNAL'};
const data={contacts:[{id:'c1',first_name:'Ana'}],mail:[mail],activities:[]};
const ctx=d=>latestWhatsappContext(lead,d,{now});
test('newer web overrides older email without copying its transcript to draft',()=>{const d={...data,activities:[web]};assert.equal(ctx(d).id,'web1');const r=whatsappDraft(lead,d,{now});assert.equal(r.text,'');assert.doesNotMatch(r.context.text,/SECRET_INTERNAL/);});
test('newer email overrides web and recognized past coordination follows up',()=>{const d={...data,activities:[{...web,occurred_at:'2026-10-01T12:00:00Z'}]};assert.equal(ctx(d).id,'mail1');assert.match(whatsappDraft(lead,d,{now}).text,/Cómo les fue/);assert.doesNotMatch(whatsappDraft(lead,d,{now}).text,/solicitud relacionada|implementar|viernes/);});
test('newest missing body never falls back to older web',()=>{const r=whatsappDraft(lead,{...data,mail:[{...mail,received_at:'2026-10-11T10:00:00Z',body_text:'',summary:'Contenido del correo no disponible'}],activities:[web]},{now});assert.equal(r.context.id,'mail1');assert.equal(r.text,'');assert.match(r.context.reason,/Falta el cuerpo/);});
test('unknown, date-only, invalid and future timestamps prevent claimed chronology',()=>{for(const received_at of [undefined,'2026-10-10','2026-02-30T12:00:00Z','2026-10-11T24:00:00Z','2026-10-12T12:00:00Z'])assert.equal(ctx({...data,mail:[{...mail,received_at}],activities:[web]}).kind,'uncertain');});
test('forward receipt cannot date original interaction',()=>{assert.equal(ctx({...data,mail:[{...mail,subject:'Fwd: Coordinar'}]}).kind,'uncertain');});
test('equally dated sources require review',()=>{assert.equal(ctx({...data,activities:[{...web,occurred_at:mail.received_at}]}).kind,'uncertain');});
test('social channel supports recorded explicit customer message only',()=>{const social={...web,type:'OTHER',channel:'Instagram',customer_message:'Ya decidimos el alcance',notes:'INTERNAL_ONLY'};const r=ctx({...data,activities:[social]});assert.equal(r.source,'Instagram');assert.equal(r.text,'Ya decidimos el alcance');assert.equal(whatsappDraft(lead,{...data,activities:[social]},{now}).text,'');});
test('social record without customer body blocks stale older response',()=>{const r=ctx({...data,activities:[{...web,type:'OTHER',channel:'LinkedIn',notes:'STAFF_ONLY'}]});assert.equal(r.id,'web1');assert.equal(r.text,'');assert.match(r.reason,/Falta el cuerpo/);});
test('outbound continuation is manual rather than restarting the initial request',()=>{const d={...data,commercial_mail_outbox:[{id:'sent',lead_id:'lead1',status:'SENT',sent_at:'2026-10-10T12:00:00Z'}]};assert.equal(ctx(d).kind,'outbound');assert.match(ctx(d).reason,/seguimiento/);assert.equal(whatsappDraft(lead,d,{now}).text,'');});
test('uncertain outbound attempt blocks new automatic message',()=>{assert.equal(ctx({...data,commercial_mail_outbox:[{lead_id:'lead1',status:'UNKNOWN'}]}).kind,'uncertain');});
test('foreign case and organization cannot provide context',()=>{assert.equal(ctx({mail:[{...mail,lead_id:'other'}],activities:[{...web,organization_id:'other'}]}).kind,'missing');});
test('missing/ambiguous phone rejected, local mobile normalized, international explicit',()=>{for(const x of ['',null,'(01) 5026267','1234','51922187634 ext 9'])assert.equal(whatsappPhone(x),'');assert.equal(whatsappPhone('995 586 874'),'51995586874');assert.equal(whatsappPhone('+1 415 555 1234'),'14155551234');});
test('URL encodes reviewed text; blocks blank, placeholders, excessive text and credentials',()=>{assert.equal(new URL(whatsappUrl('995586874','Hola & ¿novedades?')).searchParams.get('text'),'Hola & ¿novedades?');for(const value of ['', '[Escribe aquí tu respuesta]', 'a'.repeat(1201), 'api_key: secret'])assert.equal(whatsappUrl('995586874',value),'');});
// Minimal DOM runtime verifies no API/storage/state writes and deliberate review.
function harness(contact={first_name:'Ana',phone:'995586874'},institution={phone:'015026267'},options={}){
 const nodes=[];class El{constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};this.value='';this.checked=false;nodes.push(this);}setAttribute(){}append(...n){this.children.push(...n);}addEventListener(k,fn){this.events[k]=fn;}replaceChildren(){this.children=[];}remove(){this.removed=true;}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){}fire(k){this.events[k]?.();}}
 const doc={createElement:t=>new El(t),createTextNode:t=>({textContent:t}),getElementById:id=>nodes.find(n=>n.id===id&&!n.removed)||null,body:new El('body')};const opened=[];const before=JSON.stringify(data);const dialog=openCaseWhatsapp({lead,contact,institution,data,document:doc,open:(...args)=>opened.push(args),now,dataSource:'live',isCurrent:()=>true,...options});
 return {nodes,opened,before,doc,dialog,phone:nodes.find(n=>n.tag==='input'&&n.type==='tel'),text:nodes.find(n=>n.tag==='textarea'),check:nodes.find(n=>n.type==='checkbox'),button:nodes.find(n=>['Abrir WhatsApp','Simular apertura'].includes(n.textContent))};
}
test('modal requires review, invalidates review after edits, does not mutate case on open',()=>{const h=harness();h.button.fire('click');assert.equal(h.opened.length,0);h.check.checked=true;h.check.fire('change');h.button.fire('click');assert.equal(h.opened.length,1);assert.equal(JSON.stringify(data),h.before);assert.equal(h.button.disabled,true);h.check.checked=true;h.text.fire('input');assert.equal(h.check.checked,false);});
test('institution phone never silently replaces missing contact phone',()=>{const h=harness({first_name:'Ana'});assert.equal(h.phone.value,'');assert.ok(h.nodes.some(n=>/Sólo hay teléfono institucional/.test(n.textContent||'')));});
test('registered proposal sent takes priority over an older inbound',()=>{const r=ctx({...data,activities:[{...web,type:'PROPOSAL_SENT'}]});assert.equal(r.outgoing,true);assert.match(r.reason,/seguimiento/);});
test('Nexa transcript cannot be placed into WhatsApp URL',()=>{assert.equal(whatsappUrl('995586874','Visitante: Consulta\nNexa: Respuesta'),'');});


test('demo preserves its editable composer and simulates without opening any external URL',()=>{
 const h=harness(undefined,undefined,{dataSource:'demo'});const before=h.text.value;
 h.check.checked=true;h.check.fire('change');h.button.fire('click');
 assert.equal(h.opened.length,0);assert.equal(h.dialog.open,true);assert.equal(h.text.value,before);assert.equal(h.check.checked,false);
 assert.ok(h.nodes.some(n=>/Simulación completada/.test(n.textContent||'')));
});
test('stale context is checked again on click, then composer data is discarded',()=>{
 let current=true;const h=harness(undefined,undefined,{isCurrent:()=>current});
 h.check.checked=true;h.check.fire('change');current=false;h.button.fire('click');
 assert.equal(h.opened.length,0);assert.equal(h.dialog.open,false);assert.equal(h.dialog.removed,true);assert.equal(h.phone.value,'');assert.equal(h.text.value,'');assert.equal(h.dialog.children.length,0);
 h.check.checked=true;h.button.fire('click');assert.equal(h.opened.length,0);
});
test('session/workspace dismissal clears data and makes retained handlers inert',()=>{
 const h=harness();h.check.checked=true;h.check.fire('change');
 assert.equal(closeCaseWhatsapp(h.doc),true);assert.equal(h.dialog.open,false);assert.equal(h.text.value,'');assert.equal(h.phone.value,'');assert.equal(h.dialog.children.length,0);
 h.check.checked=true;h.button.fire('click');assert.equal(h.opened.length,0);assert.equal(closeCaseWhatsapp(h.doc),false);
});
test('reopening first discards the old composer and its reviewed message',()=>{
 const h=harness();h.check.checked=true;
 const replacement=openCaseWhatsapp({document:h.doc,lead,data,now,dataSource:'demo',isCurrent:()=>true});
 assert.equal(h.dialog.removed,true);assert.equal(h.text.value,'');assert.equal(h.phone.value,'');h.check.checked=true;h.button.fire('click');assert.equal(h.opened.length,0);assert.equal(replacement.open,true);
});
test('a guard that throws fails closed rather than opening WhatsApp',()=>{
 const h=harness(undefined,undefined,{isCurrent:()=>{throw Error('stale session');}});h.check.checked=true;h.button.fire('click');assert.equal(h.opened.length,0);assert.equal(h.dialog.removed,true);
});


test('an ordinary refresh pauses opening without erasing or closing the draft',()=>{
 let ready=false;const h=harness(undefined,undefined,{isReady:()=>ready});const text=h.text.value;h.check.checked=true;h.button.fire('click');
 assert.equal(h.opened.length,0);assert.equal(h.dialog.open,true);assert.equal(h.text.value,text);assert.ok(h.nodes.some(n=>/borrador se conserva/.test(n.textContent||'')));
 ready=true;h.button.fire('click');assert.equal(h.opened.length,1);
});


test('draft text uses normal readable mobile typography instead of inheriting a bold label',()=>{const h=harness();for(const rule of ['font:inherit','font-weight:400','font-size:16px','line-height:1.4'])assert.ok(h.text.style.cssText.includes(rule),rule);});
test('manual-only context explicitly explains that no reliable automatic draft is available',()=>{const h=harness(undefined,undefined,{data:{...data,activities:[web]}});assert.equal(h.text.value,'');assert.ok(h.nodes.some(n=>/no hay un borrador automático fiable/.test(n.textContent||'')));assert.equal(h.nodes.some(n=>/adapta el mensaje/.test(n.textContent||'')),false);});
