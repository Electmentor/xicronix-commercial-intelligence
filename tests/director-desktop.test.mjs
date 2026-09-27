import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderExecutive} from '../executive.mjs';
const now=new Date('2026-09-27T17:00:00Z');
const data={
 institutions:[{id:'school',name:'Colegio <Centro>'}],
 users:[{id:'seller',role:'SALES',full_name:'Ejecutiva'}],
 leads:[{id:'linked',status:'NEW',institution_id:'school'},{id:'new',status:'NEW'},{id:'contact',status:'CONTACTED'}],
 opportunities:[
  {id:'won',stage:'WON',value:10000,expected_close_date:'2026-09-20',owner_user_id:'seller'},
  {id:'future',stage:'WON',value:99999,expected_close_date:'2026-09-30'},
  {id:'risk',stage:'PROPOSAL',value:20000,estimated_cost:19500,probability:50,expected_close_date:'2026-09-28',next_action_date:'2026-09-27',lead_id:'linked',owner_user_id:'seller',name:'Proyecto <A>'},
  {id:'open',stage:'NEGOTIATION',value:30000,estimated_cost:15000,probability:80,expected_close_date:'2026-10-05',next_action_date:'2026-10-01'},
  {id:'lost',stage:'LOST',value:50000,expected_close_date:'2026-09-10'}
 ],
 goals:[{period_start:'2026-09-01',period_end:'2026-09-30',target_won_value:40000}],
 tasks:[{assigned_to:'seller',status:'PENDING',due_at:'2026-09-20'},{assigned_to:'seller',status:'COMPLETED',due_at:'2026-09-20'}]
};
const desktop=(d=data,options={})=>renderExecutive(d,{now,...options}).split('<section class="director-hero director-desktop-hero">')[1];
test('desktop KPI values reconcile with records and preserve the approved order',()=>{
 const html=desktop(),kpis=html.split('aria-label="Indicadores comerciales">')[1].split('</section>')[0];
 assert.deepEqual([...kpis.matchAll(/<small>(.*?)<\/small>/g)].map(m=>m[1]),['Ventas mes','Pipeline','En riesgo','Forecast']);
 assert.deepEqual([...kpis.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]),['S/ 10 mil','S/ 50 mil','1','S/ 20 mil']);
 assert.ok(html.indexOf('Pipeline comercial')<html.indexOf('Requiere tu atención'));
 assert.ok(html.indexOf('Requiere tu atención')<html.indexOf('Equipo comercial'));
 assert.ok(html.indexOf('Equipo comercial')<html.indexOf('PROSPECT INTELLIGENCE'));
});
test('desktop pipeline does not double count linked leads, closed losses or future wins',()=>{
 const pipeline=desktop().split('<div class="director-pipeline">')[1].split('</section>')[0];
 assert.deepEqual([...pipeline.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>Number(m[1])),[1,1,0,1,1,1]);
});
test('attention resolves institution, escapes data and links to the existing record action',()=>{
 const attention=desktop().split('director-attention-table')[1].split('</table>')[0];
 assert.match(attention,/Colegio &lt;Centro&gt;/);
 assert.match(attention,/Proyecto &lt;A&gt;/);
 assert.match(attention,/data-edit="risk" data-table="opportunities"/);
 assert.match(attention,/>Hoy<\/time>/);
 assert.doesNotMatch(attention,/<Centro>|<A>/);
 const team=desktop().split('director-team-summary')[1].split('</details>')[0];
 assert.match(team,/<strong>1<\/strong><small>Comerciales registrados/);
 assert.match(team,/<strong>1<\/strong><small>Tareas vencidas del equipo/);
 assert.match(team,/<strong>25%<\/strong>/);
});
test('partial loads hide desktop numbers and no target stays unknown rather than zero percent',()=>{
 const html=desktop(data,{failures:{opportunities:true}}).split('<section class="director-desktop-insights"')[0];
 assert.equal((html.match(/ disabled/g)||[]).length,4);
 assert.doesNotMatch(html,/<strong>\d/);
 assert.doesNotMatch(html,/data-edit=/);
 assert.match(desktop({...data,goals:[]}),/<strong>—<\/strong><small>Sin meta mensual/);
 assert.match(desktop({}),/No hay excepciones según las reglas actuales/);
});
test('desktop presence follows the existing connection state without changing mobile status',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const fn=source.match(/function renderConnectionState\(\)\{[\s\S]*?\r?\n\}/)[0];
 const nodes=Object.fromEntries(['userPresence','connectionLabel','mobileConnectionPresence','mobileConnectionLabel','headerAccountRole'].map(id=>[id,{dataset:{}}]));
 let state='online';
 const context=vm.createContext({$:id=>nodes[id],connectionState:()=>({state,label:state==='online'?'Conectado':'Desconectado'}),liveIntelligenceLastSync:null,intelligenceFreshness:()=>({}),enums:{role:{}},profile:{role:'ADMIN'}});
 vm.runInContext(fn,context);
 for(state of ['online','offline']){
  vm.runInContext('renderConnectionState()',context);
  assert.equal(nodes.userPresence.dataset.state,state);
  assert.equal(nodes.connectionLabel.textContent,nodes.mobileConnectionLabel.textContent);
 }
});
test('release stamps and changed module URL agree while network-first caching remains enabled',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const version=app.match(/const CLIENT_BUILD='v([^']+)'/)[1];
 assert.ok(app.includes('executive.mjs?v=20260927-v'+version));
 assert.ok(html.includes('app.js?v='+version));
 assert.ok(html.includes('executive.css?v='+version));
 assert.ok(sw.includes('xicronix-v'+version.replaceAll('.','-')));
 assert.match(sw,/fetch\(event.request,\{cache:'no-store'\}\)/);
 assert.doesNotMatch(app,/if\(admin&&window.matchMedia[^\n]+renderDirectorResponsibilityCenter/);
});
