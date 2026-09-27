import test from 'node:test';
import assert from 'node:assert/strict';
import {directorGeography,directorPriorityProspects,directorRecentSignals,renderDirectorInsights} from '../director-insights.mjs';
const now=new Date('2026-01-15T17:00:00Z');

test('six month sales reuse actual won PEN sales across the year boundary, excluding future and lost deals',()=>{
 const opportunities=[
  {stage:'WON',value:1000,expected_close_date:'2025-08-20'},
  {stage:'WON',value:2000,expected_close_date:'2026-01-15'},
  {stage:'WON',value:8000,expected_close_date:'2026-01-30'},
  {stage:'LOST',value:9000,expected_close_date:'2026-01-10'},
  {stage:'WON',value:9000,currency:'USD',expected_close_date:'2026-01-10'}
 ];
 const html=renderDirectorInsights({opportunities},{now});
 assert.match(html,/ago/);assert.match(html,/ene/);
 assert.match(html,/S\/\s1,000/);assert.match(html,/S\/\s2,000/);
 assert.doesNotMatch(html,/S\/\s8,000|S\/\s9,000/);
 assert.equal((html.match(/<dd>/g)||[]).length,6);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('territory percentages use an explicit denominator including unlocated records',()=>{
 const m=directorGeography({prospects:[{region:'Líma'},{department:'LIMA'},{region:'Cusco'},{}]});
 assert.equal(m.source,'prospects');assert.equal(m.total,4);
 assert.equal(m.regions.find(r=>r.label==='LIMA').percent,50);
 assert.equal(m.regions.find(r=>r.label==='SIN REGIÓN').percent,25);
 assert.equal(m.regions.reduce((s,r)=>s+r.percent,0),100);
 const snapshot=directorGeography({territorialDepartment:[{group_key:'LIMA',physical_accounts:90},{group_key:'CUSCO',physical_accounts:10}],prospects:[{region:'Arequipa'}]});
 assert.equal(snapshot.total,100);assert.equal(snapshot.source,'territorial');
 assert.equal(snapshot.regions[0].percent,90);
 assert.equal(directorGeography({}).total,0);
});
test('priorities follow existing operational bucket ordering and never invent a CRM stage',()=>{
 const data={prospects:[
  {id:'monitor',name:'Monitorear',operating_bucket:'MONITOR',xwin_score:100},
  {id:'active',name:'Prioridad',operating_bucket:'ACTION_NOW',institution_id:'i'},
  {id:'research',name:'Investigar',operating_bucket:'RESEARCH_FIRST'}
 ],leads:[{id:'l',institution_id:'i',status:'QUALIFIED'}],opportunities:[{lead_id:'l',stage:'PROPOSAL'}]};
 const rows=directorPriorityProspects(data);
 assert.deepEqual(rows.map(r=>r.row.id),['active','research','monitor']);
 assert.equal(rows[0].stage,'Propuesta');assert.equal(rows[1].stage,'Sin etapa CRM');
 const html=renderDirectorInsights(data,{now});
 assert.match(html,/data-director-prospect="active"/);
});
test('recent signals use evidence dates, omit discarded/future signals and retain unknown dates honestly',()=>{
 const radar=[{id:'old',classification:'HIGH',signal_date:'2026-01-10',updated_at:'2026-01-15'},
  {id:'new',signal_date:'2026-01-14'}, {id:'discard',classification:'DISCARD',signal_date:'2026-01-15'},
  {id:'future',signal_date:'2026-01-20'}, {id:'unknown'}];
 assert.deepEqual(directorRecentSignals({radar},now).map(x=>x.row.id),['new','old','unknown']);
 assert.match(renderDirectorInsights({radar},{now}),/Sin fecha/);
});
test('failed sources show unavailable state instead of chart zeros or stale records; external labels are escaped',()=>{
 const data={prospects:[{id:'p',name:'<img src=x>',operating_bucket:'ACTION_NOW'}],radar:[{id:'r',signal_summary:'<script>bad</script>'}]};
 const html=renderDirectorInsights(data,{now,failures:{opportunities:true,prospects:true,radar:true},pipeline:[['Lead',12]]});
 assert.doesNotMatch(html,/<svg|director-stage-track|data-director-prospect=|data-director-signal=|directorCoverageMap/);
 assert.match(html,/pendientes de cargar/);
 const escaped=renderDirectorInsights(data,{now});
 assert.match(escaped,/&lt;img src=x&gt;/);assert.match(escaped,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.doesNotMatch(escaped,/<script>|<img/);
});

