import test from 'node:test';
import assert from 'node:assert/strict';
import {executivePriority,renderExecutive} from '../executive.mjs';
const now=new Date('2026-09-27T17:00:00Z');
const seed=()=>({radar:[{id:'r',classification:'CRITICAL',signal_summary:'Decisión',signal_date:'2026-09-26'}],opportunities:[{id:'o',stage:'NEGOTIATION',value:200000,name:'Proyecto'}],tasks:[{id:'t',status:'PENDING',due_at:'2026-09-26T10:00:00Z',title:'Llamar'}],leads:[{id:'l',status:'NEW',title:'Cuenta',next_action:'Contactar',next_action_date:'2026-09-26'}]});
test('priority promotes next pending category after each resolution without dismissing on read',()=>{
 const data=seed();const pick=()=>executivePriority(data,{now});
 assert.equal(pick().id,'r');assert.equal(pick().id,'r');data.radar[0].classification='DISCARD';
 assert.equal(pick().id,'o');data.opportunities[0].stage='WON';
 assert.equal(pick().id,'t');data.tasks[0].status='COMPLETED';
 assert.equal(pick().id,'l');data.leads[0].status='CONVERTED';assert.equal(pick().kind,'general');
});
test('score/value/deadline ranking, future signals, currency and loaded data failures',()=>{
 const data=seed();data.radar[0].signal_date='2027-01-01';assert.equal(executivePriority(data,{now}).id,'o');
 data.opportunities.push({id:'big',stage:'PROPOSAL',value:300000,currency:'PEN'});assert.equal(executivePriority(data,{now}).id,'big');
 data.opportunities[1].currency='USD';assert.equal(executivePriority(data,{now}).id,'o');
 assert.equal(executivePriority(data,{now,failures:{radar:true}}).kind,'unavailable');
 assert.equal(executivePriority({tasks:[{id:'later',status:'PENDING',due_at:'2026-10-05'}]},{now}).kind,'general');
});
test('single shared greeting and exact escaped action; partial unrelated sources do not suppress priority',()=>{
 const data=seed();data.radar[0].signal_summary='<script>bad</script>';
 const html=renderExecutive(data,{now,failures:{expenses:true}});
 assert.equal((html.match(/Hola, Toshi/g)||[]).length,1);assert.equal((html.match(/id="ceoMethodBtn"/g)||[]).length,1);
 assert.match(html,/data-executive-priority="r" data-priority-table="radar"/);assert.match(html,/&lt;script&gt;/);
});

test('second signal ascends when the highest score signal is no longer pending',()=>{
 const data=seed();data.radar[0].weighted_score=90;data.radar.push({id:'r2',classification:'CRITICAL',weighted_score:80});
 assert.equal(executivePriority(data,{now}).id,'r');data.radar[0].resolved_at=now.toISOString();
 assert.equal(executivePriority(data,{now}).id,'r2');
});
