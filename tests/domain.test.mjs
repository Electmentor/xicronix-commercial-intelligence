import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRecords,metrics,priorities,taskUrgency,sortTasksByUrgency,csv,parseCsv,escapeHTML} from '../domain.mjs';

test('institutions remain visible without a search; accents and type can be combined',()=>{
 const rows=[{name:'Colegio San Martín',type:'SCHOOL'},{name:'Universidad del Sur',type:'UNIVERSITY'}];
 assert.equal(filterRecords(rows,'','type','').length,2);
 assert.equal(filterRecords(rows,'martin','type','SCHOOL').length,1);
 assert.equal(filterRecords(rows,'martin','type','UNIVERSITY').length,0);
});
test('contacts can be found through institution names',()=>{
 assert.equal(filterRecords([{first_name:'Ana'}],'universidad','','',()=> 'Universidad del Sur').length,1);
});
test('pipeline excludes closed deals and weights each open amount by probability',()=>{
 const data={institutions:[{}],leads:[{status:'NEW'},{status:'CONVERTED'}],opportunities:[{value:'200000',probability:25,stage:'PROPOSAL'},{value:'10000',probability:50,stage:'NEGOTIATION'},{value:'900000',probability:100,stage:'WON'},{value:'900000',stage:'LOST'}]};
 assert.deepEqual(metrics(data),{institutions:1,leads:1,pipeline:210000,weighted:55000,overdue:0});
});
test('agenda keeps undated work visible after dated urgent items',()=>{
 const now=Date.parse('2026-01-02T12:00:00Z');
 const data={tasks:[{title:'Late',due_at:'2026-01-01T12:00:00Z',status:'PENDING',priority:'HIGH'},{title:'No date',due_at:null,status:'PENDING',priority:'MEDIUM'},{due_at:'2020-01-01',status:'COMPLETED'}],leads:[{title:'Next',next_action_date:'2026-02-01T12:00:00Z',status:'QUALIFIED'}]};
 assert.deepEqual(priorities(data,now).map(x=>x.title),['Late','No date','Next']);
 assert.equal(metrics(data,now).overdue,1);
});
test('exports quote multiline text and prevent spreadsheet formula execution',()=>{
 const out=csv([{name:'=HYPERLINK("https://example.com")',notes:'a\nb'}],[{key:'name',label:'Nombre'},{key:'notes',label:'Notas'}]);
 assert.ok(out.includes('"\'=HYPERLINK(""https://example.com"")"'));assert.ok(out.includes('"a\nb"'));
});
test('untrusted content is escaped in text and attribute contexts',()=>{
 assert.equal(escapeHTML('<img src="x" onerror=\'alert(1)\'>'),'&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;');
});
test('parses quoted CSV headers, commas, multiline cells and BOM',()=>{
 const rows=parseCsv('\uFEFFNombre,Notas\n"Institución, Sur","Línea 1\nLínea 2"');
 assert.deepEqual(rows,[{nombre:'Institución, Sur',notas:'Línea 1\nLínea 2'}]);
});

test('prioritizes overdue and calculated lead potential before lower-potential follow-ups',()=>{
 const data={
  leads:[
   {id:'lead-low',title:'Bajo',status:'CONTACTED',next_action_date:'2026-01-01T12:00:00Z',score:90},
   {id:'lead-high',title:'Alto',status:'QUALIFIED',next_action_date:'2026-02-01T12:00:00Z',score:10}
  ],
  scores:[{lead_id:'lead-low',total_score:20,recommendation:'Completar datos'},{lead_id:'lead-high',total_score:90,recommendation:'Contactar hoy'}]
 };
 assert.deepEqual(priorities(data,Date.parse('2026-01-02')).map(row=>row.id),['lead-low','lead-high']);
 assert.equal(priorities(data,Date.parse('2025-12-01'))[0].derived_score,90);
});


test('dynamic task urgency changes with time and never hides tasks without date',()=>{
 const now=Date.parse('2026-09-18T20:00:00Z');
 const tasks=[
  {title:'No date',status:'PENDING',priority:'CRITICAL'},
  {title:'Tomorrow',status:'PENDING',priority:'LOW',due_at:'2026-09-19T10:00:00Z'},
  {title:'Overdue',status:'PENDING',priority:'MEDIUM',due_at:'2026-09-18T10:00:00Z'}
 ];
 assert.equal(taskUrgency(tasks[2],now).band,'OVERDUE');
 assert.equal(taskUrgency(tasks[1],now).band,'TODAY');
 assert.equal(taskUrgency(tasks[0],now).band,'UNSCHEDULED');
 assert.deepEqual(sortTasksByUrgency(tasks,now).map(x=>x.title),['Overdue','Tomorrow','No date']);
});
