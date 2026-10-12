import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler, MailError, LIMITS, STORAGE_BUCKET, readLimitedBytes } from '../supabase/functions/commercial-mail-send-v3/core.mjs';
import { classifyProviderResponse, createProvider, createRepository } from '../supabase/functions/commercial-mail-send-v3/adapters.mjs';

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORG = uid(1), USER = uid(2), LEAD = uid(3), DOC = uid(4), VERSION = uid(5), KEY = uid(6), OUT = uid(7);
const bytes = new TextEncoder().encode('%PDF-1.7\nSYNTHETIC FIXTURE ONLY');
const payload = () => ({ lead_id: LEAD, to: 'contact@example.test', subject: 'Ficha del caso', body: 'Material de prueba sin datos reales.', document_ids: [DOC], idempotency_key: KEY });
function fixture() {
  const state = { actor: { user: { id: USER }, profile: { id: USER, organization_id: ORG, role: 'SALES' } }, lead: { id: LEAD, organization_id: ORG, owner_user_id: USER, created_by: USER }, document: { id: DOC, organization_id: ORG, lead_id: LEAD, current_version: 1, status: 'CURRENT' }, version: { id: VERSION, document_id: DOC, organization_id: ORG, lead_id: LEAD, version_number: 1, is_current: true, status: 'CURRENT', storage_path: `${ORG}/${LEAD}/${DOC}/v1/1-fixture.pdf`, file_name: 'fixture.pdf', mime_type: 'application/pdf', size_bytes: bytes.length }, attempts: [], sends: [], downloads: [], activities: [], calls: [] };
  const repository = {
    authenticate: async () => state.actor,
    capabilities: async () => ({ contract_version: 3, attachments: true, idempotency: true, bucket_private: true }),
    getLead: async () => state.lead,
    getAttempt: async (org,key) => state.attempts.find(row => row.organization_id === org && row.idempotency_key === key),
    getUnresolved: async (org,hash) => state.attempts.find(row => row.organization_id === org && row.request_hash === hash && row.status === 'SENDING'),
    getDocuments: async () => [{ document: state.document, version: state.version }],
    downloadPrivate: async (bucket,path) => { state.downloads.push({ bucket, path }); return { bytes, mime_type: 'application/pdf' }; },
    getInbound: async () => ({ id: uid(20), source_payload: { message_id: '<synthetic@example.test>' } }),
    claim: async record => {
      state.calls.push('claim');
      const existing = state.attempts.find(row => row.organization_id === record.organization_id && row.idempotency_key === record.idempotency_key);
      if (existing) return { claimed: false, existing };
      if (state.attempts.some(row => row.organization_id === record.organization_id && row.request_hash === record.request_hash && row.status === 'SENDING')) return { claimed: false };
      const row = { ...record, id: OUT }; state.attempts.push(row); return { claimed: true, row };
    },
    recordFailure: async (id,org,status,error_text) => { state.calls.push('failure'); Object.assign(state.attempts.find(row => row.id === id && row.organization_id === org), { status, error_text }); },
    finalize: async (id,org,provider_message_id) => { state.calls.push('finalize'); const row = state.attempts.find(row => row.id === id && row.organization_id === org); Object.assign(row, { status: 'SENT', provider_message_id }); state.activities.push(id); return { status: row.status, provider_message_id }; },
  };
  const provider = { send: async (mail,key) => { state.calls.push('provider'); state.sends.push({ mail,key }); return { accepted: true, id: 'provider-fixture-1' }; } };
  const handler = createHandler({ repository, provider, now: () => '2026-10-11T00:00:00.000Z' });
  const run = async (body = payload(), options = {}) => {
    const response = await handler(new Request('https://crm.example.test/functions/v1/commercial-mail-send', { method: 'POST', headers: { authorization: 'Bearer synthetic-user', ...options.headers }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json(), response };
  };
  return { state, repository, provider, handler, run };
}
const assertNoMail = f => { assert.equal(f.state.sends.length, 0); assert.equal(f.state.attempts.length, 0); assert.equal(f.state.activities.length, 0); };

test('capabilities authenticates without document reads, reservations or provider calls', async () => {
  const f = fixture(); f.repository.getLead = async () => { throw Error('not expected'); };
  const result = await f.run({ action: 'capabilities' });
  assert.equal(result.status,200); assert.deepEqual({ ...result.body, limits: undefined }, { ok:true,contract_version:3,attachments:true,idempotency:true,limits:undefined }); assertNoMail(f);
});
test('missing DB preparation and public bucket both fail closed', async () => {
  for (const caps of [{ contract_version:2,attachments:true,idempotency:true,bucket_private:true }, { contract_version:3,attachments:true,idempotency:true,bucket_private:false }]) {
    const f=fixture(); f.repository.capabilities=async()=>caps; const r=await f.run(); assert.equal(r.status,503); assert.equal(r.body.error,'mail_backend_not_ready'); assert.equal(r.body.send_attempted,false); assertNoMail(f);
  }
});
test('success includes private bytes and manifest, requires provider ID and never claims delivered', async () => {
  const f=fixture(), r=await f.run(); assert.equal(r.status,200); assert.equal(r.body.status,'SENT'); assert.equal(r.body.delivery_status,'UNCONFIRMED'); assert.equal(r.body.provider_message_id,'provider-fixture-1'); assert.equal(r.body.replayed,false);
  assert.equal(f.state.sends[0].mail.attachments[0].content,Buffer.from(bytes).toString('base64')); assert.equal(f.state.sends[0].mail.attachments[0].filename,'fixture.pdf'); assert.equal(f.state.sends[0].mail.attachments[0].content_type,'application/pdf'); assert.equal('path' in f.state.sends[0].mail.attachments[0],false);
  assert.deepEqual(f.state.downloads,[{bucket:STORAGE_BUCKET,path:f.state.version.storage_path}]); assert.equal(f.state.attempts[0].attachment_manifest[0].sha256.length,64); assert.equal(f.state.attempts[0].attachment_manifest[0].version_id,VERSION);
  assert.deepEqual(f.state.calls,['claim','provider','finalize']); assert.equal(f.state.sends[0].key,`crm-v3/${ORG}/${KEY}`); assert.equal(f.state.sends[0].mail.headers['In-Reply-To'],'<synthetic@example.test>');
});
test('send without attachments is explicit and performs no storage reads',async()=>{
  const f=fixture(); const r=await f.run({...payload(),document_ids:[]}); assert.equal(r.body.ok,true); assert.equal(f.state.downloads.length,0); assert.equal('attachments' in f.state.sends[0].mail,false);
});
test('same key replays receipt with no second send or activity even after version changes',async()=>{
  const f=fixture(); await f.run(); f.state.version.is_current=false; const r=await f.run(); assert.equal(r.body.replayed,true); assert.equal(f.state.sends.length,1); assert.equal(f.state.activities.length,1); assert.equal(f.state.downloads.length,1);
});
test('same key with changed content conflicts without sending',async()=>{
  const f=fixture(); await f.run(); const r=await f.run({...payload(),subject:'Changed'}); assert.equal(r.status,409); assert.equal(r.body.error,'idempotency_conflict'); assert.equal(r.body.retry_allowed,false); assert.equal(f.state.sends.length,1);
});
test('provider SDK-like error payload and HTTP errors never become SENT',async()=>{
  for (const [status,result] of [[200,{error:{message:'rejected'}}],[400,{name:'validation_error',message:'rejected'}],[403,{message:'forbidden'}],[500,{message:'failure'}],[200,{}],[200,{id:null}],[200,{id:'provider-id',error:{message:'conflict'}}]]) {
    const f=fixture(); f.provider.send=async()=>{f.state.sends.push({}); return classifyProviderResponse(status,result);}; const r=await f.run(); assert.equal(r.body.ok,false); assert.notEqual(f.state.attempts[0].status,'SENT'); assert.equal(f.state.activities.length,0); assert.ok([202,502].includes(r.status));
  }
});
test('missing provider ID is uncertain even when adapter reports accepted',async()=>{
  const f=fixture(); f.provider.send=async()=>({accepted:true}); const r=await f.run(); assert.equal(r.body.status,'UNKNOWN'); assert.equal(r.body.requires_review,true); assert.equal(f.state.attempts[0].status,'SENDING'); assert.equal(f.state.activities.length,0);
});
test('provider throw/timeout holds same and new keys without another provider call',async()=>{
  const f=fixture(); f.provider.send=async()=>{f.state.sends.push({});throw Error('timeout');}; const first=await f.run(); assert.equal(first.body.status,'UNKNOWN'); assert.equal(first.body.retry_allowed,false);
  assert.equal((await f.run()).body.error,'attempt_requires_review'); assert.equal((await f.run({...payload(),idempotency_key:uid(90)})).body.error,'matching_attempt_requires_review'); assert.equal(f.state.sends.length,1);
});
test('accepted send plus DB finalization failure cannot mark FAILED or resend',async()=>{
  const f=fixture(); f.repository.finalize=async()=>{throw Error('DB unavailable');}; const r=await f.run(); assert.equal(r.status,202); assert.equal(r.body.error,'accepted_record_pending'); assert.equal(r.body.provider_status,'ACCEPTED'); assert.equal(r.body.provider_message_id,'provider-fixture-1'); assert.equal(f.state.attempts[0].status,'SENDING'); assert.equal(f.state.calls.includes('failure'),false);
  await f.run(); await f.run({...payload(),idempotency_key:uid(91)}); assert.equal(f.state.sends.length,1); assert.equal(f.state.activities.length,0);
});
test('DB commits acceptance but loses response: replay returns SENT without duplicated activity',async()=>{
  const f=fixture(), original=f.repository.finalize; f.repository.finalize=async(...args)=>{await original(...args);throw Error('lost reply');}; assert.equal((await f.run()).body.error,'accepted_record_pending'); const r=await f.run(); assert.equal(r.body.status,'SENT'); assert.equal(r.body.replayed,true); assert.equal(f.state.sends.length,1); assert.equal(f.state.activities.length,1);
});
test('unconfirmed finalize return never claims persisted SENT',async()=>{
  const f=fixture(); f.repository.finalize=async()=>({status:'SENT',provider_message_id:null}); assert.equal((await f.run()).body.error,'accepted_record_pending'); assert.equal(f.state.activities.length,0);
});
test('definite provider rejection is FAILED and permits explicit new attempt',async()=>{
  const f=fixture(); f.provider.send=async()=>({accepted:false,uncertain:false}); const r=await f.run(); assert.equal(r.body.status,'FAILED'); assert.equal(r.body.retry_allowed,true); assert.equal(f.state.attempts[0].status,'FAILED'); assert.equal((await f.run()).body.error,'previous_attempt_failed');
});
test('failure-record DB error conservatively leaves SENDING and never repeats provider',async()=>{
  const f=fixture(); f.provider.send=async()=>{f.state.sends.push({});return {accepted:false,uncertain:false};}; f.repository.recordFailure=async()=>{throw Error('lost DB');}; await f.run(); await f.run(); assert.equal(f.state.sends.length,1); assert.equal(f.state.attempts[0].status,'SENDING');
});
test('ambiguous reservation DB write stays review-only before provider invocation',async()=>{
  const f=fixture(); f.repository.claim=async()=>{throw Error('write response lost');}; const r=await f.run(); assert.equal(r.body.status,'UNKNOWN'); assert.equal(r.body.retry_allowed,false); assert.equal(r.body.requires_review,true); assert.equal(f.state.sends.length,0);
});
test('concurrent same key and different key cannot send identical pending content twice',async()=>{
  for (const secondKey of [KEY,uid(88)]) {
    const f=fixture(); let entered, release; const started=new Promise(r=>entered=r), gate=new Promise(r=>release=r);
    f.provider.send=async()=>{f.state.sends.push({});entered();await gate;return {accepted:true,id:'provider-fixture-1'};};
    const first=f.run(); await started; const second=await f.run({...payload(),idempotency_key:secondKey}); assert.equal(second.body.requires_review,true); assert.equal(f.state.sends.length,1); release(); assert.equal((await first).body.ok,true);
  }
});
for (const role of ['VIEWER','UNKNOWN',null]) test(`role ${role} cannot send or request ready capabilities`,async()=>{
  const f=fixture(); f.state.actor.profile.role=role; assert.equal((await f.run()).status,403); assert.equal((await f.run({action:'capabilities'})).status,403); assertNoMail(f);
});
test('missing/mismatched actor, cross-org and unassigned leads are refused',async()=>{
  for (const mutate of [f=>f.state.actor.user=null,f=>f.state.actor.profile.id=uid(80),f=>f.state.lead.organization_id=uid(81),f=>f.state.lead.owner_user_id=uid(82)]) {const f=fixture();mutate(f); const r=await f.run(); assert.ok([401,404].includes(r.status)); assertNoMail(f);}
});
test('MANAGER follows assigned-lead scope, ADMIN may access another assignee in same org',async()=>{
  const f=fixture();f.state.actor.profile.role='MANAGER';f.state.lead.owner_user_id=uid(85);assert.equal((await f.run()).status,404);f.state.actor.profile.role='ADMIN';assert.equal((await f.run()).body.ok,true);
});
const badDocumentCases = [
  ['cross-org document',f=>f.state.document.organization_id=uid(9)], ['cross-case document',f=>f.state.document.lead_id=uid(9)],
  ['cross-org version',f=>f.state.version.organization_id=uid(9)], ['cross-case version',f=>f.state.version.lead_id=uid(9)],
  ['wrong document version',f=>f.state.version.document_id=uid(9)], ['stale version',f=>f.state.version.is_current=false],
  ['stale number',f=>f.state.document.current_version=2], ['draft document',f=>f.state.document.status='DRAFT'], ['replaced version',f=>f.state.version.status='REPLACED'],
  ['external URL',f=>f.state.version.storage_path='https://evil.example/file.pdf'], ['traversal',f=>f.state.version.storage_path=f.state.version.storage_path.replace('1-fixture.pdf','../file.pdf')],
  ['encoded traversal',f=>f.state.version.storage_path=f.state.version.storage_path.replace('1-fixture.pdf','%2e%2e%2ffile.pdf')], ['wrong org storage',f=>f.state.version.storage_path=f.state.version.storage_path.replace(ORG,uid(8))],
  ['wrong lead storage',f=>f.state.version.storage_path=f.state.version.storage_path.replace(LEAD,uid(8))], ['wrong doc storage',f=>f.state.version.storage_path=f.state.version.storage_path.replace(DOC,uid(8))],
  ['wrong version storage',f=>f.state.version.storage_path=f.state.version.storage_path.replace('/v1/','/v2/')], ['filename injection',f=>f.state.version.file_name='file.pdf\r\nBcc: hidden@example.test'],
  ['extension mismatch',f=>f.state.version.file_name='file.exe'], ['mime forbidden',f=>f.state.version.mime_type='text/html'], ['unknown size',f=>f.state.version.size_bytes=null], ['oversize',f=>f.state.version.size_bytes=LIMITS.fileBytes+1],
];
for (const [name,mutate] of badDocumentCases) test(`${name} is rejected before any download or send`,async()=>{const f=fixture();mutate(f);const r=await f.run();assert.equal(r.body.ok,false);assert.equal(r.body.send_attempted,false);assert.equal(r.body.retry_allowed,true);assert.equal(f.state.downloads.length,0);assertNoMail(f);});
test('missing and duplicate current versions do not silently omit requested attachments',async()=>{
  for (const records of [[],[{document:null,version:null}],'duplicate']) {const f=fixture();f.repository.getDocuments=async()=>records==='duplicate'?[{document:f.state.document,version:f.state.version},{document:f.state.document,version:f.state.version}]:records;assert.equal((await f.run()).body.ok,false);assertNoMail(f);}
});
test('sum size limit is enforced before downloads',async()=>{
  const f=fixture(); const doc2={...f.state.document,id:uid(41)},version2={...f.state.version,id:uid(42),document_id:uid(41),storage_path:f.state.version.storage_path.replace(DOC,uid(41)),size_bytes:12*1024*1024};f.state.version.size_bytes=12*1024*1024;f.repository.getDocuments=async()=>[{document:f.state.document,version:f.state.version},{document:doc2,version:version2}];const r=await f.run({...payload(),document_ids:[DOC,doc2.id]});assert.equal(r.body.error,'attachments_too_large');assert.equal(f.state.downloads.length,0);assertNoMail(f);
});
test('actual bytes length, response MIME and signature are checked',async()=>{
  for (const file of [{bytes:new Uint8Array(2),mime_type:'application/pdf'},{bytes,mime_type:'text/html'},{bytes:new Uint8Array(bytes.length),mime_type:'application/pdf'}]) {const f=fixture();f.repository.downloadPrivate=async()=>file;assert.equal((await f.run()).body.ok,false);assertNoMail(f);}
});
test('storage download failure blocks entire message',async()=>{
  const f=fixture();f.repository.downloadPrivate=async()=>{throw new MailError('attachment_download_failed',409);};const r=await f.run();assert.equal(r.body.error,'attachment_download_failed');assert.equal(r.body.send_attempted,false);assertNoMail(f);
});
test('invalid payload, arbitrary URLs, duplicate/too many IDs and header injection are rejected',async()=>{
  for (const input of [{...payload(),attachments:[{path:'https://evil.example'}]},{...payload(),document_ids:[DOC,DOC]},{...payload(),document_ids:Array.from({length:11},(_,i)=>uid(i+30))},{...payload(),to:'ok@example.test\r\nBcc: evil@example.test'},{...payload(),subject:'subject\nBcc'},{...payload(),idempotency_key:''},{...payload(),body:''},{...payload(),document_ids:['https://evil.example']},{...payload(),body:'x'.repeat(LIMITS.bodyChars+1)}]) {const f=fixture();assert.equal((await f.run(input)).body.ok,false);assertNoMail(f);}
});
test('unsafe inbound message ID never reaches provider headers',async()=>{
  const f=fixture();f.repository.getInbound=async()=>({source_payload:{message_id:'<a@b>\r\nBcc: hidden@example.test'}});await f.run();assert.deepEqual(f.state.sends[0].mail.headers,{});
});
test('unknown origin, methods and missing auth do not invoke mail work',async()=>{
  const f=fixture();assert.equal((await f.run(payload(),{headers:{origin:'https://evil.example'}})).status,403);assert.equal((await f.run(payload(),{headers:{authorization:''}})).status,401);
  assert.equal((await f.handler(new Request('https://example.test',{method:'GET'}))).status,405);assert.equal((await f.handler(new Request('https://example.test',{method:'OPTIONS',headers:{origin:'https://xicronix-commercial-intelligence.vercel.app'}}))).status,204);assertNoMail(f);
});
test('body stream limit rejects even without Content-Length',async()=>{
  const f=fixture();const r=await f.handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({body:'x'.repeat(LIMITS.requestBytes)})}));assert.equal(r.status,413);assertNoMail(f);
});
test('stream limiter verifies actual bytes rather than trusting declared size',async()=>{
  await assert.rejects(readLimitedBytes(new Response(new Uint8Array(10),{headers:{'content-length':'1'}}),5),error=>error.code==='payload_too_large');
});
test('provider uses fixed URL and idempotency header, and never retries',async()=>{
  const calls=[];const provider=createProvider({apiKey:'synthetic',fetcher:async(url,options)=>{calls.push({url,options});return Response.json({error:{message:'not sent'}},{status:400});}});const r=await provider.send({to:['synthetic@example.test']},'synthetic-key');assert.equal(r.accepted,false);assert.equal(r.uncertain,false);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].options.headers['Idempotency-Key'],'synthetic-key');assert.equal(calls[0].options.redirect,'error');
});
test('repository keeps user RLS on lead/doc/storage and service credentials only for ledger',async()=>{
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options}); if(url.includes('/auth/v1/user'))return Response.json({id:USER}); if(url.includes('/profiles?'))return Response.json([{id:USER,organization_id:ORG,role:'SALES'}]);if(url.includes('/documents?'))return Response.json([]);if(url.includes('/document_versions?'))return Response.json([]);if(url.includes('/object/authenticated/'))return new Response(bytes,{headers:{'content-type':'application/pdf'}});return Response.json([]);};
  const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'synthetic-public',serviceKey:'synthetic-service',fetcher});const actor=await repo.authenticate(new Request('https://example.test',{headers:{authorization:'Bearer synthetic-user'}}));await repo.getLead(LEAD,ORG,actor);await repo.getDocuments([DOC],LEAD,ORG,actor);await repo.downloadPrivate(STORAGE_BUCKET,`${ORG}/${LEAD}/${DOC}/v1/file.pdf`,actor,LIMITS.fileBytes);await repo.getAttempt(ORG,KEY);
  for(const call of calls.filter(c=>!c.url.includes('/commercial_mail_outbox?')))assert.equal(call.options.headers.authorization,'Bearer synthetic-user');assert.equal(calls.at(-1).options.headers.authorization,'Bearer synthetic-service');assert.ok(calls.find(c=>c.url.includes('/leads?')).url.includes(`organization_id=eq.${ORG}`));assert.ok(calls.find(c=>c.url.includes('/object/authenticated/')).url.startsWith('https://synthetic.supabase.co/storage/v1/object/authenticated/crm-documents/'));
  await assert.rejects(repo.downloadPrivate('other','file',actor,20),e=>e.code==='invalid_attachment_path');
});
test('prepared SQL retains ledger and makes finalization atomic and service-only',async()=>{
  const sql=await readFile(new URL('../database/PREPARE-commercial-mail-send-v3-NOT-APPLIED.sql',import.meta.url),'utf8');assert.match(sql,/NOT APPLIED/);assert.doesNotMatch(sql,/create table/i);assert.match(sql,/where request_hash is not null and status = 'SENDING'/);assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/security definer/i);assert.match(sql,/for update/);assert.match(sql,/insert into public.activities/);assert.match(sql,/from public, anon, authenticated/);assert.match(sql,/to service_role/);assert.match(sql,/Entrega al destinatario no confirmada/);
});
test('full HTTP adapter fixture: authenticated capabilities, private download, reservation, provider, atomic finalization and replay',async()=>{
  const f=fixture(), calls=[]; let saved=null;
  const fetcher=async(url,options)=>{
    const u=new URL(url);calls.push({url,options});
    if(u.hostname==='api.resend.com') {assert.equal(options.headers.authorization,'Bearer synthetic-provider');assert.equal(JSON.parse(options.body).attachments[0].content,Buffer.from(bytes).toString('base64'));return Response.json({id:'provider-http-fixture'});}
    assert.equal(u.origin,'https://synthetic.supabase.co');
    if(u.pathname==='/auth/v1/user')return Response.json({id:USER});
    if(u.pathname==='/rest/v1/profiles')return Response.json([f.state.actor.profile]);
    if(u.pathname==='/rest/v1/rpc/crm_mail_send_contract_v3')return Response.json({contract_version:3,attachments:true,idempotency:true});
    if(u.pathname==='/storage/v1/bucket/crm-documents')return Response.json({id:'crm-documents',public:false});
    if(u.pathname==='/rest/v1/leads')return Response.json([f.state.lead]);
    if(u.pathname==='/rest/v1/documents')return Response.json([f.state.document]);
    if(u.pathname==='/rest/v1/document_versions')return Response.json([f.state.version]);
    if(u.pathname.startsWith('/storage/v1/object/authenticated/crm-documents/'))return new Response(bytes,{headers:{'content-type':'application/pdf'}});
    if(u.pathname==='/rest/v1/commercial_mail_inbox')return Response.json([]);
    if(u.pathname==='/rest/v1/commercial_mail_outbox'){
      if(options.method==='POST'){assert.equal(options.headers.authorization,'Bearer synthetic-service');saved={...JSON.parse(options.body),id:OUT};return Response.json([{id:OUT}],{status:201});}
      return Response.json(saved?[saved]:[]);
    }
    if(u.pathname==='/rest/v1/rpc/crm_mail_finish_send_v3'){const b=JSON.parse(options.body);assert.deepEqual(b,{p_outbox_id:OUT,p_organization_id:ORG,p_provider_message_id:'provider-http-fixture',p_sent_at:'2026-10-11T00:00:00.000Z'});saved.status='SENT';saved.provider_message_id=b.p_provider_message_id;return Response.json({status:saved.status,provider_message_id:saved.provider_message_id});}
    throw Error('Unexpected network operation');
  };
  const handler=createHandler({repository:createRepository({url:'https://synthetic.supabase.co',publicKey:'synthetic-public',serviceKey:'synthetic-service',fetcher}),provider:createProvider({apiKey:'synthetic-provider',fetcher}),now:()=> '2026-10-11T00:00:00.000Z'});
  const send=async body=>{const r=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer synthetic-user'},body:JSON.stringify(body)}));return r.json();};
  assert.equal((await send({action:'capabilities'})).contract_version,3);assert.equal(saved,null);assert.equal((await send(payload())).ok,true);assert.equal((await send(payload())).replayed,true);assert.equal(calls.filter(c=>new URL(c.url).hostname==='api.resend.com').length,1);
});
test('repository claim unique conflict reads prior row without upsert or retry',async()=>{
  const calls=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{calls.push({url,options});return options.method==='POST'?Response.json({code:'23505'},{status:409}):Response.json([{id:OUT,status:'SENDING'}]);}});const r=await repo.claim({organization_id:ORG,idempotency_key:KEY});assert.equal(r.claimed,false);assert.equal(r.existing.id,OUT);assert.equal(calls.length,2);assert.equal(calls[0].options.headers.Prefer,'return=representation');assert.ok(!JSON.stringify(calls).includes('merge-duplicates'));
});
test('anonymous Supabase user is rejected by adapter',async()=>{
  const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async()=>Response.json({id:USER,is_anonymous:true})});await assert.rejects(repo.authenticate(new Request('https://example.test',{headers:{authorization:'Bearer test'}})),e=>e.code==='unauthorized');
});
test('provider expired-window responses remain uncertain and no automatic send retry exists',async()=>{
  for(const status of [408,409,429,500,503])assert.equal(classifyProviderResponse(status,{message:'temporary'}).uncertain,true);
  const f=fixture();f.state.attempts.push({id:OUT,organization_id:ORG,lead_id:LEAD,created_by:USER,idempotency_key:KEY,request_hash:'legacy-or-mismatched',status:'SENT',provider_message_id:null});const r=await f.run();assert.equal(r.body.ok,false);assert.equal(f.state.sends.length,0);
});
