import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../database/prospect-intelligence-backend-v1.sql',import.meta.url),'utf8');
for(const token of [
  'create table if not exists public.pi_cases',
  'create table if not exists public.pi_signals',
  'create table if not exists public.pi_evidence',
  'create table if not exists public.pi_transfers',
  'public.pi_readiness',
  'public.pi_prepare_transfer',
  'public.pi_execute_transfer',
  'REUSE_ORG_CREATE_LEAD',
  'ENRICH_EXISTING_LEAD',
  'ENRICH_EXISTING_OPPORTUNITY',
  'MANUAL_IDENTITY_REVIEW',
  "values(c.organization_id,inst_id,left(coalesce(c.hypothesis,c.organization_name),250),'OTHER','NEW',0,0"
]) assert.ok(sql.includes(token),token);

assert.ok(!sql.includes("source,'PROSPECT_INTELLIGENCE'"),'Do not invent a CRM lead source enum value.');
console.log('Prospect Intelligence backend contract tests: OK');
