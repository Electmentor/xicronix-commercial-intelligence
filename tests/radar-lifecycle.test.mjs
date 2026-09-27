import test from 'node:test';import assert from 'node:assert/strict';
import {radarState,radarNeedsAttention,radarTransition,renderRadarLifecycle} from '../radar-lifecycle.mjs';
import {executivePriority} from '../executive.mjs';
const now=new Date('2026-09-27T17:00:00Z');
const signal=(id,score=90)=>({id,workflow_status:'DETECTED',classification:'CRITICAL',weighted_score:score,actionable:true});
test('pending -> review -> resolved removes first, second ascends; discarded never reappears after rescore',()=>{
 const a=signal('a',95),b=signal('b',91),data={radar:[a,b]};
 assert.equal(executivePriority(data,{now}).id,'a');assert.equal(a.workflow_status,'DETECTED');
 const entry=radarTransition(a,'IN_REVIEW','Investigando','actor',now.toISOString());assert.equal(entry.from,'DETECTED');assert.equal(entry.actor_id,'actor');a.workflow_status=entry.to;
 assert.equal(executivePriority(data,{now}).id,'a');
 a.workflow_status=radarTransition(a,'RESOLVED','Atendida','actor',now.toISOString()).to;
 assert.equal(executivePriority(data,{now}).id,'b');
 b.workflow_status=radarTransition(b,'DISCARDED','Fuera de alcance','actor',now.toISOString()).to;
 a.weighted_score=100;b.classification='CRITICAL';assert.equal(executivePriority(data,{now}).kind,'general');
});
test('pending of higher score supersedes review; review without actionability is excluded',()=>{
 const a={...signal('review',90),workflow_status:'IN_REVIEW'},b=signal('pending',95);
 assert.equal(executivePriority({radar:[a,b]},{now}).id,'pending');a.actionable=false;assert.equal(radarNeedsAttention(a),false);
});
test('explicit reasons, closed-state refusal, legacy states and escaping',()=>{
 assert.throws(()=>radarTransition(signal('a'),'RESOLVED',' ','u','date'),/REASON_REQUIRED/);
 assert.throws(()=>radarTransition({...signal('a'),workflow_status:'RESOLVED'},'IN_REVIEW','','u','date'),/INVALID_TRANSITION/);
 assert.equal(radarState({...signal('a'),workflow_status:'RESEARCHING'}),'PENDING');
 const html=renderRadarLifecycle({...signal('a'),id:'<img>'},true);assert.match(html,/&lt;img&gt;/);
 const closed=renderRadarLifecycle({...signal('a'),workflow_status:'RESOLVED'},true);assert.doesNotMatch(closed,/data-radar-state/);assert.match(closed,/Historial/);
});
