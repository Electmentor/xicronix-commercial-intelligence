// Isolated, disk-backed PostgreSQL WASM verification. Never connects to Supabase.
// Install @electric-sql/pglite@0.3.14 outside this repo and set WA_PGLITE_MODULE
// to its absolute dist/index.js path. Fixture CRM tables contain synthetic data only.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { createVerifiedStore } from '../whatsapp-store.mjs';
import { normalizeWebhook } from '../whatsapp-intake.mjs';
import { createHandler } from '../api/whatsapp-webhook.mjs';

if (!process.env.WA_PGLITE_MODULE) throw new Error('Set WA_PGLITE_MODULE to isolated pglite@0.3.14 dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(process.env.WA_PGLITE_MODULE)).href);
const directory = await mkdtemp(join(tmpdir(), 'a009-wa-dev-'));
let db = new PGlite(directory);
const ORG = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002';
const CONTACT = '00000000-0000-4000-8000-000000000003', OWNER = '00000000-0000-4000-8000-000000000004';
const OTHER_CONTACT = '00000000-0000-4000-8000-000000000005', OTHER_OWNER = '00000000-0000-4000-8000-000000000006';
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
// Contract fixture from inspected metadata, not a copy of production data/schema.
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table organizations(id uuid primary key);
create table profiles(id uuid primary key,organization_id uuid references organizations,role text);
create table contacts(id uuid primary key,organization_id uuid references organizations,first_name text not null);
create table tasks(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations,contact_id uuid references contacts,title text not null,status text not null,priority text not null,assigned_to uuid references profiles,automation_key text,notes text);
create table activities(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations,contact_id uuid references contacts,type text check(type='WHATSAPP'),subject text,notes text,occurred_at timestamptz,created_by uuid references profiles);
grant select on profiles to authenticated;
grant select,insert,update on organizations,profiles,contacts,tasks,activities to service_role;
insert into organizations values('${ORG}'),('${OTHER}');
insert into contacts values('${CONTACT}','${ORG}','Cliente sintético'),('${OTHER_CONTACT}','${OTHER}','Otro cliente sintético');
insert into profiles values('${OWNER}','${ORG}','ADMIN'),('${OTHER_OWNER}','${OTHER}','ADMIN');
`);
const migration = await readFile(new URL('../supabase/migrations/20261007031304_whatsapp_intake_dev.sql', import.meta.url), 'utf8');
await check('migration refuses unmarked environment', async () => {
  await assert.rejects(db.exec(migration), /isolated DEV/);
});
await db.exec("set app.whatsapp_environment='dev'");
await db.exec(migration);
await db.exec('set role service_role');
const functions = {
  whatsapp_receive_batch: ['p_org','p_waba','p_phone','p_events'],
  whatsapp_read_receipts: ['p_org','p_keys'],
  whatsapp_bind_contact: ['p_org','p_waba','p_phone','p_sender','p_contact'],
  whatsapp_process_receipt: ['p_org','p_key','p_owner']
};
async function rpc(name, args) {
  const parameters = functions[name]; if (!parameters) throw new Error('unexpected_rpc');
  const values = parameters.map(p => typeof args[p] === 'object' && args[p] !== null ? JSON.stringify(args[p]) : args[p]);
  const result = await db.query(`select public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) as result`, values);
  return result.rows[0].result;
}
const store = createVerifiedStore({ rpc, organizationId: ORG, wabaId: 'synthetic-waba', phoneNumberId: 'synthetic-phone' });
function envelope(id = 'wamid.synthetic-1', sender = 'synthetic-contact-1') {
  return { object: 'whatsapp_business_account', entry: [{ id: 'synthetic-waba', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: 'synthetic-phone' }, messages: [{ id, from: sender, timestamp: '1791331200', type: 'text', text: { body: 'Consulta sintética, sin cliente real' } }]
  } }] }] };
}
const events = normalizeWebhook(envelope(), { wabaId: 'synthetic-waba', phoneNumberId: 'synthetic-phone' });
await check('real SQL commit and separate readback', async () => {
  assert.equal((await store.commitBatch(events)).durable, true);
});
await check('durability after closing and reopening disk database', async () => {
  await db.close(); db = new PGlite(directory); await db.exec('set role service_role');
  const rows = await rpc('whatsapp_read_receipts', { p_org: ORG, p_keys: [events[0].eventKey] });
  assert.equal(rows.length, 1); assert.equal(rows[0].contentHash, events[0].contentHash);
});
await check('retries and queued competing deliveries create one receipt', async () => {
  await Promise.all(Array.from({ length: 8 }, () => store.commitBatch(events)));
  assert.equal((await db.query('select count(*)::int as n from whatsapp_receipts')).rows[0].n, 1);
});
await check('conflicting duplicate rolls back entire batch', async () => {
  const more = normalizeWebhook(envelope('new-rolled-back'), { wabaId: 'synthetic-waba', phoneNumberId: 'synthetic-phone' });
  await assert.rejects(store.commitBatch([...more, { ...events[0], text: 'conflict' }]), /event_conflict/);
  assert.equal((await db.query('select count(*)::int as n from whatsapp_receipts')).rows[0].n, 1);
});
await check('unmatched sender gets review task without duplicate contacts', async () => {
  assert.equal((await store.processReceipt(events[0].eventKey, OWNER)).processing, 'review');
  await store.processReceipt(events[0].eventKey, OWNER);
  assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from contacts')).rows[0].n, 2);
});
await check('cross-organization contact and owner are rejected', async () => {
  await assert.rejects(store.bindContact('synthetic-contact-1', OTHER_CONTACT), /scope_mismatch/);
  await assert.rejects(store.processReceipt(events[0].eventKey, OTHER_OWNER), /scope_mismatch/);
});
await check('confirmed existing contact creates one activity and reuses task', async () => {
  await store.bindContact('synthetic-contact-1', CONTACT);
  const result = await store.processReceipt(events[0].eventKey, OWNER);
  assert.equal(result.processing, 'processed'); assert.equal(result.contactId, CONTACT);
  await store.processReceipt(events[0].eventKey, OWNER);
  assert.equal((await db.query('select count(*)::int as n from activities')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n, 1);
});
await check('identity cannot silently move to a different existing contact', async () => {
  await db.exec('reset role');
  await db.query('insert into contacts values($1,$2,$3)', ['00000000-0000-4000-8000-000000000007',ORG,'Otro contacto de prueba']);
  await db.exec('set role service_role');
  await assert.rejects(store.bindContact('synthetic-contact-1','00000000-0000-4000-8000-000000000007'),/identity_conflict/);
});
await check('status before message remains separate and creates no activity or task', async () => {
  const body=envelope(); const value=body.entry[0].changes[0].value;
  delete value.messages; value.statuses=[{id:'synthetic-outbound-unknown',status:'read',timestamp:'1791331200'}];
  const statuses=normalizeWebhook(body,{wabaId:'synthetic-waba',phoneNumberId:'synthetic-phone'});
  await store.commitBatch(statuses); await store.processReceipt(statuses[0].eventKey,null);
  assert.equal((await db.query('select count(*)::int as n from activities')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1);
});
await check('failed processing rolls back activity and task; receipt remains retryable', async () => {
  const bad = normalizeWebhook(envelope('bad-time'), { wabaId: 'synthetic-waba', phoneNumberId: 'synthetic-phone' });
  bad[0].occurredAt = 'invalid';
  await store.commitBatch(bad);
  await assert.rejects(store.processReceipt(bad[0].eventKey, OWNER));
  assert.equal((await rpc('whatsapp_read_receipts', { p_org: ORG, p_keys: [bad[0].eventKey] }))[0].processing, 'received');
  assert.equal((await db.query('select count(*)::int as n from activities')).rows[0].n, 1);
});
await check('signed request crosses handler and real SQL store', async () => {
  const env = { WHATSAPP_INTAKE_ENABLED:'true',WHATSAPP_APP_SECRET:'synthetic-secret',WHATSAPP_VERIFY_TOKEN:'synthetic-token',WHATSAPP_WABA_ID:'synthetic-waba',WHATSAPP_PHONE_NUMBER_ID:'synthetic-phone' };
  const raw = JSON.stringify(envelope('signed-through-handler'));
  const request = new Request('https://local.test/', { method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(raw).digest('hex')},body:raw });
  const response = await createHandler({ env, commitBatch:store.commitBatch })(request);
  assert.equal(response.status,200); assert.equal((await response.json()).processing,'unconfirmed');
});
await check('RLS isolates admins and forbids anonymous access and authenticated ingestion', async () => {
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${OTHER_OWNER}'`);
  assert.equal((await db.query('select count(*)::int as n from whatsapp_receipts')).rows[0].n,0);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'`);
  assert.ok((await db.query('select count(*)::int as n from whatsapp_receipts')).rows[0].n>0);
  await assert.rejects(rpc('whatsapp_receive_batch',{p_org:ORG,p_waba:'w',p_phone:'p',p_events:events}),/permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from whatsapp_receipts'),/permission denied/);
  await db.exec('reset role; set role service_role');
});
console.log(JSON.stringify({ engine:(await db.query('select version() as version')).rows[0].version, storage:'local PostgreSQL WASM on disk; no remote Supabase writes', checks, passed:checks.length, limitations:'PGlite serializes queries; multi-connection contention and live Supabase RLS/triggers remain unverified.' },null,2));
await db.close();
