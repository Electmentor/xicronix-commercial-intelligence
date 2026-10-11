import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('preview build never spends model credits merely because a key is configured',()=>{
 const output=execFileSync(process.execPath,['scripts/verify-assistant-provider.mjs'],{encoding:'utf8',env:{...process.env,VERCEL_ENV:'preview',GROQ_API_KEY:'synthetic-do-not-use',VALIDATE_LIVE_PROVIDER:''}});
 assert.match(output,/LIVE_DEV_VALIDATION_NOT_EXPLICITLY_ENABLED/);
});
test('explicit live preview check still fails closed without configured provider',()=>{
 const output=execFileSync(process.execPath,['scripts/verify-assistant-provider.mjs'],{encoding:'utf8',env:{...process.env,VERCEL_ENV:'preview',GROQ_API_KEY:'',VALIDATE_LIVE_PROVIDER:'true'}});
 assert.match(output,/GROQ_API_KEY_NOT_CONFIGURED_OUTSIDE_PRODUCTION/);
});
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('production keeps its existing verification path regardless of DEV opt-in',()=>{
 const guard=readFileSync('scripts/verify-assistant-provider.mjs','utf8').split("import {generateResponse}")[0];
 for(const key of ['', 'synthetic-key'])for(const flag of ['', 'true']){
  let exited=false;
  runInNewContext(guard,{process:{env:{VERCEL_ENV:'production',GROQ_API_KEY:key,VALIDATE_LIVE_PROVIDER:flag},exit(){exited=true;}},console:{log(){}}});
  assert.equal(exited,false,'production must reach the unchanged provider verification code');
 }
});
