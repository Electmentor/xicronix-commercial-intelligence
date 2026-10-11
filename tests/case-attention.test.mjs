import test from 'node:test';
import assert from 'node:assert/strict';
import {caseRequestContext, caseInboundMail, caseOutboundStatus, caseUnconfirmedMailActivity} from '../case-attention.mjs';
import {renderSellerDashboard} from '../seller-dashboard.mjs';

const now = new Date('2026-10-11T12:00:00Z');
const lead = {id:'12345678-abcd-4123-a123-123456789abc',institution_id:'school',contact_id:'person',owner_user_id:'seller',title:'Consulta laboratorio',status:'NEW',next_action:'Revisar la solicitud y realizar la primera respuesta humana.'};
const request = 'Necesitamos renovar el laboratorio de física y química para 180 alumnos. Queremos cotizar equipos, instalación y capacitación docente antes de noviembre.';
const web = {id:'web',lead_id:lead.id,type:'WEB_FORM',need_summary:'diagnostico',notes:request,occurred_at:'2026-10-10T09:00:00Z'};
const fixture = extra => ({leads:[{...lead}],institutions:[{id:'school',name:'Colegio José María'}],contacts:[{id:'person',first_name:'Ana',last_name:'Pérez',email:'ana@example.invalid'}],users:[{id:'seller',full_name:'Asesora local'}],activities:[{...web}],tasks:[],mail:[],...extra});
const render = (data=fixture(), options={}) => renderSellerDashboard(data,{now,showSearch:true,...options});

test('web notes preserve the whole original request ahead of a category or internal next step',()=>{
  assert.deepEqual(caseRequestContext(lead,fixture()),{text:request,source:'Solicitud web',at:web.occurred_at});
  assert.doesNotMatch(caseRequestContext(lead,fixture()).text,/primera respuesta humana|diagnostico/);
});

test('an explicit original request is separated from envelope metadata and staff instructions',()=>{
  const notes='Contexto del chat: resumen automático\nRequerimiento original: '+request+'\nNecesitamos respuesta por correo.\n\nContexto adicional: panel solar\nInstrucciones internas: escribir una propuesta inventada.';
  const data=fixture({activities:[{...web,notes}],mail:[{lead_id:lead.id,body_text:'Mensaje distinto posterior',received_at:'2026-10-11T08:00:00Z'}]});
  assert.equal(caseRequestContext(lead,data).text,request+'\nNecesitamos respuesta por correo.');
  assert.doesNotMatch(caseRequestContext(lead,data).text,/resumen automático|panel solar|inventada/);
});

test('plain web forms remove trailing operational metadata but preserve customer paragraphs',()=>{
  const notes=request+'\nTambién necesitamos conocer la garantía.\n\nCanal: web_chat\nCTA: pedir diagnóstico';
  assert.equal(caseRequestContext(lead,fixture({activities:[{...web,notes}]})).text,request+'\nTambién necesitamos conocer la garantía.');
});

test('actual incoming mail content precedes a generic web submission, with its real timestamp',()=>{
  const data=fixture({mail:[{lead_id:lead.id,body_text:'Preferimos comenzar con 20 microscopios.',received_at:'2026-10-11T09:00:00Z'}]});
  assert.deepEqual(caseRequestContext(lead,data),{text:'Preferimos comenzar con 20 microscopios.',source:'Correo recibido',at:'2026-10-11T09:00:00Z'});
});

test('mail summary, subject-only body, placeholder and outbound instructions are not customer requests',()=>{
  const data=fixture({activities:[],mail:[
    {lead_id:lead.id,summary:'Hacer seguimiento interno',subject:'Sin cuerpo',received_at:'2026-10-11T10:00:00Z'},
    {lead_id:lead.id,body_text:'Cotización',subject:'Cotización',received_at:'2026-10-11T09:00:00Z'},
    {lead_id:lead.id,body_text:'Contenido del correo no disponible.',received_at:'2026-10-11T08:00:00Z'},
    {lead_id:lead.id,body_text:'Enviar propuesta interna.',direction:'OUT',received_at:'2026-10-11T07:00:00Z'}
  ]});
  assert.deepEqual(caseRequestContext(lead,data),{text:'',source:'',at:null});
});

test('staff activity notes are never substituted for a customer request; structured need is labelled',()=>{
  const data=fixture({activities:[{lead_id:lead.id,type:'CALL',notes:'Enviar descuento no aprobado',need_summary:'Equipamiento para laboratorio',occurred_at:'2026-10-11'}]});
  assert.deepEqual(caseRequestContext(lead,data),{text:'Equipamiento para laboratorio',source:'Necesidad registrada',at:'2026-10-11'});
  data.activities[0].need_summary='';
  assert.equal(caseRequestContext(lead,data).text,'');
});

test('inbound associations never borrow a message linked to another case from the same contact',()=>{
  const data=fixture({mail:[
    {id:'other',lead_id:'other-case',contact_id:'person',from_address:'ana@example.invalid',body_text:'Otro caso'},
    {id:'unlinked',contact_id:'person',body_text:'Mensaje de contacto',received_at:'2026-10-10'},
    {id:'current',lead_id:lead.id,body_text:'Caso correcto',received_at:'2026-10-11'}
  ]});
  assert.deepEqual(caseInboundMail(lead,data).map(row=>row.id),['current','unlinked']);
  assert.deepEqual(caseRequestContext(null,{activities:[{type:'WEB_FORM',notes:'No asignado'}]}),{text:'',source:'',at:null});
});

test('request extraction never mutates input and keeps full long text for detail and drafting',()=>{
  const text='Quiero información completa. '.repeat(120);
  const data=fixture({activities:[{...web,notes:text.trim()}]});
  const before=JSON.stringify(data);
  assert.equal(caseRequestContext(lead,data).text,text.trim());
  render(data);
  assert.equal(JSON.stringify(data),before);
});

test('pending is default; converted and disqualified are only included by explicit filters',()=>{
  const data=fixture({leads:[lead,{...lead,id:'closed-converted',title:'Convertido de prueba',institution_id:null,status:'CONVERTED'},{...lead,id:'closed-disqualified',title:'Descartado de prueba',institution_id:null,status:'DISQUALIFIED'}]});
  const pending=render(data);
  assert.match(pending,/data-case-filter="pending"[^>]*aria-pressed="true"/);
  assert.match(pending,/data-case-id="12345678/);
  assert.doesNotMatch(pending,/data-case-id="closed-/);
  assert.equal((render(data,{caseFilter:'all'}).match(/data-case-id=/g)||[]).length,3);
  const closed=render(data,{caseFilter:'closed'});
  assert.equal((closed.match(/data-case-id=/g)||[]).length,2);
  assert.doesNotMatch(closed,/data-smart-mail=/);
  assert.match(closed,/Convertido|Descartado/);
});

test('cards expose the school, evidenced request, owner, actual latest movement and next step',()=>{
  const data=fixture({activities:[web,{lead_id:lead.id,type:'CALL',subject:'Llamada de diagnóstico',occurred_at:'2026-10-11T08:00:00Z'}],tasks:[{lead_id:lead.id,title:'Confirmar cantidad de equipos',status:'PENDING',due_at:'2026-10-12T08:00:00Z'}]});
  const html=render(data);
  for(const value of ['Colegio José María',request,'Asesora local','Llamada de diagnóstico','Confirmar cantidad de equipos'])assert.ok(html.includes(value),value);
  assert.match(html,/data-smart-mail="12345678[^"]*">Responder/);
  assert.match(html,/data-lead-detail="12345678[^"]*">Abrir caso/);
  assert.doesNotMatch(html,/PRIORIDAD #1|SIGUIENTES 3|Resto de mi cartera|prospect-progress|Madurez|Potencial/);
});

test('all cases remain visible in the same list and none is buried behind a details section',()=>{
  const data=fixture({leads:Array.from({length:12},(_,i)=>({...lead,id:'case-'+i}))});
  const html=render(data);
  assert.equal((html.match(/<article class="case-card/g)||[]).length,12);
  assert.doesNotMatch(html,/<details/);
});

test('search matches accent-insensitive school, request, contact, responsible and short IDs',()=>{
  for(const query of ['jose maria','capacitación','PEREZ','asesora local','ID 12345678'])assert.match(render(fixture(),{searchQuery:query}),/data-case-id=/,query);
  assert.doesNotMatch(render(fixture(),{searchQuery:'zzzz'}),/data-case-id=/);
  // The old ID normalizer incorrectly matched words containing only a few hex letters.
  assert.doesNotMatch(render(fixture(),{searchQuery:'rojo'}),/data-case-id=/);
});

test('an unanswered incoming mail is prioritized; the latest sent mail is shown as the last action',()=>{
  const data=fixture({leads:[{...lead,id:'urgent-other',institution_id:null,title:'Otra escuela',next_action_date:'2026-10-01'},lead],mail:[{lead_id:lead.id,status:'NEW',subject:'Precisiones del alcance',received_at:'2026-10-11T09:00:00Z'}],commercial_mail_outbox:[{lead_id:lead.id,status:'SENT',provider_message_id:'accepted-provider-id',subject:'Respuesta registrada',sent_at:'2026-10-11T10:00:00Z'}]});
  const html=render(data);
  assert.ok(html.indexOf('data-case-id="'+lead.id+'"')<html.indexOf('data-case-id="urgent-other"'));
  assert.match(html,/Correo enviado: Respuesta registrada/);
});

test('missing email only shows Open case and current profile resolves owner without loading users',()=>{
  const data=fixture({contacts:[],users:[]});
  const html=render(data,{currentUser:{id:'seller',full_name:'Vendedora autenticada'}});
  assert.match(html,/Vendedora autenticada/);
  assert.doesNotMatch(html,/data-smart-mail=/);
  assert.match(html,/data-lead-detail=/);
});

test('empty, failed-load, demo and unsafe strings remain honest and escaped',()=>{
  assert.match(render({leads:[]}),/No hay casos pendientes/);
  assert.match(render({leads:[]},{failures:{leads:true}}),/No se pudieron cargar los casos/);
  assert.match(render(fixture(),{demo:true}),/datos de demostración/);
  const data=fixture({institutions:[{id:'school',name:'<script>alert(1)</script>'}],activities:[{...web,notes:'<img src=x onerror=alert(1)>'}]});
  const html=render(data,{searchQuery:'" onfocus="alert(1)'});
  assert.doesNotMatch(html,/<script>|<img|value="" onfocus/);
  assert.match(render(data),/&lt;script&gt;/);
});

test('existing performance render remains available without the case-list option',()=>{
  const html=renderSellerDashboard(fixture(),{now});
  assert.match(html,/seller-performance-dashboard/);
  assert.doesNotMatch(html,/class="case-list"/);
});


test('read-only users can open cases but are not offered the response action',()=>{
  const html=render(fixture(),{canReply:false});
  assert.doesNotMatch(html,/data-smart-mail=/);
  assert.match(html,/class="primary" data-lead-detail=/);
});


test('missing newest email body never masquerades as the content of an older email',()=>{
  const data=fixture({mail:[
    {lead_id:lead.id,subject:'Cambio de requerimiento',received_at:'2026-10-11T10:00:00Z'},
    {lead_id:lead.id,body_text:'El pedido antiguo',received_at:'2026-10-10T10:00:00Z'}
  ]});
  assert.equal(caseRequestContext(lead,data).source,'Solicitud web');
  assert.equal(caseRequestContext(lead,data).text,request);
});


test('sent status requires a provider ID; uncertainty and failure stay explicit',()=>{
  assert.equal(caseOutboundStatus({status:'SENT',provider_message_id:'resend-id'}).kind,'sent');
  for(const provider_message_id of [null,undefined,'','   ',42])assert.equal(caseOutboundStatus({status:'SENT',provider_message_id}).kind,'uncertain');
  for(const status of ['SENDING','UNKNOWN'])assert.equal(caseOutboundStatus({status}).kind,'uncertain');
  assert.equal(caseOutboundStatus({status:'FAILED'}).kind,'failed');
  assert.equal(caseOutboundStatus({status:'DRAFT'}),null);
});

test('legacy sent without evidence and sending attempts cannot claim success or invite another send',()=>{
  for(const status of ['SENT','SENDING','UNKNOWN']){
    const data=fixture({commercial_mail_outbox:[{lead_id:lead.id,status,provider_message_id:null,subject:'Intento pendiente',updated_at:'2026-10-11T11:00:00Z'}]});
    const html=render(data);
    assert.match(html,/Envío sin confirmación: Intento pendiente/);
    assert.match(html,/Revisar el envío sin confirmación antes de enviar otro correo/);
    assert.doesNotMatch(html,/Correo enviado|data-smart-mail=/);
    assert.match(html,/data-lead-detail=/);
  }
});

test('most recent failed send is visible, with a concrete review step',()=>{
  const data=fixture({commercial_mail_outbox:[{lead_id:lead.id,status:'FAILED',subject:'Intento rechazado',updated_at:'2026-10-11T11:00:00Z'}]});
  const html=render(data);
  assert.match(html,/Envío fallido: Intento rechazado/);
  assert.match(html,/Revisar el envío fallido y corregirlo antes de volver a enviar/);
  assert.doesNotMatch(html,/Correo enviado/);
});

test('unresolved uncertainty stays visible even after a newer, separate send or activity',()=>{
  const data=fixture({activities:[web,{lead_id:lead.id,type:'CALL',subject:'Validación posterior',occurred_at:'2026-10-11T11:30:00Z'}],commercial_mail_outbox:[
    {lead_id:lead.id,status:'SENT',subject:'Histórico incierto',created_at:'2026-10-10T11:00:00Z'},
    {lead_id:lead.id,status:'SENT',provider_message_id:'provider-confirmed',subject:'Intento distinto',sent_at:'2026-10-11T11:00:00Z'}
  ]});
  const html=render(data);
  assert.match(html,/Validación posterior/);
  assert.match(html,/Revisar el envío sin confirmación/);
  assert.doesNotMatch(html,/data-smart-mail=/);
});


test('v2 success-looking activity without provider evidence is never presented as a sent email',()=>{
  const legacy={lead_id:lead.id,type:'EMAIL',subject:'Correo enviado · Asunto histórico',evidence_note:'Envío confirmado por Resend. ID: no disponible',occurred_at:'2026-10-11T11:30:00Z'};
  assert.equal(caseUnconfirmedMailActivity(legacy),true);
  assert.equal(caseUnconfirmedMailActivity({...legacy,evidence_note:'Envío confirmado por Resend. ID: abc123'}),false);
  for(const commercial_mail_outbox of [[],[{lead_id:lead.id,status:'SENT',subject:'Asunto histórico',sent_at:'2026-10-11T11:29:00Z'}]]){
    const data=fixture({activities:[web,legacy],commercial_mail_outbox});
    const before=JSON.stringify(data);
    const html=render(data);
    assert.match(html,/Registro de envío sin confirmación/);
    assert.match(html,/Revisar el envío sin confirmación/);
    assert.doesNotMatch(html,/Correo enviado|data-smart-mail=/);
    assert.equal(JSON.stringify(data),before);
  }
});
