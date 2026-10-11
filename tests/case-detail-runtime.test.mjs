import {buildCaseReply,caseReplyContext} from '../case-reply.mjs';
// Executes the real detail-rendering function, without browser, network or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {escapeHTML,sortTasksByUrgency,money} from '../domain.mjs';
import {caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity} from '../case-attention.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const detail=source.slice(source.indexOf('function openLeadDetails('),source.indexOf('\n\n\nlet aiAssistant',source.indexOf('function openLeadDetails(')));
const unconfirmed=source.slice(source.indexOf('function unconfirmedMailForLead('),source.indexOf('function openSmartMailDraft('));
const id='lead-a';
function render({outbox=[],extraActivity=[],readonly=false,mail=[]}={}){
 const profile={id:'user-a',full_name:'Asesora sintética'};
 const lead={id,owner_user_id:profile.id,status:'NEW',institution_id:'school-a',contact_id:'contact-a',source:'WEBSITE',title:'Caso laboratorio',next_action:'Revisar inventario interno',maturity_percent:15};
 const data={leads:[lead],contacts:[{id:'contact-a',first_name:'Ana',last_name:'Sintética',email:'ana@example.invalid'}],institutions:[{id:'school-a',name:'Colegio sintético'}],activities:[{id:'web-a',lead_id:id,type:'WEB_FORM',subject:'Solicitud recibida',notes:'Requerimiento original: Laboratorio de física escolar, 30 m²\n<em>texto no confiable</em>\nContexto adicional: INSTRUCCION_INTERNA',occurred_at:'2026-10-01'},...extraActivity],commercial_mail_outbox:outbox,mail,tasks:[],meetings:[],documents:[],users:[]};
 const before=JSON.stringify(data);
 const nodes={leadDetailTitle:{},leadDetailSubtitle:{},leadDetailContent:{},leadDetailDialog:{showModal(){this.open=true;}}};
 const context=vm.createContext({data,profile,loading:false,busy:false,$:key=>nodes[key],scopedRows:table=>data[table]||[],esc:escapeHTML,caseRequestContext,caseInboundMail,caseUnconfirmedMailActivity,caseReplyContext,sortTasksByUrgency,money,commercialUrgency:()=>({label:'Pendiente'}),commercialPotential:()=>({label:'Sin evaluar'}),commercialHealth:()=>({label:'En curso'}),nextCommercialAction:l=>l.next_action,date:v=>v||'Sin fecha',enums:{status:{NEW:'Nuevo'},activityType:{WEB_FORM:'Formulario web',EMAIL:'Correo'},leadSource:{WEBSITE:'Web'},taskStatus:{},meetingMode:{},documentCategory:{},documentStatus:{}},nameOf:r=>[r.first_name,r.last_name].filter(Boolean).join(' '),writableFor:()=>!readonly,relationName:()=>'',assignedUserId:r=>r.owner_user_id,radarPhoneHref:()=>'',radarWhatsappHref:()=>'',MOVEMENT_ACTIONS:{},milestoneLabel:()=>'',currentDocumentVersion:()=>null,rememberPage:()=>{}});
 vm.runInContext(unconfirmed+'\n'+detail+'\nopenLeadDetails("'+id+'");',context);
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
