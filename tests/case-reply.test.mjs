import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCaseReply,caseReplyContext} from '../case-reply.mjs';

const lead={id:'case',contact_id:'contact',institution_id:'school',commercial_maturity_pct:85,next_action:'Iniciar diagnóstico y solicitar otra reunión'};
const now='2026-10-11T12:00:00Z';
const message='Estimado equipo Xicronix: Muchas gracias por su comprensión y por mantenerse atentos a nuestra coordinación. Lamentamos haber dilatado un poco este proceso debido a las coordinaciones internas que hemos venido realizando. Les comento que el día miércoles me han otorgado un espacio de 15 minutos para exponer la necesidad identificada y presentar la propuesta. De acuerdo con lo que se determine en dicha reunión, podremos coordinar posteriormente una nueva reunión con ustedes y definir los siguientes pasos. Agradezco mucho su paciencia y comprensión durante este proceso, seguimos en contacto. Muchas gracias por su disposición y por mantenerse atentos. Atentamente, Mg. Persona Sintética Colegio Fixture';
const mail={id:'inbound',lead_id:'case',subject:'Coordinación de propuesta',body_text:message,received_at:'2026-09-28T11:24:00-05:00'};
const fixture=(extra={})=>({contacts:[{id:'contact',first_name:'Alex',email:'alex@example.invalid'}],institutions:[{id:'school',name:'Colegio de prueba'}],mail:[{...mail}],activities:[{type:'WEB_FORM',lead_id:'case',notes:'Requerimiento original: Necesitamos implementar un laboratorio.',occurred_at:'2026-09-20T12:00:00Z'}],...extra});
const draft=(data=fixture(),options={now})=>buildCaseReply(lead,data,options);

test('latest email overrides original web request only for the reply context',()=>{
  const reply=draft();
  assert.equal(reply.contextText,message);assert.equal(reply.source,'Correo recibido');assert.equal(reply.at,mail.received_at);
  assert.doesNotMatch(reply.body,/laboratorio|diagnóstico|solicitar otra reunión/);
});
test('September 28 Monday anchors Wednesday to September 30; October 11 asks about coordination without inventing an outcome',()=>{
  const reply=draft();
  assert.equal(reply.eventDate,'2026-09-30');assert.equal(reply.eventState,'past');assert.equal(reply.needsHumanAnswer,false);
  assert.match(reply.body,/¿Cómo les fue con la coordinación que tenían prevista\?/);assert.match(reply.body,/¿Surgió alguna consulta/);
  assert.doesNotMatch(reply.body,/hemos revisado|revisamos|agendar|diagnóstico|le contactar|reunión realizada|aprobado|\[Escribe/);
});
test('before the planned Wednesday it thanks, offers help and waits without promising contact',()=>{
  const reply=draft(fixture(),{now:'2026-09-29T12:00:00Z'});
  assert.equal(reply.eventDate,'2026-09-30');assert.equal(reply.eventState,'future');assert.equal(reply.needsHumanAnswer,false);
  assert.match(reply.body,/Si necesitan aclarar/);assert.match(reply.body,/Quedamos atentos a lo que decidan/);
  assert.doesNotMatch(reply.body,/Cómo les fue|Surgió|contactaremos|escribiremos|agendar|diagnóstico/);
});
test('on the event day the draft does not assume it has happened',()=>{
  const reply=draft(fixture(),{now:'2026-09-30T23:59:59Z'});
  assert.equal(reply.eventState,'today');assert.doesNotMatch(reply.body,/Cómo les fue|Surgió/);
});
test('October 1 at 03:00 UTC is still September 30 in Lima, so it does not assume the coordination is past',()=>{
  const reply=draft(fixture(),{now:new Date('2026-10-01T03:00:00Z')});
  assert.equal(reply.eventDate,'2026-09-30');assert.equal(reply.eventState,'today');assert.doesNotMatch(reply.body,/Cómo les fue|Surgió/);
});
test('receipt date uses the Lima weekday across UTC midnight and keeps date-only calendar values',()=>{
  for(const received_at of ['2026-09-30T03:00:00Z','2026-09-29']){
    const reply=draft(fixture({mail:[{...mail,received_at}]}));
    assert.equal(reply.eventDate,'2026-09-30');assert.equal(reply.eventState,'past');assert.match(reply.reason,/2026-09-29/);
  }
});
test('ambiguous dates and explicit dates are manual, never guessed',()=>{
  for(const text of [message.replace('el día miércoles','el próximo miércoles'),message.replace('el día miércoles','el miércoles 07/10'),message.replace('el día miércoles','el miércoles 7 de octubre'),message+' También hablamos el viernes.',message.replace('el día miércoles','el miércoles siguiente')]){
    const reply=draft(fixture({mail:[{...mail,body_text:text}]}));assert.equal(reply.eventDate,null);assert.equal(reply.needsHumanAnswer,true);assert.match(reply.body,/\[Escribe aquí tu respuesta y el siguiente paso acordado\.\]/);
  }
});
test('a missing latest body never borrows the original request or an older email',()=>{
  const reply=draft(fixture({mail:[{...mail,id:'older'}, {...mail,id:'newest',received_at:'2026-10-10T10:00:00Z',body_text:'',summary:message}]}));
  assert.equal(reply.mailId,'newest');assert.equal(reply.contextText,'');assert.equal(reply.reasonCode,'CONTENT_UNAVAILABLE');assert.equal(reply.needsHumanAnswer,true);
});
test('missing invalid, locale-dependent, future or impossible receipt dates require manual reply',()=>{
  for(const received_at of [null,'','28/09/2026','2026-02-30','2026-09-28T12:00:00','2026-10-12T12:00:00Z']){
    const reply=draft(fixture({mail:[{...mail,received_at}]}));assert.equal(reply.eventDate,null);assert.equal(reply.needsHumanAnswer,true);assert.equal(reply.reasonCode,'DATE_UNRELIABLE');
  }
});
test('an undated inbound prevents treating a dated row as the known latest',()=>{
  const reply=draft(fixture({mail:[mail,{...mail,id:'undated',received_at:null}]}));assert.equal(reply.mailId,'undated');assert.equal(reply.chronologyReliable,false);assert.equal(reply.needsHumanAnswer,true);
});
test('outbound, a different lead and staff maturity never shape the draft',()=>{
  const data=fixture({mail:[mail,{...mail,id:'other',lead_id:'other',received_at:now,body_text:'Enviar oferta'},{...mail,id:'sent',direction:'OUT',received_at:now,body_text:'Nueva reunión'}]});
  assert.deepEqual(draft(data),buildCaseReply({...lead,commercial_maturity_pct:0,next_action:'otra cosa'},data,{now}));assert.equal(draft(data).mailId,'inbound');
});
test('known Resend excerpt is evidenced content but transport date is not original author date',()=>{
  const row={...mail,body_text:undefined,provider:'RESEND_FORWARD',provider_message_id:'provider-id',source_payload:{email_id:'provider-id',source:'resend-forward'},summary:message,received_at:now};
  const reply=draft(fixture({mail:[row]}));assert.equal(reply.contextText,message);assert.equal(reply.bodySource,'resend_excerpt');assert.equal(reply.complete,true);assert.equal(reply.eventDate,null);assert.equal(reply.reasonCode,'DATE_UNRELIABLE');
  assert.match(reply.body,/¿Hubo alguna novedad en las coordinaciones internas\?/);
});
test('unknown or Zoho summaries are never interpreted as a full customer message',()=>{
  for(const provider of ['ZOHO_MAIL','RESEND_FORWARD','UNKNOWN']){
    const reply=draft(fixture({mail:[{...mail,body_text:undefined,provider,summary:message}]}));assert.equal(reply.contextText,'');assert.equal(reply.needsHumanAnswer,true);
  }
});
test('verified Resend matching activity recovers the complete captured body and rejects other activities',()=>{
  const body=message+' Contexto adicional del cliente.'.repeat(45);
  const row={...mail,body_text:undefined,provider:'RESEND_FORWARD',provider_message_id:'provider-id',source_payload:{email_id:'provider-id',source:'resend-forward'},summary:body.slice(0,1200)};
  const activity={lead_id:'case',type:'EMAIL',subject:row.subject,occurred_at:row.received_at,notes:body};
  const found=caseReplyContext(lead,fixture({mail:[row],activities:[activity]}));assert.equal(found.text,body);assert.equal(found.bodySource,'resend_activity');assert.equal(found.complete,true);
  for(const wrong of [{...activity,lead_id:'other'},{...activity,occurred_at:now},{...activity,subject:'otra'},{...activity,type:'CALL'}]){
    const reply=draft(fixture({mail:[row],activities:[wrong]}));assert.equal(reply.complete,false);assert.equal(reply.needsHumanAnswer,true);
  }
});
test('1200-character excerpts and 4000-character captured bodies stay incomplete',()=>{
  const body=message+' '.repeat(2)+'x'.repeat(4000-message.length-2);
  const row={...mail,body_text:undefined,provider:'RESEND_FORWARD',provider_message_id:'provider-id',source_payload:{email_id:'provider-id',source:'resend-forward'},summary:body.slice(0,1200)};
  for(const activities of [[],[{lead_id:'case',type:'EMAIL',subject:row.subject,occurred_at:row.received_at,notes:body}]]){
    const reply=draft(fixture({mail:[row],activities}));assert.equal(reply.complete,false);assert.equal(reply.reasonCode,'CONTENT_INCOMPLETE');assert.equal(reply.needsHumanAnswer,true);
  }
});
test('trailing whitespace at the truncation boundary cannot turn an excerpt into a complete message',()=>{
  const body=message+'x'.repeat(4000-message.length-1)+' ';
  const row={...mail,body_text:undefined,provider:'RESEND_FORWARD',provider_message_id:'provider-id',source_payload:{email_id:'provider-id',source:'resend-forward'},summary:body.slice(0,1200)};
  const data=fixture({mail:[row],activities:[{lead_id:'case',type:'EMAIL',subject:row.subject,occurred_at:row.received_at,notes:body}]});
  assert.equal(draft(data).complete,false);
  row.summary=message+'x'.repeat(1200-message.length-1)+' ';
  assert.equal(draft(fixture({mail:[row],activities:[]})).complete,false);
});
test('forwarded headers do not use import timestamp to turn an old Wednesday into a future event',()=>{
  const reply=draft(fixture({mail:[{...mail,received_at:now,body_text:'Fecha: Mon, 28 Sep 2026 12:00:00 +0000\n'+message}]}));assert.equal(reply.eventDate,null);assert.equal(reply.dateReliable,false);assert.equal(reply.needsHumanAnswer,true);
});
test('cancellations, negations, generic messages and quoted-only coordination require a human answer',()=>{
  for(const body_text of [message+' La reunión fue cancelada.',message+' No tendremos ese espacio.','¿Tienen microscopios disponibles?','Gracias.\n> '+message]){
    const reply=draft(fixture({mail:[{...mail,body_text}]}));assert.equal(reply.needsHumanAnswer,true);assert.equal(reply.eventDate,null);
  }
});
test('helpers are pure and drafts have a neutral greeting, no literal recipient or hidden instruction copied into outgoing body',()=>{
  const data=fixture();const before=JSON.stringify(data);const reply=draft(data);
  assert.equal(JSON.stringify(data),before);assert.match(reply.body,/^Hola Alex,/);assert.doesNotMatch(reply.body,/alex@example|Colegio de prueba|commercial_maturity/);assert.equal(reply.reviewRequired,true);
});
test('web-only and empty cases remain explicitly incomplete',()=>{
  for(const data of [fixture({mail:[]}),fixture({mail:[],activities:[]})]){const reply=draft(data);assert.equal(reply.needsHumanAnswer,true);assert.match(reply.body,/\[Escribe aquí tu respuesta y el siguiente paso acordado\.\]/);}
});
