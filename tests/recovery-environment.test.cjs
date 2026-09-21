const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../recuperar.js'), 'utf8');
function setup(hostname) {
 const nodes = new Map([['recoveryLink',{value:'',hidden:false}]]);
 const calls = [];
 const context = {
  URL, URLSearchParams,
  location:{hostname,hash:'',pathname:'/recuperar.html',search:''},
  history:{replaceState(){}},
  document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false});return nodes.get(id);}},
  window:{supabase:{createClient(url,key,options){
   calls.push({url,key,options});
   return {auth:{verifyOtp:async args=>{calls.push(args);return {error:new Error('expired')};}}};
  }}}
 };
 vm.runInNewContext(code,context);
 return {nodes,calls};
}
test('DEV recovery uses only DEV Auth and an in-memory session',()=>{
 const {calls}=setup('xicronix-commercial-intelligence-git-dev-xicronix.vercel.app');
 assert.equal(calls[0].url,'https://rmximatxuaczhpqbcuho.supabase.co');
 assert.equal(calls[0].options.auth.persistSession,false);
 assert.equal(calls[0].options.auth.detectSessionInUrl,false);
});
test('unknown preview cannot initialize a production client',()=>{
 const {calls,nodes}=setup('unrecognized-preview.vercel.app');
 assert.equal(calls.length,0);assert.equal(nodes.get('continue').disabled,true);
});
test('production mapping is retained in source without contacting it',()=>{
 assert.equal(setup('xicronix-commercial-intelligence.vercel.app').calls[0].url,'https://qzfprdhmcaucqcdqgqiz.supabase.co');
});
test('DEV rejects a production recovery link before transmitting its token',async()=>{
 const {calls,nodes}=setup('xicronix-commercial-intelligence-git-dev-xicronix.vercel.app');
 nodes.get('recoveryLink').value='https://qzfprdhmcaucqcdqgqiz.supabase.co/auth/v1/verify?type=recovery&token='+ 'a'.repeat(64);
 await nodes.get('continue').onclick();assert.equal(calls.length,1);
 assert.match(nodes.get('status').textContent,/No se pudo verificar/);
});
test('DEV submits the one-time token only after confirmation and handles rejection',async()=>{
 const {calls,nodes}=setup('xicronix-commercial-intelligence-git-dev-xicronix.vercel.app');
 nodes.get('recoveryLink').value='https://rmximatxuaczhpqbcuho.supabase.co/auth/v1/verify?type=recovery&token='+ 'a'.repeat(64);
 assert.equal(calls.length,1);await nodes.get('continue').onclick();
 assert.equal(calls.length,2);assert.equal(calls[1].type,'recovery');
 assert.equal(nodes.get('recoveryLink').value,'');assert.equal(nodes.get('paste').hidden,false);
});

