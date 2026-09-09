import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRecords,metrics,priorities,csv,parseCsv,escapeHTML} from '../domain.mjs';

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
test('agenda excludes completed work and invalid dates and sorts overdue first',()=>{
 const data={tasks:[{title:'Late',due_at:'2026-01-01T12:00:00Z',status:'PENDING'},{due_at:'2020-01-01',status:'COMPLETED'},{due_at:'bad',status:'PENDING'}],leads:[{title:'Next',next_action_date:'2026-02-01T12:00:00Z',status:'QUALIFIED'}]};
 assert.deepEqual(priorities(data).map(x=>x.title),['Late','Next']);
 assert.equal(metrics(data,Date.parse('2026-01-02')).overdue,1);
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
