import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseOpportunity,loadOpportunity,nextBestAction,opportunityReply,prepareOpportunityAction} from '../assistant-opportunity.mjs';
import {createHandler} from '../api/assistant.mjs';
const now=Date.parse('2026-09-27T20:00:00Z'),auth={id:'user',organization_id:'org',role:'ADMIN'};
const o={id:'00000000-0000-4000-8000-000000000001',organization_id:'org',name:'Laboratorio Alfa',institution_id:'00000000-0000-4000-8000-000000000003',lead_id:'00000000-0000-4000-8000-000000000004',stage:'NEGOTIATION',owner_user_id:'user',value:25000,probability:40};
const other={...o,id:'00000000-0000-4000-8000-000000000002',name:'Robótica Alfa'};
const context=()=>({opportunity:{...o},institutions:[{name:'Colegio Alfa'}],contacts:[],activities:[],tasks:[],meetings:[],documents:[],radar:[]});
const loaded=c=>({context:c,now,source:'live',stage:'Negociación',activeOpportunity:o.id,activeOpportunityLabel:o.name,limitations:[]});
const answer=(message,c=context())=>opportunityReply(loaded(c),message,auth).answer;
test('selected opportunity, change, persistence across page and explicit name precedence',()=>{
 assert.equal(chooseOpportunity([o,other],{selected:{kind:'opportunities',id:o.id}}).opportunity.id,o.id);
 assert.equal(chooseOpportunity([o,other],{activeOpportunity:o.id,message:'¿Qué falta?'}).opportunity.id,o.id);
 assert.equal(chooseOpportunity([o,other],{activeOpportunity:o.id,selected:{kind:'opportunities',id:other.id}}).opportunity.id,other.id);
 assert.equal(chooseOpportunity([o,other],{activeOpportunity:o.id,message:'Trabajemos con Robótica Alfa'}).opportunity.id,other.id);
 assert.equal(chooseOpportunity([o,other],{message:'cerrar contexto',activeOpportunity:o.id}).cleared,true);
});
test('ambiguous institution never picks arbitrarily; consumed selection does not override focus',()=>{
 assert.equal(chooseOpportunity([o,other],{selected:{kind:'institutions',id:o.institution_id}}).choices.length,2);
 const selected={kind:'opportunities',id:other.id};assert.equal(chooseOpportunity([o,other],{selected,consumedSelection:selected,activeOpportunity:o.id}).opportunity.id,o.id);
 assert.equal(chooseOpportunity([other],{activeOpportunity:o.id}).unavailable,true);
});
test('next action: overdue beats meeting, completed excluded, no imaginary deadline',()=>{
 const c=context();c.tasks=[{id:'t',title:'Validar alcance',status:'PENDING',due_at:'2026-09-26',assigned_to:'user'}];c.meetings=[{id:'m',title:'Reunión',status:'SCHEDULED',start_at:'2026-09-28'}];
 assert.equal(nextBestAction(c,now).source,'Tareas');assert.match(answer('¿Qué hago ahora?',c),/Validar alcance/);
 c.tasks[0].status='COMPLETED';assert.equal(nextBestAction(c,now).source,'Agenda');c.meetings=[];assert.equal(nextBestAction(c,now).date,null);
});
test('unknown decision maker and budget are not invented from value, role or score',()=>{
 const c=context();c.contacts=[{first_name:'Karen',job_title:'Directora',decision_level:'UNKNOWN'}];c.radar=[{weighted_score:99}];
 assert.match(answer('¿Quién decide?',c),/No tengo evidencia suficiente/);assert.doesNotMatch(answer('¿Quién decide?',c),/Karen/);
 assert.match(answer('¿Hay presupuesto?',c),/no acredita presupuesto/);assert.doesNotMatch(answer('¿Hay presupuesto?',c),/25000|99/);
 c.contacts[0].decision_level='DECISION_MAKER';assert.match(answer('¿Quién decide?',c),/Karen/);
});
test('meeting preparation, objections and risks use only recorded evidence',()=>{
 const c=context();c.activities=[{id:'a',subject:'Objeción registrada',notes:'Solicita validar instalación',occurred_at:'2026-09-26'}];c.radar=[{principal_risk:'Plazo de importación pendiente'}];
 assert.match(answer('Prepárame para hablar con ellos.',c),/Solicita validar instalación/);assert.match(answer('¿Qué riesgos tenemos?',c),/Plazo de importación pendiente/);
 assert.match(answer('¿Qué objeciones existen?',c),/Solicita validar instalación/);assert.match(answer('¿Cuál fue el último contacto?',c),/Último movimiento registrado/);
});
test('brief, clarification and required real questions retain the same opportunity',()=>{
 for(const q of ['¿Qué sabemos de esta oportunidad?','¿Quién decide?','¿Qué falta?','¿Qué hago ahora?','Prepárame para hablar con ellos.','¿Qué requiere autorización?','Resúmelo.','No entiendo.','Más breve.']){const r=opportunityReply(loaded(context()),q,auth);assert.equal(r.activeOpportunity,o.id);assert.match(r.answer,/Laboratorio Alfa/);assert.doesNotMatch(r.answer,/00000000/);}
 assert.ok(answer('Más breve.').split(/\s+/).length<90);assert.match(answer('Dame detalle técnico.'),/00000000/);
});
test('Human Gate never writes or claims dispatch; viewer cannot prepare writes',()=>{
 assert.match(answer('Envíale esta propuesta'),/Requiere autorización/);assert.match(answer('¿Qué requiere autorización?'),/No se ha ejecutado/);
 assert.equal(prepareOpportunityAction(context(),'Registra que hablé con Karen',{...auth,role:'VIEWER'}).action,undefined);
 const a=prepareOpportunityAction(context(),'Registra que hoy hablé con Karen',auth);assert.equal(a.action.table,'activities');assert.equal(a.action.initial.opportunity_id,o.id);assert.equal(a.action.initial.notes,'Registra que hoy hablé con Karen');assert.match(a.answer,/antes de guardarlo/);
});
test('controlled post-meeting draft, task and material change reuse editor contracts',()=>{
 assert.equal(prepareOpportunityAction(context(),'Crea una tarea: Validar alcance',auth).action.initial.title,'Validar alcance');
 assert.equal(prepareOpportunityAction(context(),'Registra resultado de reunión: acordamos revisar alcance',auth).action.initial.subject,'Resultado de reunión');
 assert.equal(prepareOpportunityAction(context(),'Actualiza la oportunidad',auth).action.id,o.id);
});
test('loader authenticates scope, ignores forged context, refreshes every request and does not write',async()=>{
 const calls=[];let state='NEGOTIATION';const fetcher=async(url,opt)=>{url=new URL(url);calls.push(url);assert.equal(opt.headers.Authorization,'Bearer user');assert.equal(opt.method,undefined);assert.equal(url.searchParams.get('organization_id'),'eq.org');const table=url.pathname.split('/').at(-1);return Response.json(table==='opportunities'?[{...o,stage:state},{...other,organization_id:'foreign'}]:[]);};
 const payload={message:'¿Qué falta?',context:{source:'live',workspace:'admin',activeOpportunity:o.id,records:{contacts:{sample:[{first_name:'Fake'}]}}}};
 const a=await loadOpportunity(payload,auth,'Bearer user',{fetcher,now,base:'https://test',key:'public'});assert.equal(a.context.opportunity.id,o.id);assert.doesNotMatch(JSON.stringify(a),/Fake|foreign/);
 state='WON';const b=await loadOpportunity(payload,auth,'Bearer user',{fetcher,now,base:'https://test',key:'public'});assert.equal(b.context.opportunity.stage,'WON');assert.ok(calls.some(u=>u.searchParams.get('opportunity_id')==='eq.'+o.id));
});
test('seller cannot activate another owners opportunity; failures are disclosed',async()=>{
 const payload={message:'¿Qué falta?',context:{source:'live',workspace:'admin',activeOpportunity:o.id}};
 const result=await loadOpportunity(payload,{...auth,role:'SALES',id:'different'},'Bearer user',{base:'https://test',key:'public',fetcher:async()=>Response.json([o])});assert.match(result.answer,/no está accesible/);
 const failed=await loadOpportunity(payload,auth,'Bearer user',{base:'https://test',key:'public',fetcher:async()=>new Response('',{status:403})});assert.match(failed.answer,/no está accesible/);
});
test('API active mode is authenticated, returns scope label and deterministic metrics without provider call',async()=>{
 let calls=0;const handler=createHandler({authenticate:async()=>auth,prepareOpportunity:async()=>loaded(context()),generate:async()=>{calls++;}});
 const r=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({message:'¿Qué falta?',context:{page:'opportunities'}})}));const body=await r.json();assert.equal(body.activeOpportunity,o.id);assert.equal(calls,0);assert.equal(body.metrics.provider_tokens,0);assert.equal(body.context,undefined);
});


test('NBA v2 prioritizes overdue critical task over meeting and strategic gaps',()=>{
 const c=context();
 c.tasks=[{id:'t-critical',title:'Responder propuesta',status:'PENDING',priority:'CRITICAL',due_at:'2026-09-26',assigned_to:'user'}];
 c.meetings=[{id:'m',title:'Reunión mañana',status:'SCHEDULED',start_at:'2026-09-28'}];
 c.contacts=[];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Tareas');
 assert.match(n.text,/Responder propuesta/);
 assert.ok(n.factors.includes('vencida'));
});

test('NBA v2 raises missing decision maker in proposal and negotiation without inventing one',()=>{
 const c=context();c.opportunity.stage='NEGOTIATION';c.tasks=[];c.meetings=[];c.contacts=[{first_name:'Karen',job_title:'Directora',decision_level:'UNKNOWN'}];
 c.activities=[{id:'a',subject:'Seguimiento',occurred_at:'2026-09-27T18:00:00Z',budget_signal:'CONFIRMED'}];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Contactos');
 assert.match(n.text,/Validar quién decide/);
 assert.ok(n.factors.includes('decisor no identificado'));
});

test('NBA v2 treats budget as evidence gap and never derives it from opportunity value',()=>{
 const c=context();c.opportunity.stage='PROPOSAL';c.opportunity.value=900000;c.tasks=[];c.meetings=[];c.contacts=[{first_name:'Ana',decision_level:'DECISION_MAKER'}];c.activities=[{id:'a',subject:'Contacto',occurred_at:'2026-09-27T18:00:00Z'}];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Historial');
 assert.match(n.text,/situación presupuestaria/);
 assert.doesNotMatch(n.why,/900000|aprobado/);
});

test('NBA v2 uses recent recorded objection without claiming it is resolved',()=>{
 const c=context();c.opportunity.stage='NEGOTIATION';c.tasks=[];c.meetings=[];c.contacts=[{first_name:'Ana',decision_level:'DECISION_MAKER'}];
 c.activities=[{id:'b',subject:'Presupuesto confirmado',budget_signal:'CONFIRMED',occurred_at:'2026-09-26T10:00:00Z'},{id:'o',subject:'Objeción por plazo',notes:'Solicita entrega más rápida',occurred_at:'2026-09-27T10:00:00Z'}];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Historial');
 assert.match(n.text,/objeción registrada/i);
 assert.match(n.why,/no consta/i);
});

test('NBA v2 flags stale history conservatively and does not order contact',()=>{
 const c=context();c.opportunity.stage='PROPOSAL';c.tasks=[];c.meetings=[];c.contacts=[{first_name:'Ana',decision_level:'DECISION_MAKER'}];
 c.activities=[{id:'b',subject:'Presupuesto',budget_signal:'CONFIRMED',occurred_at:'2026-09-01T10:00:00Z'}];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Historial');
 assert.match(n.text,/Revisar si corresponde un seguimiento/);
 assert.doesNotMatch(n.text,/Contactar|Llamar|Enviar/);
});

test('NBA v2 uses expected close only as urgency context, never a win probability',()=>{
 const c=context();c.opportunity.stage='NEGOTIATION';c.opportunity.expected_close_date='2026-09-30';c.tasks=[];c.meetings=[];
 c.contacts=[{first_name:'Ana',decision_level:'DECISION_MAKER'}];c.activities=[{id:'b',subject:'Presupuesto',budget_signal:'CONFIRMED',occurred_at:'2026-09-27T18:00:00Z'}];
 const n=nextBestAction(c,now);
 assert.equal(n.source,'Oportunidades');
 assert.match(n.text,/plan de cierre/);
 assert.match(n.why,/no implica probabilidad de cierre/);
 assert.doesNotMatch(JSON.stringify(n),/probabilidad.*\d+%/i);
});
