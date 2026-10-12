import test from 'node:test';
import assert from 'node:assert/strict';
import {directionCases,directionCase,renderDirectionCases,renderDirectionDetail,proposalIsCurrent,caseError} from '../case-direction.mjs';
import {crmClientConfig,DEV_CRM,PROD_CRM,DIRECTION_DEV_BRANCH} from '../crm-environment.mjs';
import {environmentConfig} from '../api/case-direction-environment.mjs';
const org='org',lead={id:'case',organization_id:org,title:'Solicitud técnica',owner_user_id:null,updated_at:'2026-10-12T10:00:00Z'};
const data={leads:[lead],users:[{id:'director',organization_id:org,full_name:'Dirección',role:'ADMIN'}],tasks:[],crm_case_requests:[],crm_case_direction:[]};
test('incomplete case can be assigned without an invented customer request',()=>{
 const c=directionCase(lead,data);assert.equal(c.action,'ASSIGN');assert.match(c.request,/Falta recuperar la solicitud original/);assert.ok(c.reasons.includes('Sin responsable asignado'));
 const html=renderDirectionCases(data,{user:data.users[0]});assert.match(html,/Asignar o reasignar/);assert.match(html,/Sin fecha/);assert.doesNotMatch(html,/>Responder</);
});
test('intervention prioritizes escalations and blockers without hiding missing owners',()=>{
 const second={...lead,id:'escalated',owner_user_id:'director',next_action:'Revisar',next_action_date:'2099-01-01'};
 const d={...data,leads:[lead,second],crm_case_requests:[{id:'e',organization_id:org,lead_id:second.id,category:'ESCALATION',status:'PENDING',payload:{scope:'Cliente solicita intervención'}}]};
 const rows=directionCases(d);assert.equal(rows[0].lead.id,second.id);assert.equal(rows[0].action,'ESCALATION');assert.equal(rows.length,2);
});
test('discarded, waiting, resolved and closed are separate from commercial conversion',()=>{
 const leads=['discarded','waiting','resolved','closed','converted'].map(id=>({...lead,id,status:id==='converted'?'CONVERTED':'NEW'}));
 const d={...data,leads,crm_case_direction:[['discarded','DISCARDED'],['waiting','WAITING_CUSTOMER'],['resolved','RESOLVED'],['closed','CLOSED']].map(([lead_id,lifecycle])=>({lead_id,lifecycle,priority:'MEDIUM'}))};
 assert.deepEqual(directionCases(d,{filter:'closed'}).map(c=>c.lead.id),['closed']);
 const ids=directionCases(d).map(c=>c.lead.id);assert.ok(ids.includes('waiting'));assert.ok(ids.includes('resolved'));assert.ok(ids.includes('converted'));assert.ok(!ids.includes('discarded'));
 assert.match(renderDirectionCases(d,{filter:'all'}),/Descartado · no resuelto/);
});
test('search uses request, owner and next action; empty results are explicit',()=>{
 const d={...data,leads:[{...lead,owner_user_id:'director',next_action:'Comprobar inventario'}]};
 assert.equal(directionCases(d,{filter:'all',search:'DIRECCION'}).length,1);assert.equal(directionCases(d,{filter:'all',search:'inventario'}).length,1);assert.match(renderDirectionCases(d,{search:'ausente'}),/Sin casos en esta selección/);
});
test('a treatment decision does not remove the blocker until verified',()=>{
 const r={id:'block',lead_id:lead.id,organization_id:org,category:'BLOCKER',status:'APPROVED',payload:{scope:'Falta documento'}};
 const d={...data,crm_case_requests:[r]};assert.equal(directionCase(lead,d).action,'VERIFY_BLOCKER');assert.match(renderDirectionDetail(lead,d),/Comprobar resolución/);
 r.status='RESOLVED';assert.ok(!directionCase(lead,d).reasons.some(s=>s.startsWith('Bloqueo')));
});
test('proposal approval only labels the exact current revision as valid',()=>{
 const r={id:'proposal',category:'PROPOSAL',status:'APPROVED',lead_id:lead.id,organization_id:org,payload:{scope:'Equipamiento',quote_id:'q',quote_revision:1,amount:100,margin_pct:25,currency:'PEN'}};
 const d={...data,quotes:[{id:'q',revision:2}],crm_case_requests:[r]};assert.equal(proposalIsCurrent(r,d),false);assert.match(renderDirectionDetail(lead,d),/esta decisión no autoriza la versión actual/);
});
test('human copy and records escape untrusted HTML',()=>{
 const d={...data,leads:[{...lead,title:'<script>evil</script>',next_action:'<img src=x>'}]};const html=renderDirectionCases(d);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>evil'));
});
test('authorization, business-rule and conflict failures provide actionable copy',()=>{
 for(const code of ['CASE_DIRECTION_REQUIRED','CASE_CONFLICT','CASE_APPROVAL_RULE_REQUIRED','CASE_PENDING_ACTIONS','CASE_PROPOSAL_CHANGED'])assert.notEqual(caseError({message:code}),caseError({message:'unknown'}));
 assert.match(caseError({message:'network'}),/conserva lo escrito/);
});
test('production and DEV use separate API endpoints and session storage',async()=>{
 assert.deepEqual(await crmClientConfig('xicronix-commercial-intelligence.vercel.app'),PROD_CRM);assert.deepEqual(await crmClientConfig('localhost'),DEV_CRM);assert.notEqual(DEV_CRM.url,PROD_CRM.url);assert.notEqual(DEV_CRM.storageKey,PROD_CRM.storageKey);
 assert.deepEqual(environmentConfig({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:DIRECTION_DEV_BRANCH}),DEV_CRM);assert.equal(environmentConfig({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:DIRECTION_DEV_BRANCH}),null);assert.equal(environmentConfig({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}),null);
 await assert.rejects(crmClientConfig('unknown-preview.vercel.app',{fetcher:async()=>({ok:false})}),/evitar mezclar/);
 await assert.rejects(crmClientConfig('unknown-preview.vercel.app',{fetcher:async()=>({ok:true,json:async()=>PROD_CRM})}),/no verificada/);
});
