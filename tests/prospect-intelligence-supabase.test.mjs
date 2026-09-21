import assert from 'node:assert/strict';
import {validateDevConfig} from '../prospect-intelligence-supabase.mjs';

assert.deepEqual(validateDevConfig({}),{enabled:false,reason:'DEV_CONFIG_MISSING'});
assert.equal(validateDevConfig({url:'https://rmximatxuaczhpqbcuho.supabase.co',publishableKey:'sb_publishable_dev'}).enabled,true);
assert.throws(()=>validateDevConfig({url:'https://qzfprdhmcaucqcdqgqiz.supabase.co',publishableKey:'sb_publishable_x'}),/PRODUCCIÓN/);
console.log('Prospect Intelligence Supabase adapter tests: OK');
assert.throws(()=>validateDevConfig({url:'https://unapproved.supabase.co',publishableKey:'public'}),/solo admite CRM DEV/);
