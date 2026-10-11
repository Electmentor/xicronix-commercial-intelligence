import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoData,mutateDemo,realOnly,DEMO_SELLERS} from '../demo.mjs';
import {executiveMetrics,renderExecutive,margin,filterExecutiveRows} from '../executive.mjs';
import {performanceModel,renderPerformance} from '../performance.mjs';
const now=new Date('2026-09-09T15:00:00Z');
test('complete demo graph has five productive sellers and valid links in every module',()=>{
 const d=createDemoData('org',now);
 assert.deepEqual(Object.fromEntries(Object.entries(d).map(([key,rows])=>[key,rows.length])),{prospects:24,radar:16,mail:18,institutions:20,contacts:30,leads:40,opportunities:85,tasks:50,meetings:18,deliverables:14,documents:12,document_versions:12,activities:80,catalog_products:5,cost_profiles:1,scores:40,users:5,goals:20,expenses:72,demo_migrations:1});
 for(const rows of Object.values(d))for(const row of rows)assert.equal(row.is_simulated,true);
 const references={institution_id:'institutions',contact_id:'contacts',lead_id:'leads',opportunity_id:'opportunities',owner_user_id:'users',assigned_to:'users',created_by:'users',catalog_product_id:'catalog_products',cost_profile_id:'cost_profiles',document_id:'documents'};
 for(const rows of Object.values(d))for(const row of rows)for(const [key,table] of Object.entries(references))if(row[key])assert.ok(d[table].some(other=>other.id===row[key]),key+': '+row.id);
 for(const seller of DEMO_SELLERS)assert.ok(d.opportunities.some(row=>row.owner_user_id===seller.id&&row.stage==='WON'));
 for(const version of d.document_versions){
  const document=d.documents.find(row=>row.id===version.document_id);
  assert.equal(version.lead_id,document.lead_id);
  assert.equal(version.version_number,document.current_version);
  assert.equal(version.storage_path,null,'demo documents must not point to real files');
 }
 assert.equal(executiveMetrics(d,now).team.length,5);
});
test('monthly totals reconcile, forecasts exclude lost/other-month deals and margin can be negative',()=>{
 const d=createDemoData('org',now),m=executiveMetrics(d,now);
 const expected=d.opportunities.filter(row=>row.stage==='WON'&&row.expected_close_date.startsWith('2026-09')).reduce((sum,row)=>sum+row.value,0);
 assert.equal(m.revenue,expected);
 assert.equal(m.revenue,m.team.reduce((sum,row)=>sum+row.sales,0));
 assert.equal(m.pipeline,d.opportunities.filter(row=>!['WON','LOST'].includes(row.stage)).reduce((sum,row)=>sum+row.value,0));
 assert.equal(m.atRisk.length,new Set(m.atRisk.map(row=>row.id)).size);
 assert.ok(m.decisions.some(row=>row.title.includes('pérdida')));
 assert.equal(margin({value:100,estimated_cost:120}),-20);
 const before=m.revenue;
 d.opportunities.push({id:'old',stage:'WON',expected_close_date:'2026-08-10',value:999999,estimated_cost:0});
 assert.equal(executiveMetrics(d,now).revenue,before);
});
test('missing costs are explicit; zero targets and incomplete loads do not fabricate certainty',()=>{
 const d=createDemoData('org',now);
 const won=d.opportunities.find(row=>row.stage==='WON');won.estimated_cost=null;
 d.goals.find(row=>row.owner_user_id===null).target_won_value=0;
 const m=executiveMetrics(d,now);
 assert.equal(m.unknownCosts,1);assert.equal(m.attainment,null);
 assert.equal(margin(won),null);
 // Detailed profitability moved from Direction to the dedicated performance view.
 const performance=performanceModel(d,{now,demo:true,period:'month'});
 assert.equal(performance.m.totals.unknownCosts,1);
 assert.equal(performance.m.totals.grossMargin,null);
 assert.equal(performance.m.totals.operatingResult,null);
 const financialOutput=renderPerformance(d,{now,demo:true,period:'month'});
 assert.match(financialOutput,/1 ventas sin costo; completa los datos/);
 assert.match(financialOutput,/Resultado operativo estimado<\/span><strong>—<\/strong>/);
 const output=renderExecutive(d,{now,failures:{opportunities:true}});
 assert.match(output,/INFORMACIÓN PARCIAL/);
 assert.doesNotMatch(output,/data-edit="demo-opportunity/);
});
test('demo mutation recalculates potential and guards linked deletion',()=>{
 const d=createDemoData('org',now),lead=d.leads[0];
 mutateDemo(d,'leads','update',{next_action:'Llamar',next_action_date:now.toISOString()},{id:lead.id,org:'org',userId:lead.owner_user_id,now});
 assert.ok(d.scores.find(row=>row.lead_id===lead.id).total_score>=75);
 assert.throws(()=>mutateDemo(d,'institutions','delete',null,{id:d.institutions[0].id,org:'org',now}),/vinculados/);
 mutateDemo(d,'institutions','insert',{name:'Nueva demo'},{org:'org',userId:'demo-seller-1',now});
 const added=d.institutions[0];assert.equal(added.is_simulated,true);
 mutateDemo(d,'institutions','delete',null,{id:added.id,org:'org',now});
 assert.equal(d.institutions.some(row=>row.id===added.id),false);
});
test('live data excludes legacy simulated rows and their linked scores',()=>{
 const data={institutions:[{id:'i',name:'Colegio [SIMULADO]'}],leads:[{id:'l',title:'Lead [SIMULADO]',institution_id:'i'}],scores:[{id:'s',lead_id:'l'}],users:[{id:'real',full_name:'Real'}]};
 const clean=realOnly(data);
 assert.equal(clean.leads.length,0);assert.equal(clean.scores.length,0);
 assert.equal(clean.users.length,1);assert.equal(data.leads.length,1);
});
test('executive drilldowns return exactly the records represented by their indicators',()=>{
 const d=createDemoData('org',now),m=executiveMetrics(d,now);
 assert.equal(filterExecutiveRows(d.opportunities,'opportunities','won','',now).reduce((sum,row)=>sum+row.value,0),m.revenue);
 assert.equal(filterExecutiveRows(d.opportunities,'opportunities','risk','',now).length,m.atRisk.length);
 assert.equal(filterExecutiveRows(d.opportunities,'opportunities','pipeline','',now).length,m.openCount);
 const output=renderExecutive(d,{now,demo:true});
 const attention=output.split('director-attention-table')[1].split('</table>')[0];
 assert.equal(m.decisions.length,5);
 assert.deepEqual([...attention.matchAll(/data-edit="([^"]+)" data-table="([^"]+)"/g)].map(([,id,table])=>({id,table})),m.decisions.map(({id,table})=>({id,table})));
 assert.deepEqual([...output.matchAll(/data-ceo-seller="([^"]+)"/g)].map(([,id])=>id),m.team.map(row=>row.user.id));
 assert.match(output,/ESCENARIO SIMULADO/);
});

