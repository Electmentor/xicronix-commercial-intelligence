import assert from 'node:assert/strict';
import {validateDevConfig} from '../prospect-intelligence-supabase.mjs';

assert.deepEqual(validateDevConfig({}),{enabled:false,reason:'DEV_CONFIG_MISSING'});
assert.equal(validateDevConfig({url:'https://abcdev.supabase.co',publishableKey:'sb_publishable_dev'}).enabled,true);
assert.throws(()=>validateDevConfig({url:'https://qzfprdhmcaucqcdqgqiz.supabase.co',publishableKey:'sb_publishable_x'}),/refuses the production Supabase project/);
console.log('Prospect Intelligence Supabase adapter tests: OK');
