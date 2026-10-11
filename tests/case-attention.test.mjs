import test from 'node:test';
import assert from 'node:assert/strict';
import {caseRequestContext, caseInboundMail, caseOutboundStatus, caseUnconfirmedMailActivity, caseResponseProgress} from '../case-attention.mjs';
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

test('the latest evidenced send is the last action and removes the already answered mail priority',()=>{
  const data=fixture({leads:[{...lead,id:'urgent-other',institution_id:null,title:'Otra escuela',next_action_date:'2026-10-01'},lead],mail:[{lead_id:lead.id,status:'NEW',subject:'Precisiones del alcance',received_at:'2026-10-11T09:00:00Z'}],commercial_mail_outbox:[{lead_id:lead.id,status:'SENT',provider_message_id:'accepted-provider-id',subject:'Respuesta registrada',sent_at:'2026-10-11T10:00:00Z'}]});
  const html=render(data);
  assert.ok(html.indexOf('data-case-id="urgent-other"')<html.indexOf('data-case-id="'+lead.id+'"'));
  assert.match(html,/Correo enviado: Respuesta registrada/);
  assert.doesNotMatch(html,/Correo nuevo|Revisar el correo recibido y preparar la respuesta/);
  assert.match(html,/Esperar respuesta o programar seguimiento/);
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


const receivedMail={id:'inbound',lead_id:lead.id,status:'NEW',subject:'Consulta recibida',body_text:'Necesitamos información de laboratorio.',received_at:'2026-10-11T09:00:00Z'};
const acceptedMail={lead_id:lead.id,status:'SENT',provider_message_id:'provider-evidence',subject:'Respuesta del caso',sent_at:'2026-10-11T10:00:00Z'};
const progress=(data)=>caseResponseProgress(lead,data,{now});

test('provider acceptance after inbound produces follow-up without changing unread/open state',()=>{
 const data=fixture({mail:[receivedMail],commercial_mail_outbox:[acceptedMail]});const before=JSON.stringify(data);
 const result=progress(data);
 assert.equal(result.responseAccepted,true);assert.equal(result.pendingMail,null);assert.equal(result.nextAction,'Esperar respuesta o programar seguimiento.');assert.equal(result.nextDate,null);
 assert.equal(JSON.stringify(data),before);assert.equal(data.mail[0].status,'NEW');assert.equal(data.leads[0].status,'NEW');
 const html=render(data);assert.match(html,/En seguimiento/);assert.match(html,/>Escribir correo<\/button>/);assert.doesNotMatch(html,/Correo nuevo|preparar la respuesta/);
});

test('a newer incoming message after an accepted send restores response priority',()=>{
 const newer={...receivedMail,received_at:'2026-10-11T11:00:00Z'};
 const data=fixture({mail:[newer],commercial_mail_outbox:[acceptedMail]});
 assert.equal(progress(data).responseAccepted,false);assert.equal(progress(data).pendingMail.id,'inbound');
 assert.match(render(data),/Correo nuevo/);assert.match(render(data),/Revisar el correo recibido y preparar la respuesta/);
});

test('failed, uncertain and legacy no-ID sends never suppress the incoming request',()=>{
 for(const row of [{...acceptedMail,status:'FAILED'},{...acceptedMail,status:'SENDING'},{...acceptedMail,status:'UNKNOWN'},{...acceptedMail,provider_message_id:null}]){
  const result=progress(fixture({mail:[receivedMail],commercial_mail_outbox:[row]}));assert.equal(result.responseAccepted,false);assert.equal(result.pendingMail.id,'inbound');
 }
});

test('provider-evidenced activities cover outbox-hidden sessions without trusting ordinary EMAIL notes',()=>{
 const activity={lead_id:lead.id,type:'EMAIL',subject:'Correo aceptado por proveedor · respuesta',occurred_at:acceptedMail.sent_at};
 for(const evidence_note of ['Aceptado por Resend. Entrega al destinatario no confirmada. ID: provider-evidence. Referencia CRM: local-id. Adjuntos: 0','Envío confirmado por Resend. ID: provider-evidence']){
  const data=fixture({mail:[receivedMail],activities:[web,{...activity,evidence_note}]});
  assert.equal(progress(data).responseAccepted,true);assert.equal(progress(data).accepted.source,'activity');assert.match(render(data),/Esperar respuesta o programar seguimiento/);
 }
 for(const evidence_note of ['', 'Envío confirmado por Resend. ID: no disponible','Enviar a Resend más adelante','Envío confirmado por Resend. ID: null'])assert.equal(progress(fixture({mail:[receivedMail],activities:[{...activity,evidence_note}]})).responseAccepted,false);
});

test('manual future tasks, meetings and lead plans survive an accepted response',()=>{
 const base={mail:[receivedMail],commercial_mail_outbox:[acceptedMail]};
 const task={lead_id:lead.id,status:'PENDING',title:'Llamar para revisar inventario',due_at:'2026-10-12T10:00:00Z'};
 const meeting={lead_id:lead.id,status:'SCHEDULED',title:'Revisión con dirección',start_at:'2026-10-13T10:00:00Z'};
 let result=progress(fixture({...base,tasks:[task],meetings:[meeting]}));assert.equal(result.nextAction,task.title);assert.equal(result.nextDate,task.due_at);
 result=progress(fixture({...base,meetings:[meeting]}));assert.equal(result.nextAction,'Preparar y realizar: '+meeting.title);assert.equal(result.nextDate,meeting.start_at);
 result=caseResponseProgress({...lead,next_action:'Enviar ficha acordada',next_action_date:'2026-10-14T10:00:00Z'},fixture(base),{now});assert.equal(result.nextAction,'Enviar ficha acordada');assert.equal(result.nextDate,'2026-10-14T10:00:00Z');
 const automatic=fixture({...base,tasks:[{...task,title:'Responder primera solicitud',automation_key:'cx:web:test'}]});
 assert.equal(progress(automatic).nextAction,'Esperar respuesta o programar seguimiento.');
 assert.equal(caseResponseProgress({...lead,next_action_date:'2026-10-14T10:00:00Z'},automatic,{now}).nextAction,'Esperar respuesta o programar seguimiento.');
});

test('missing dates, future evidence and evidence from another case never prove this reply was handled',()=>{
 for(const row of [{...acceptedMail,sent_at:null},{...acceptedMail,sent_at:'invalid'},{...acceptedMail,sent_at:'2026-10-12T10:00:00Z'},{...acceptedMail,lead_id:'other'}])assert.equal(progress(fixture({mail:[receivedMail],commercial_mail_outbox:[row]})).responseAccepted,false);
 assert.equal(progress(fixture({mail:[{...receivedMail,received_at:null}],commercial_mail_outbox:[acceptedMail]})).responseAccepted,false);
 assert.equal(progress(fixture({activities:[{...web,occurred_at:'2026-10-11T11:00:00Z'}],commercial_mail_outbox:[acceptedMail]})).responseAccepted,false);
});


test('a newer web submission also prevents treating an old email response as current',()=>{
 const data=fixture({mail:[receivedMail],activities:[{...web,occurred_at:'2026-10-11T11:00:00Z'}],commercial_mail_outbox:[acceptedMail]});
 assert.equal(progress(data).responseAccepted,false);
});


test('impossible calendars and guessed timezones never prove chronological progress',()=>{
 const invalid=['2026-02-30','2026-02-30T10:00:00Z','2026-13-01T10:00:00Z','2026-10-10T24:00:00Z','2026-10-10T10:60:00Z','2026-10-10T10:00:00','10/10/2026','2026-10-10T10:00:00+25:00'];
 for(const value of invalid){
  let result=progress(fixture({mail:[receivedMail],commercial_mail_outbox:[{...acceptedMail,sent_at:value}]}));assert.equal(result.responseAccepted,false,'sent_at '+value);assert.equal(result.pendingMail.id,'inbound');
  result=progress(fixture({mail:[{...receivedMail,received_at:value}],commercial_mail_outbox:[acceptedMail]}));assert.equal(result.responseAccepted,false,'received_at '+value);assert.equal(result.pendingMail.id,'inbound');
 }
});
test('created_at is never a substitute for received_at, sent_at or occurred_at',()=>{
 let result=progress(fixture({mail:[{...receivedMail,received_at:null,created_at:'2026-10-11T08:00:00Z'}],commercial_mail_outbox:[acceptedMail]}));assert.equal(result.responseAccepted,false);assert.equal(result.pendingMail.id,'inbound');
 result=progress(fixture({mail:[receivedMail],commercial_mail_outbox:[{...acceptedMail,sent_at:null,created_at:acceptedMail.sent_at}]}));assert.equal(result.responseAccepted,false);
 const activity={lead_id:lead.id,type:'EMAIL',subject:'Correo aceptado',created_at:acceptedMail.sent_at,evidence_note:'Envío confirmado por Resend. ID: real-id'};
 assert.equal(progress(fixture({mail:[receivedMail],activities:[activity]})).responseAccepted,false);
});
test('provider placeholder tokens remain unconfirmed for both outbox and activity evidence',()=>{
 for(const provider_message_id of ['no disponible','no_disponible','no-disponible','unknown','undefined','null','N/A','not_available','pending','none','false']){
  assert.equal(caseOutboundStatus({...acceptedMail,provider_message_id}).kind,'uncertain',provider_message_id);
  const result=progress(fixture({mail:[receivedMail],commercial_mail_outbox:[{...acceptedMail,provider_message_id}]}));assert.equal(result.responseAccepted,false);assert.equal(result.pendingMail.id,'inbound');
  const activity={lead_id:lead.id,type:'EMAIL',occurred_at:acceptedMail.sent_at,evidence_note:'Envío confirmado por Resend. ID: '+provider_message_id};
  assert.equal(progress(fixture({mail:[receivedMail],activities:[activity]})).responseAccepted,false);
 }
});
test('explicitly foreign organization evidence cannot answer or plan this case',()=>{
 const own={...lead,organization_id:'org-own'};
 const data=fixture({mail:[{...receivedMail,organization_id:'org-own'}],commercial_mail_outbox:[{...acceptedMail,organization_id:'org-other'}],activities:[{...web,organization_id:'org-own'},{lead_id:lead.id,organization_id:'org-other',type:'EMAIL',occurred_at:acceptedMail.sent_at,evidence_note:'Envío confirmado por Resend. ID: actual-id'}]});
 let result=caseResponseProgress(own,data,{now});assert.equal(result.responseAccepted,false);assert.equal(result.pendingMail.id,'inbound');
 data.commercial_mail_outbox=[{...acceptedMail,organization_id:'org-own'}];data.tasks=[{lead_id:lead.id,organization_id:'org-other',status:'PENDING',title:'Foreign private plan',due_at:'2026-10-12T12:00:00Z'}];
 result=caseResponseProgress(own,data,{now});assert.equal(result.responseAccepted,true);assert.equal(result.nextAction,'Esperar respuesta o programar seguimiento.');
 assert.equal(caseInboundMail(own,fixture({mail:[{...receivedMail,organization_id:'org-other'}]})).length,0);
});
test('date-only evidence cannot establish order inside the same calendar day',()=>{
 let result=progress(fixture({mail:[{...receivedMail,received_at:'2026-10-11'}],commercial_mail_outbox:[acceptedMail]}));assert.equal(result.responseAccepted,false);assert.equal(result.pendingMail.id,'inbound');
 result=progress(fixture({mail:[{...receivedMail,received_at:'2026-10-10T09:00:00Z'}],commercial_mail_outbox:[{...acceptedMail,sent_at:'2026-10-10'}]}));assert.equal(result.responseAccepted,false);
});
