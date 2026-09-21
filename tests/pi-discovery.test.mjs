import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCases,sourceLink,safeUrl,dateLabel} from '../pi-discovery-view.mjs';
import {validateDevConfig} from '../prospect-intelligence-supabase.mjs';
test('publication dates retain their calendar day',()=>{
 process.env.TZ='America/Lima';
 assert.match(dateLabel('2026-09-21'),/^21 /);
 assert.equal(dateLabel('invalid'),'Fecha pendiente');
});
test('separates research from simulation and filters signals',()=>{
 const rows=[{organization_name:'Universidad Real',state:'RESEARCHING',signals:[{label:'Laboratorio IA'}]},{organization_name:'[SIMULADO] Colegio',state:'PRIORITIZED',signals:[]}];
 assert.equal(filterCases(rows).length,1);
 assert.equal(filterCases(rows,'IA','RESEARCHING')[0].organization_name,'Universidad Real');
 assert.equal(filterCases(rows,'','ALL','synthetic')[0].organization_name,'[SIMULADO] Colegio');
 assert.equal(filterCases(rows,'ausente').length,0);
});
test('evidence links cannot execute markup or scripts',()=>{
 assert.equal(safeUrl('javascript:alert(1)'),'');
 assert.doesNotMatch(sourceLink('https://example.org','<img src=x onerror=alert(1)>'),/<img/);
 assert.match(sourceLink('https://example.org'),/noopener noreferrer/);
});
test('adapter permits only the exact approved DEV project',()=>{
 assert.equal(validateDevConfig({url:'https://rmximatxuaczhpqbcuho.supabase.co',publishableKey:'public'}).enabled,true);
 assert.throws(()=>validateDevConfig({url:'https://qzfprdhmcaucqcdqgqiz.supabase.co',publishableKey:'public'}));
 assert.throws(()=>validateDevConfig({url:'https://rmximatxuaczhpqbcuho.attacker.example',publishableKey:'public'}));
});
