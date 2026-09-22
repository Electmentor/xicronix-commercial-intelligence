import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const helpers = readFileSync(new URL('../app.js',import.meta.url),'utf8').split('import {escapeHTML')[0];
const {movementActionRequired,validateMovementAction} = vm.runInNewContext(helpers+';({movementActionRequired,validateMovementAction})');

test('new movement requires an explicit action; historical records stay editable',()=>{
 assert.equal(movementActionRequired('activities',null),true);
 assert.equal(movementActionRequired('activities','web-activity'),false);
 assert.equal(movementActionRequired('tasks',null),false);
});
test('missing action focuses and reveals the field without clearing entered values',()=>{
 const calls=[];
 const field={value:'',scrollIntoView:()=>calls.push('scroll'),focus:()=>calls.push('focus'),reportValidity:()=>calls.push('validity')};
 const message={};
 const draft={notes:'4',next_action:'Tal vez otra prueba'};
 assert.equal(validateMovementAction('activities',null,field,message),false);
 assert.equal(field.required,true);
 assert.deepEqual(calls,['scroll','focus','validity']);
 assert.match(message.textContent,/Selecciona la acción/);
 assert.deepEqual(draft,{notes:'4',next_action:'Tal vez otra prueba'});
});
test('selected action passes validation without changing the selection',()=>{
 const field={value:'FOLLOW_UP'};
 assert.equal(validateMovementAction('activities',null,field,{}),true);
 assert.equal(field.value,'FOLLOW_UP');
});
test('existing web movements and unrelated forms do not require an invented action',()=>{
 assert.equal(validateMovementAction('activities','existing',{value:''},{}),true);
 assert.equal(validateMovementAction('tasks',null,null,{}),true);
});

