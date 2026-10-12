import {buildCaseReply,caseReplyContext} from '../case-reply.mjs';
// Executes the real detail-rendering function, without browser, network or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {escapeHTML,sortTasksByUrgency,money} from '../domain.mjs';
import {caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity,caseResponseProgress,caseOutboundStatus} from '../case-attention.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const detail=source.slice(source.indexOf('function openLeadDetails('),source.indexOf('\n\n\nlet aiAssistant',source.indexOf('function openLeadDetails(')));
const unconfirmed=source.slice(source.indexOf('function unconfirmedMailForLead('),source.indexOf('function openSmartMailDraft('));
const id='lead-a';
function render({contactEmail='ana@example.invalid',selectedMailId=null,outbox=[],extraActivity=[],readonly=false,mail=[],tasks=[],meetings=[],next_action='Revisar inventario interno',next_action_date=null}={}){
 const profile={id:'user-a',full_name:'Asesora sintética'};
 const lead={id,owner_user_id:profile.id,status:'NEW',institution_id:'school-a',contact_id:'contact-a',source:'WEBSITE',title:'Caso laboratorio',next_action,next_action_date,maturity_percent:15};
 const data={leads:[lead],contacts:[{id:'contact-a',first_name:'Ana',last_name:'Sintética',email:contactEmail}],institutions:[{id:'school-a',name:'Colegio sintético'}],activities:[{id:'web-a',lead_id:id,type:'WEB_FORM',subject:'Solicitud recibida',notes:'Requerimiento original: Laboratorio de física escolar, 30 m²\n<em>texto no confiable</em>\nContexto adicional: INSTRUCCION_INTERNA',occurred_at:'2026-10-01'},...extraActivity],commercial_mail_outbox:outbox,mail,tasks,meetings,documents:[],users:[]};
 const before=JSON.stringify(data);
 const nodes={leadDetailTitle:{},leadDetailSubtitle:{},leadDetailContent:{},leadDetailDialog:{showModal(){this.open=true;}}};
 const context=vm.createContext({data,profile,loading:false,busy:false,$:key=>nodes[key],scopedRows:table=>data[table]||[],esc:escapeHTML,caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity,caseResponseProgress,caseOutboundStatus,caseReplyContext,sortTasksByUrgency,money,commercialUrgency:()=>({label:'Pendiente'}),commercialPotential:()=>({label:'Sin evaluar'}),commercialHealth:()=>({label:'En curso'}),nextCommercialAction:l=>l.next_action,date:v=>v||'Sin fecha',enums:{status:{NEW:'Nuevo'},activityType:{WEB_FORM:'Formulario web',EMAIL:'Correo'},leadSource:{WEBSITE:'Web'},taskStatus:{},meetingMode:{},documentCategory:{},documentStatus:{}},nameOf:r=>[r.first_name,r.last_name].filter(Boolean).join(' '),writableFor:()=>!readonly,relationName:()=>'',assignedUserId:r=>r.owner_user_id,radarPhoneHref:()=>'',radarWhatsappHref:()=>'',MOVEMENT_ACTIONS:{},milestoneLabel:()=>'',currentDocumentVersion:()=>null,rememberPage:()=>{}});
 vm.runInContext(unconfirmed+'\n'+detail+'\nopenLeadDetails("'+id+'",'+JSON.stringify(selectedMailId)+');',context);
 assert.equal(JSON.stringify(data),before,'render must not mutate records');
 return {html:nodes.leadDetailContent.innerHTML,nodes};
}
test('detail shows evidenced request, responsible, next step, response and follow-up',()=>{
 const {html,nodes}=render();
 for(const text of ['Laboratorio de física escolar, 30 m²','Asesora sintética','Última acción','Siguiente paso','>Responder</button>','Seguimiento o cierre','Programar seguimiento'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('SOLICITUD')<html.indexOf('Indicadores comerciales'));
 assert.ok(html.includes('&lt;em&gt;texto no confiable&lt;/em&gt;'));
 assert.ok(!html.includes('<em>texto'));
 const request=html.match(/<p class="case-original-request">([\s\S]*?)<\/p>/)[1];
 assert.ok(!request.includes('INSTRUCCION_INTERNA'));assert.ok(!request.includes('inventario interno'));
 assert.equal(nodes.leadDetailDialog.open,true);
});
test('read-only account receives neither reply nor mutation actions',()=>{
 const {html}=render({readonly:true});
 assert.ok(!html.includes('data-smart-mail'));assert.ok(!html.includes('data-edit-lead'));assert.ok(!html.includes('data-create-task-lead'));
});
test('historical SENT without ID stays unconfirmed and reply is disabled',()=>{
 const {html}=render({outbox:[{id:'outbox-a',lead_id:id,status:'SENT',provider_message_id:null,subject:'Mensaje anterior',body:'Texto',sent_at:'2026-10-02'}]});
 assert.match(html,/Hay un envío sin confirmación/);assert.match(html,/data-smart-mail="lead-a" disabled/);assert.match(html,/ENVÍO SIN CONFIRMACIÓN/);
 assert.ok(!html.includes('ACEPTADO POR PROVEEDOR'));
});
test('accepted provider mail is distinguished from recipient delivery',()=>{
 const {html}=render({outbox:[{id:'outbox-a',lead_id:id,status:'SENT',provider_message_id:'provider-a',subject:'Respuesta',body:'Texto',sent_at:'2026-10-02'}]});
 assert.match(html,/ACEPTADO POR PROVEEDOR · ENTREGA NO CONFIRMADA/);assert.ok(!html.includes('Hay un envío sin confirmación'));
});
test('legacy false-confirmation activity is labelled and blocks another response',()=>{
 const {html}=render({extraActivity:[{id:'activity-a',lead_id:id,type:'EMAIL',subject:'Correo enviado · previo',notes:'Texto',evidence_note:'Envío confirmado por Resend. ID: no disponible',occurred_at:'2026-10-02'}]});
 assert.match(html,/Hay un envío sin confirmación/);assert.match(html,/Registro de envío sin confirmación/);assert.match(html,/data-smart-mail="lead-a" disabled/);
});
test('messages explicitly linked to another case never enter this conversation',()=>{
 const {html}=render({mail:[{id:'mail-other',lead_id:'other-case',contact_id:'contact-a',subject:'OTRO_ASUNTO_PRIVADO',summary:'OTRO_CUERPO_PRIVADO'}]});
 assert.ok(!html.includes('OTRO_ASUNTO_PRIVADO'));assert.ok(!html.includes('OTRO_CUERPO_PRIVADO'));
});


const received={id:'received',lead_id:id,status:'NEW',subject:'Consulta reciente',body_text:'Solicitamos información del laboratorio.',received_at:'2026-10-10T09:00:00Z'};
const sent={id:'sent',lead_id:id,status:'SENT',provider_message_id:'accepted-id',subject:'Respuesta del caso',sent_at:'2026-10-10T10:00:00Z'};
const nextStep=html=>html.match(/<dt>Siguiente paso<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1];
test('accepted send without a mocked activity advances the actual detail to follow-up',()=>{
 const {html}=render({mail:[received],outbox:[sent]});
 assert.equal(nextStep(html),'Esperar respuesta o programar seguimiento.');assert.match(html,/Correo aceptado por el proveedor/);assert.match(html,/>Escribir correo<\/button>/);
 assert.doesNotMatch(nextStep(html),/responder|Recuperar/);
});
test('provider-evidenced activity advances follow-up when outbox is unavailable under RLS',()=>{
 const {html}=render({mail:[received],extraActivity:[{lead_id:id,type:'EMAIL',subject:'Correo aceptado por proveedor · respuesta',occurred_at:sent.sent_at,evidence_note:'Aceptado por Resend. Entrega al destinatario no confirmada. ID: accepted-id. Referencia CRM: fixture. Adjuntos: 0'}]});
 assert.equal(nextStep(html),'Esperar respuesta o programar seguimiento.');
});
test('detail preserves a manual future task or lead plan after acceptance',()=>{
 const task={lead_id:id,status:'PENDING',title:'Confirmar inventario acordado',due_at:'2099-10-12T10:00:00Z'};
 assert.equal(nextStep(render({mail:[received],outbox:[sent],tasks:[task]}).html),task.title);
 assert.equal(nextStep(render({mail:[received],outbox:[sent],next_action:'Coordinar visita acordada',next_action_date:'2099-10-13T10:00:00Z'}).html),'Coordinar visita acordada');
});
test('a new inbound after the last accepted send restores detail response guidance',()=>{
 const {html}=render({mail:[{...received,received_at:'2026-10-10T11:00:00Z'}],outbox:[sent]});
 assert.match(nextStep(html),/responder según su mensaje/);assert.match(html,/>Responder<\/button>/);
});


test('placeholder provider IDs cannot present an accepted send or suppress detail response',()=>{
 const {html}=render({mail:[received],outbox:[{...sent,provider_message_id:'no disponible'}]});
 assert.match(html,/Hay un envío sin confirmación/);assert.match(nextStep(html),/Revisar el envío sin confirmación/);assert.doesNotMatch(html,/ACEPTADO POR PROVEEDOR/);
});
test('missing source receipt date remains response work despite an import timestamp',()=>{
 const {html}=render({mail:[{...received,received_at:null,created_at:'2026-10-09T10:00:00Z'}],outbox:[sent]});
 assert.doesNotMatch(nextStep(html),/Esperar respuesta o programar seguimiento/);assert.match(html,/>Responder<\/button>/);
});
test('detail offers reply to evidenced inbound sender even without stored contact email',()=>{
 const {html}=render({contactEmail:'',mail:[{...received,from_address:'sender@example.invalid'}]});assert.match(html,/data-smart-mail="lead-a"/);assert.match(html,/sender@example.invalid/);
});
test('detail uses one selected inbox for context and passes that ID to reply',()=>{
 const other={...received,id:'newer',subject:'OTRO_TICKET',body_text:'Texto de otro ticket',received_at:'2026-10-11T11:00:00Z'};
 const {html}=render({mail:[received,other],selectedMailId:'received'});assert.match(html,/data-smart-mail-inbox="received"/);
 const situation=html.match(/<section class="lead-situation">([\s\S]*?)<\/section>/)?.[1];assert.match(situation,/Consulta reciente/);assert.doesNotMatch(situation,/OTRO_TICKET|Texto de otro ticket/);
});
