import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler, MailError, LIMITS, STORAGE_BUCKET, readLimitedBytes, sha256, providerEvidenceId } from '../supabase/functions/commercial-mail-send-v3/core.mjs';
import { classifyProviderResponse, createProvider, createRepository } from '../supabase/functions/commercial-mail-send-v3/adapters.mjs';

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORG = uid(1), USER = uid(2), LEAD = uid(3), DOC = uid(4), VERSION = uid(5), KEY = uid(6), OUT = uid(7);
const bytes = new TextEncoder().encode('%PDF-1.7\nSYNTHETIC FIXTURE ONLY');
const fixtureReplyHash = await sha256(JSON.stringify({ id:uid(20),lead_id:LEAD,from_address:'contact@example.test',subject:'Consulta sintética',received_at:'2026-10-11T00:00:00.000Z',message_id:'<synthetic@example.test>',content:'Necesito una ficha del producto sintético.' }));
const payload = () => ({ lead_id: LEAD, to: 'contact@example.test', subject: 'Ficha del caso', body: 'Material de prueba sin datos reales.', document_ids: [DOC], idempotency_key: KEY, reply_to_inbox_id: uid(20), reply_source_hash: fixtureReplyHash });
function fixture() {
  const state = { actor: { user: { id: USER }, profile: { id: USER, organization_id: ORG, role: 'SALES' } }, lead: { id: LEAD, organization_id: ORG, owner_user_id: USER, created_by: USER }, document: { id: DOC, organization_id: ORG, lead_id: LEAD, current_version: 1, status: 'CURRENT' }, version: { id: VERSION, document_id: DOC, organization_id: ORG, lead_id: LEAD, version_number: 1, is_current: true, status: 'CURRENT', storage_path: `${ORG}/${LEAD}/${DOC}/v1/1-fixture.pdf`, file_name: 'fixture.pdf', mime_type: 'application/pdf', size_bytes: bytes.length }, inbound: { id: uid(20), organization_id: ORG, lead_id: LEAD, contact_id: null, from_address: 'contact@example.test', provider: 'RESEND_FORWARD', provider_message_id: 'inbound-provider-fixture', subject: 'Consulta sintética', summary: 'Necesito una ficha del producto sintético.', received_at: '2026-10-11T00:00:00.000Z', source_payload: { message_id: '<synthetic@example.test>', source: 'resend-forward', email_id: 'inbound-provider-fixture' } }, inboundActivities: [], attempts: [], sends: [], downloads: [], activities: [], calls: [] };
  const repository = {
    authenticate: async () => state.actor,
    capabilities: async () => ({ contract_version: 3, attachments: true, idempotency: true, bucket_private: true }),
    getLead: async () => state.lead,
    getAttempt: async (org,key) => state.attempts.find(row => row.organization_id === org && row.idempotency_key === key),
    getPendingCase: async (org,lead,excludeId=null) => state.attempts.find(row => row.organization_id === org && row.lead_id === lead && row.status !== 'FAILED' && (row.status !== 'SENT' || !providerEvidenceId(row.provider_message_id)) && row.id !== excludeId),
    getUnresolved: async (org,hash) => state.attempts.find(row => row.organization_id === org && row.request_hash === hash && row.status === 'SENDING'),
    getDocuments: async () => [{ document: state.document, version: state.version }],
    downloadPrivate: async (bucket,path) => { state.downloads.push({ bucket, path }); return { bytes, mime_type: 'application/pdf' }; },
    hasInbound: async () => Boolean(state.inbound),
    getInbound: async id => state.inbound?.id === id ? structuredClone(state.inbound) : null,
    getInboundActivities: async () => state.inboundActivities,
    claim: async record => {
      state.calls.push('claim');
      const existing = state.attempts.find(row => row.organization_id === record.organization_id && row.idempotency_key === record.idempotency_key);
      if (existing) return { claimed: false, existing };
      if (state.attempts.some(row => row.organization_id === record.organization_id && row.request_hash === record.request_hash && row.status === 'SENDING')) return { claimed: false };
      const row = { ...record, id: state.attempts.length ? uid(100+state.attempts.length) : OUT }; state.attempts.push(row); return { claimed: true, row };
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
  assert.equal(result.status,200); assert.deepEqual({ ...result.body, limits: undefined }, { ok:true,contract_version:3,attachments:true,idempotency:true,reply_binding:true,limits:undefined }); assertNoMail(f);
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
test('unsafe inbound Message-ID blocks the bound reply before provider or reservation',async()=>{
  const f=fixture();f.state.inbound.source_payload.message_id='<a@b>\r\nBcc: hidden@example.test';const r=await f.run();assert.equal(r.body.error,'reply_thread_unavailable');assertNoMail(f);
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
    if(u.pathname==='/rest/v1/commercial_mail_inbox')return Response.json([{...f.state.inbound,...f.state.inbound.source_payload}]);
    if(u.pathname==='/rest/v1/commercial_mail_outbox'){
      if(options.method==='POST'){assert.equal(options.headers.authorization,'Bearer synthetic-service');saved={...JSON.parse(options.body),id:OUT};return Response.json([{id:OUT}],{status:201});}
      const status=u.searchParams.get('status');return Response.json(saved && (!status || (status==='not.in.(SENT,FAILED)'?!['SENT','FAILED'].includes(saved.status):status===`eq.${saved.status}`)) && u.searchParams.get('id')!==`neq.${saved.id}` && Number(u.searchParams.get('offset')||0)===0 ? [saved]:[]);
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

test('reply binding capability requires no mutable inbox or activity read', async () => {
  const f=fixture();f.repository.hasInbound=f.repository.getInbound=f.repository.getInboundActivities=async()=>{throw Error('unexpected source lookup');};
  const r=await f.run({action:'capabilities'});assert.equal(r.body.reply_binding,true);assertNoMail(f);
});
test('WEB_FORM/new mail with no inbox preserves explicit null and sends no reply headers',async()=>{
  for(const explicit of [true,false]){const f=fixture();f.state.inbound=null;const b={...payload(),reply_to_inbox_id:null,reply_source_hash:null};if(!explicit)delete b.reply_to_inbox_id;const r=await f.run(b);assert.equal(r.body.ok,true);assert.equal(r.body.reply_to_inbox_id,null);assert.equal(f.state.attempts[0].inbound_mail_id,null);assert.deepEqual(f.state.sends[0].mail.headers,{});}
});
test('own synthetic new-mail test still supports a private TXT attachment',async()=>{
  const f=fixture();f.state.inbound=null;const txt=new TextEncoder().encode('Solo prueba sintética.');Object.assign(f.state.version,{file_name:'test.txt',mime_type:'text/plain',size_bytes:txt.length,storage_path:`${ORG}/${LEAD}/${DOC}/v1/test.txt`});f.repository.downloadPrivate=async()=>({bytes:txt,mime_type:'text/plain; charset=utf-8'});const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null});assert.equal(r.body.ok,true);assert.equal(f.state.sends[0].mail.attachments[0].content,Buffer.from(txt).toString('base64'));assert.deepEqual(f.state.sends[0].mail.headers,{});
});
test('null or omitted source is refused whenever an inbox row exists, never auto-selected',async()=>{
  for(const explicit of [true,false]){const f=fixture();let selected=0;f.repository.getInbound=async()=>{selected++;return f.state.inbound;};const b={...payload(),reply_to_inbox_id:null,reply_source_hash:null};if(!explicit)delete b.reply_to_inbox_id;const r=await f.run(b);assert.equal(r.body.error,'reply_context_required');assert.equal(r.body.send_attempted,false);assert.equal(selected,0);assertNoMail(f);}
});
test('reply reference must be UUID or null',async()=>{
  for(const id of ['',false,123,{},'https://example.test/message']){const f=fixture();assert.equal((await f.run({...payload(),reply_to_inbox_id:id})).body.error,'invalid_reply_context');assertNoMail(f);}
});
test('selected row absent, foreign organization or foreign case cannot be replaced by latest/contact match',async()=>{
  for(const mutate of [f=>f.state.inbound=null,f=>f.state.inbound.id=uid(77),f=>f.state.inbound.organization_id=uid(77),f=>f.state.inbound.lead_id=uid(77)]){const f=fixture();mutate(f);const r=await f.run();assert.equal(r.status,404);assert.equal(r.body.error,'reply_context_not_accessible');assertNoMail(f);}
});
test('explicit older selected source keeps its own recipient, headers and outbox reference after newer arrival',async()=>{
  const f=fixture(), selected=structuredClone(f.state.inbound), newer={...selected,id:uid(21),from_address:'newer@example.test',source_payload:{...selected.source_payload,message_id:'<newer@example.test>'}};const seen=[];
  f.repository.getInbound=async(id,lead,org,actor)=>{seen.push({id,lead,org,actor:actor.user.id});return structuredClone(id===selected.id?selected:newer);};await f.run();assert.deepEqual(seen.map(x=>x.id),[selected.id,selected.id]);assert.ok(seen.every(x=>x.lead===LEAD&&x.org===ORG&&x.actor===USER));assert.equal(f.state.sends[0].mail.to[0],selected.from_address);assert.equal(f.state.sends[0].mail.headers['In-Reply-To'],selected.source_payload.message_id);assert.equal(f.state.attempts[0].inbound_mail_id,selected.id);
});
test('reply recipient must be selected sender, never contact or unverified replyTo fields',async()=>{
  for(const to of ['contact-elsewhere@example.test','replyto@example.test']){const f=fixture();f.state.inbound.source_payload.reply_to='replyto@example.test';f.state.inbound.source_payload.replyTo='replyto@example.test';const r=await f.run({...payload(),to});assert.equal(r.body.error,'reply_recipient_mismatch');assertNoMail(f);}
});
test('sender address rejects URLs, lists and injected headers',async()=>{
  for(const sender of ['https://example.test','a@example.test,b@example.test','a@example.test\r\nBcc: b@example.test','Name <contact@example.test>',null]){const f=fixture();f.state.inbound.from_address=sender;assert.equal((await f.run()).body.error,'reply_sender_unavailable');assertNoMail(f);}
});
test('historical opaque provider IDs do not become RFC reply headers',async()=>{
  for(const source of [{source:'resend-forward',email_id:'inbound-provider-fixture'},{source:'resend-forward',email_id:'inbound-provider-fixture',messageId:'123456789'},{source:'resend-forward',email_id:'inbound-provider-fixture',message_id:'<one@example.test>',messageId:'<two@example.test>'}]){const f=fixture();f.state.inbound.source_payload=source;assert.equal((await f.run()).body.error,'reply_thread_unavailable');assertNoMail(f);}
});
test('valid RFC header on the selected row is retained, with no URLs fetched from its payload',async()=>{
  const f=fixture();f.state.inbound.source_payload={source:'resend-forward',email_id:'inbound-provider-fixture',messageId:'<verified@example.test>',url:'https://untrusted.invalid/never-fetch'};await f.run({...payload(),reply_source_hash:await reviewedHash(f.state.inbound)});assert.equal(f.state.sends[0].mail.headers.References,'<verified@example.test>');assert.equal(f.state.downloads.length,1);assert.equal(f.state.downloads[0].bucket,STORAGE_BUCKET);
});
test('unknown content provenance or provider identity mismatch blocks outgoing mail',async()=>{
  for(const mutate of [f=>f.state.inbound.provider='ZOHO_MAIL',f=>f.state.inbound.source_payload.source='unverified',f=>f.state.inbound.source_payload.email_id='different',f=>f.state.inbound.provider_message_id=null]){const f=fixture();mutate(f);assert.equal((await f.run()).body.error,'reply_content_unavailable');assertNoMail(f);}
});
test('missing, subject-only and known content placeholders cannot authorize a reply',async()=>{
  for(const summary of ['',null,'Consulta sintética','Contenido del correo no disponible. Revisa el original.','Contenido completo no disponible.','Contenido pendiente de recuperación.','Sin contenido']){const f=fixture();f.state.inbound.summary=summary;assert.equal((await f.run()).body.error,'reply_content_unavailable');assertNoMail(f);}
});
async function reviewedHash(inbound, content=inbound.summary) {
  const normalize = v => v.replace(/\r\n?/g,'\n').trim();
  return sha256(JSON.stringify({id:inbound.id,lead_id:inbound.lead_id,from_address:inbound.from_address.trim().toLowerCase(),subject:normalize(inbound.subject),received_at:new Date(inbound.received_at).toISOString(),message_id:(inbound.source_payload.message_id||inbound.source_payload.messageId).trim(),content:normalize(content)}));
}
function longInbound(f, length=1800) {
  const body='Consulta del mensaje seleccionado. '+ 'x'.repeat(length-35);f.state.inbound.summary=body.slice(0,1200);
  f.state.inboundActivities=[{organization_id:ORG,lead_id:LEAD,contact_id:null,type:'EMAIL',subject:f.state.inbound.subject,occurred_at:f.state.inbound.received_at,notes:body}];return body;
}
test('complete long content is recovered only from an exact uniquely matched EMAIL activity',async()=>{
  const f=fixture();const content=longInbound(f);const r=await f.run({...payload(),reply_source_hash:await reviewedHash(f.state.inbound,content)});assert.equal(r.body.ok,true);assert.equal(f.state.sends.length,1);
});
test('truncated excerpt/body and multiple candidate activities remain incomplete',async()=>{
  for(const mutate of [f=>f.state.inboundActivities=[],f=>f.state.inboundActivities.push({...f.state.inboundActivities[0]}),f=>f.state.inboundActivities[0].notes=f.state.inboundActivities[0].notes.padEnd(4000,' '),f=>f.state.inboundActivities[0].notes='Contenido completo pendiente de recuperación.']){const f=fixture();longInbound(f);mutate(f);assert.equal((await f.run()).body.error,'reply_content_incomplete');assertNoMail(f);}
});
test('trailing whitespace cannot hide the 1200-character summary cutoff',async()=>{
  const f=fixture();f.state.inbound.summary='Mensaje sintético'.padEnd(1200,' ');f.state.inboundActivities=[];assert.equal((await f.run()).body.error,'reply_content_incomplete');assertNoMail(f);
});
test('activity mismatch in org, lead, contact, type, subject, date or prefix cannot supply content',async()=>{
  for(const fields of [{organization_id:uid(90)},{lead_id:uid(90)},{contact_id:uid(90)},{type:'NOTE'},{subject:'Otro asunto'},{occurred_at:'2026-10-10T00:00:00Z'},{notes:'Otro mensaje'.repeat(100)}]){const f=fixture();longInbound(f);Object.assign(f.state.inboundActivities[0],fields);assert.equal((await f.run()).body.error,'reply_content_incomplete');assertNoMail(f);}
});
test('body, header or subject mutation during attachment awaits blocks before reservation',async()=>{
  for(const mutate of [f=>f.state.inbound.summary='Otro contenido válido',f=>f.state.inbound.source_payload.message_id='<changed@example.test>',f=>f.state.inbound.subject='Otro asunto']){const f=fixture();f.repository.downloadPrivate=async()=>{mutate(f);return {bytes,mime_type:'application/pdf'};};const r=await f.run();assert.equal(r.body.error,'reply_context_changed');assertNoMail(f);}
});
test('sender/case mutation during awaits cannot readdress or relink the reply',async()=>{
  for(const mutate of [f=>f.state.inbound.from_address='changed@example.test',f=>f.state.inbound.lead_id=uid(90)]){const f=fixture();f.repository.downloadPrivate=async()=>{mutate(f);return {bytes,mime_type:'application/pdf'};};const r=await f.run();assert.equal(r.body.ok,false);assertNoMail(f);}
});
test('a new inbox row during new-mail attachment preparation makes an explicit source required',async()=>{
  const f=fixture(), inbound=f.state.inbound;f.state.inbound=null;f.repository.downloadPrivate=async()=>{f.state.inbound=inbound;return {bytes,mime_type:'application/pdf'};};const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null});assert.equal(r.body.error,'reply_context_required');assertNoMail(f);
});
test('SENT and uncertain replay precede rereading mutable source rows',async()=>{
  for(const uncertain of [false,true]){const f=fixture();if(uncertain)f.provider.send=async()=>{f.state.sends.push({});throw Error('lost response');};await f.run();f.state.inbound=null;f.repository.getInbound=f.repository.hasInbound=f.repository.getInboundActivities=async()=>{throw Error('must not reread source for replay');};const r=await f.run();assert.equal(r.body.status,uncertain?'UNKNOWN':'SENT');assert.equal(f.state.sends.length,1);}
});
test('changing source with the same idempotency key conflicts before fetching that new source',async()=>{
  const f=fixture();await f.run();f.repository.getInbound=async()=>{throw Error('unexpected lookup');};const r=await f.run({...payload(),reply_to_inbox_id:uid(21)});assert.equal(r.body.error,'idempotency_conflict');assert.equal(f.state.sends.length,1);
});
test('legacy unresolved fingerprint remains guarded after source is added to the new hash',async()=>{
  const f=fixture(),b=payload();const hash=await sha256(JSON.stringify({version:3,organization_id:ORG,lead_id:LEAD,to:b.to,subject:b.subject,body:b.body,document_ids:b.document_ids}));f.state.attempts.push({id:OUT,organization_id:ORG,request_hash:hash,idempotency_key:uid(91),status:'SENDING'});f.repository.getInbound=async()=>{throw Error('must check ledger first');};const r=await f.run();assert.equal(r.body.error,'matching_attempt_requires_review');assert.equal(r.body.retry_allowed,false);assert.equal(f.state.sends.length,0);
});
test('repository selected inbox/activity queries use actor RLS plus exact case/org/id, no latest fallback',async()=>{
  const calls=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json([]);}});const actor={authorization:'Bearer synthetic-user'};assert.equal(await repo.getInbound(uid(20),LEAD,ORG,actor),null);await repo.getInboundActivities({organization_id:ORG,lead_id:LEAD,contact_id:null,subject:'Asunto exacto',received_at:'2026-10-11T00:00:00.000Z'},actor);
  const q=calls[0].url.searchParams;assert.equal(q.get('id'),`eq.${uid(20)}`);assert.equal(q.get('lead_id'),`eq.${LEAD}`);assert.equal(q.get('organization_id'),`eq.${ORG}`);assert.equal(q.has('order'),false);assert.ok(calls.every(c=>c.options.headers.authorization==='Bearer synthetic-user'));assert.equal(calls[1].url.searchParams.get('limit'),'2');assert.equal(calls[1].url.searchParams.get('contact_id'),'is.null');assert.equal(calls[1].url.searchParams.get('subject'),'eq.Asunto exacto');
});
test('missing-source existence guard returns only boolean, org+lead scoped, including RLS-hidden rows',async()=>{
  let seen;const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{seen={url:new URL(url),options};return Response.json([{id:uid(20)}]);}});assert.equal(await repo.hasInbound({id:LEAD,organization_id:ORG},ORG,{authorization:'Bearer synthetic-user'}),true);assert.equal(seen.url.searchParams.get('select'),'id');assert.equal(seen.url.searchParams.get('organization_id'),`eq.${ORG}`);assert.equal(seen.url.searchParams.get('lead_id'),`eq.${LEAD}`);assert.equal(seen.options.headers.authorization,'Bearer service');
});

test('selected reply requires a valid SHA256 reviewed-source hash; new mail cannot carry one',async()=>{
  for(const hash of [undefined,null,'',123,{},'x'.repeat(64),'a'.repeat(63)]){const f=fixture();const b={...payload(),reply_source_hash:hash};const r=await f.run(b);assert.equal(r.body.error,'invalid_reply_context');assertNoMail(f);}
  const f=fixture();f.state.inbound=null;assert.equal((await f.run({...payload(),reply_to_inbox_id:null})).body.error,'invalid_reply_context');assertNoMail(f);
});
test('reviewed source changed before POST is refused before document download or reservation',async()=>{
  for(const mutate of [f=>f.state.inbound.summary='Texto cambiado antes del envío',f=>f.state.inbound.subject='Asunto cambiado',f=>f.state.inbound.source_payload.message_id='<previous-change@example.test>',f=>f.state.inbound.received_at='2026-10-10T00:00:00.000Z']){const f=fixture();mutate(f);const r=await f.run();assert.equal(r.body.error,'reply_context_changed');assert.equal(r.body.send_attempted,false);assert.equal(r.body.retry_allowed,true);assert.equal(f.state.downloads.length,0);assertNoMail(f);}
});
test('reviewed full content hash protects body beyond the summary prefix',async()=>{
  const f=fixture(),body=longInbound(f),hash=await reviewedHash(f.state.inbound,body);f.state.inboundActivities[0].notes=body.slice(0,1200)+'Changed tail';const r=await f.run({...payload(),reply_source_hash:hash});assert.equal(r.body.error,'reply_context_changed');assert.equal(f.state.downloads.length,0);assertNoMail(f);
});
test('canonical source hash normalizes email case, text line endings and ISO dates exactly',async()=>{
  const f=fixture();Object.assign(f.state.inbound,{from_address:' Contact@Example.Test ',subject:' Consulta\r\nsintética ',summary:' Texto\r\ncompleto\rfinal ',received_at:'2026-10-10T19:00:00-05:00'});f.state.inbound.source_payload.message_id=' <verified@example.test> ';
  const canonical={id:uid(20),lead_id:LEAD,from_address:'contact@example.test',subject:'Consulta\nsintética',received_at:'2026-10-11T00:00:00.000Z',message_id:'<verified@example.test>',content:'Texto\ncompleto\nfinal'};
  const hash=await sha256(JSON.stringify(canonical));const r=await f.run({...payload(),reply_source_hash:hash.toUpperCase()});assert.equal(r.body.ok,true);assert.equal(f.state.sends[0].mail.headers['In-Reply-To'],canonical.message_id);
});
test('invalid source date cannot masquerade as a reviewed snapshot',async()=>{
  const f=fixture();f.state.inbound.received_at='not-a-date';const r=await f.run();assert.equal(r.body.error,'reply_content_unavailable');assertNoMail(f);
});
test('same attempt with another reviewed source hash conflicts before source reads',async()=>{
  const f=fixture();await f.run();f.repository.getInbound=async()=>{throw Error('must not reread');};const r=await f.run({...payload(),reply_source_hash:'f'.repeat(64)});assert.equal(r.body.error,'idempotency_conflict');assert.equal(r.body.retry_allowed,false);assert.equal(f.state.sends.length,1);
});

test('replay detects altered/deleted inbound FK and preserves known provider acceptance without reread or resend',async()=>{
  for(const inbound_mail_id of [null,uid(99)]){const f=fixture();await f.run();f.state.attempts[0].inbound_mail_id=inbound_mail_id;f.repository.getInbound=async()=>{throw Error('must not reread');};const r=await f.run();assert.equal(r.body.status,'UNKNOWN');assert.equal(r.body.error,'attempt_requires_review');assert.equal(r.body.provider_status,'ACCEPTED');assert.equal(r.body.provider_message_id,'provider-fixture-1');assert.equal(r.body.delivery_status,'UNCONFIRMED');assert.equal(r.body.retry_allowed,false);assert.equal(r.body.requires_review,true);assert.equal('reply_to_inbox_id' in r.body,false);assert.equal(f.state.sends.length,1);assert.equal(f.state.attempts[0].status,'SENT');}
});
function orphanGuardFixture({contact={id:uid(31),organization_id:ORG,email:'contact@example.test'},institution={id:uid(32),organization_id:ORG,email:'institution@example.test'},inbox=[]}={}){
  const f=fixture(),calls=[];f.state.inbound=null;f.state.actor.authorization='Bearer synthetic-user';f.state.lead.contact_id=uid(31);f.state.lead.institution_id=uid(32);
  const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{
    const u=new URL(url),q=u.searchParams;calls.push({url:u,options});
    if(u.pathname.endsWith('/contacts'))return Response.json(contact?[contact]:[]);
    if(u.pathname.endsWith('/institutions'))return Response.json(institution?[institution]:[]);
    assert.ok(u.pathname.endsWith('/commercial_mail_inbox'));
    const match=inbox.filter(row=>row.organization_id===q.get('organization_id').slice(3)&&(q.get('lead_id')==='is.null'?row.lead_id===null:row.lead_id===q.get('lead_id').slice(3))&&(!q.has('contact_id')||row.contact_id===q.get('contact_id').slice(3))&&(!q.has('from_address')||row.from_address.toLowerCase()===q.get('from_address').slice(6).replace(/\\([%_])/g,'$1').toLowerCase()));
    return Response.json(match.length?[{id:match[0].id}]:[]);
  }});f.repository.hasInbound=repo.hasInbound;return {...f,guardCalls:calls};
}
test('orphan inbox for an authorized case contact blocks null-source send without adopting the orphan',async()=>{
  const f=orphanGuardFixture({inbox:[{id:uid(35),organization_id:ORG,lead_id:null,contact_id:uid(31),from_address:'different@example.test'}]});const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null});assert.equal(r.body.error,'reply_context_required');assertNoMail(f);assert.equal(f.guardCalls.at(-1).url.searchParams.get('contact_id'),`eq.${uid(31)}`);assert.equal(f.guardCalls.at(-1).url.searchParams.get('lead_id'),'is.null');
});
test('orphan sender match uses only actor-accessible case contact/institution emails, case-insensitively',async()=>{
  for(const from_address of ['CONTACT@EXAMPLE.TEST','Institution@Example.Test']){const f=orphanGuardFixture({inbox:[{id:uid(35),organization_id:ORG,lead_id:null,contact_id:null,from_address}]});const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null,to:'arbitrary@example.test'});assert.equal(r.body.error,'reply_context_required');assertNoMail(f);assert.ok(f.guardCalls.filter(c=>/\/(contacts|institutions)$/.test(c.url.pathname)).every(c=>c.options.headers.authorization==='Bearer synthetic-user'&&c.url.searchParams.get('select')==='id,organization_id,email'));assert.ok(f.guardCalls.filter(c=>c.url.searchParams.has('from_address')).every(c=>!c.url.searchParams.get('from_address').includes('arbitrary')));}
});
test('guard never treats inbox already linked to another case/org or arbitrary payload recipient as source',async()=>{
  const f=orphanGuardFixture({inbox:[{id:uid(35),organization_id:ORG,lead_id:uid(99),contact_id:uid(31),from_address:'contact@example.test'},{id:uid(36),organization_id:uid(99),lead_id:null,contact_id:uid(31),from_address:'contact@example.test'},{id:uid(37),organization_id:ORG,lead_id:null,contact_id:null,from_address:'arbitrary@example.test'}]});const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null,to:'arbitrary@example.test'});assert.equal(r.body.ok,true);assert.equal(f.state.attempts[0].inbound_mail_id,null);assert.deepEqual(f.state.sends[0].mail.headers,{});
});
test('email existence guard escapes percent and underscore without OR injection or broad matching',async()=>{
  const address='x%_tag@example.test',f=orphanGuardFixture({contact:{id:uid(31),organization_id:ORG,email:address},inbox:[{id:uid(35),organization_id:ORG,lead_id:null,contact_id:null,from_address:address}]});assert.equal((await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null})).body.error,'reply_context_required');const calls=f.guardCalls.filter(c=>c.url.searchParams.has('from_address'));assert.equal(calls[0].url.searchParams.get('from_address'),'ilike.x\\%\\_tag@example.test');assert.ok(f.guardCalls.every(c=>!c.url.searchParams.has('or')));assertNoMail(f);
});
test('inaccessible/wrong case relations, malformed and PostgREST wildcard-alias emails fail closed',async()=>{
  for(const contact of [null,{id:uid(99),organization_id:ORG,email:'contact@example.test'},{id:uid(31),organization_id:uid(99),email:'contact@example.test'},{id:uid(31),organization_id:ORG,email:'foo*bar@example.test'},{id:uid(31),organization_id:ORG,email:'contact@example.test\r\nBcc: other@example.test'}]){const f=orphanGuardFixture({contact});const r=await f.run({...payload(),reply_to_inbox_id:null,reply_source_hash:null});assert.equal(r.body.error,'reply_context_not_accessible');assertNoMail(f);}
});

test('unknown attempt freezes case across new key and changed reviewed body/source/outgoing content',async()=>{
  for(const mutation of ['body','source','outgoing']){const f=fixture();f.provider.send=async()=>{f.state.sends.push({});throw Error('provider timeout');};assert.equal((await f.run()).body.status,'UNKNOWN');if(mutation==='source')f.state.inbound.id=uid(21);else f.state.inbound.summary='Contenido nuevo revisado';const b={...payload(),reply_to_inbox_id:f.state.inbound.id,reply_source_hash:await reviewedHash(f.state.inbound),idempotency_key:uid(90),...(mutation==='outgoing'?{body:'Un borrador cambiado'}:{})};f.repository.getInbound=async()=>{throw Error('pending ledger must precede mutable read');};const r=await f.run(b);assert.equal(r.body.error,'matching_attempt_requires_review');assert.equal(r.body.requires_review,true);assert.equal(r.body.retry_allowed,false);assert.equal(f.state.sends.length,1);assert.equal(f.state.attempts.length,1);assert.equal(f.state.attempts[0].status,'SENDING');}
});
test('concurrent differing fingerprints cannot both send while reservations are unresolved',async()=>{
  const f=fixture(),claim=f.repository.claim;let release,arrived=0;const gate=new Promise(resolve=>release=resolve);f.repository.claim=async record=>{if(++arrived===2)release();await gate;return claim(record);};
  const [a,b]=await Promise.all([f.run(),f.run({...payload(),body:'Otro borrador paralelo',idempotency_key:uid(90)})]);assert.equal(a.body.status,'UNKNOWN');assert.equal(b.body.status,'UNKNOWN');assert.equal(f.state.sends.length,0);assert.equal(f.state.attempts.length,2);assert.ok(f.state.attempts.every(row=>row.status==='SENDING'));assert.ok([a,b].every(r=>r.body.retry_allowed===false));
});
test('post-claim case guard failure leaves own reservation uncertain and makes no provider call',async()=>{
  const f=fixture(),pending=f.repository.getPendingCase;f.repository.getPendingCase=async(...args)=>{if(args[2])throw Error('read unavailable after durable claim');return pending(...args);};const r=await f.run();assert.equal(r.body.status,'UNKNOWN');assert.equal(r.body.retry_allowed,false);assert.equal(f.state.attempts[0].status,'SENDING');assert.equal(f.state.sends.length,0);
});
test('definitive FAILED permits an explicitly corrected new attempt, while exact SENT bypasses mutable/pending guards',async()=>{
  const f=fixture(),send=f.provider.send;f.provider.send=async()=>({accepted:false,uncertain:false});assert.equal((await f.run()).body.status,'FAILED');f.state.inbound.summary='Texto corregido y revisado';const b={...payload(),idempotency_key:uid(90),reply_source_hash:await reviewedHash(f.state.inbound)};f.provider.send=send;assert.equal((await f.run(b)).body.status,'SENT');assert.equal(f.state.attempts[0].status,'FAILED');f.repository.getPendingCase=f.repository.getInbound=async()=>{throw Error('exact receipt comes first');};assert.equal((await f.run(b)).body.replayed,true);assert.equal(f.state.sends.length,1);
});
test('unresolved other case or other organization does not freeze an authorized independent new attempt',async()=>{
  const f=fixture();f.state.attempts.push({id:uid(91),organization_id:ORG,lead_id:uid(99),status:'SENDING'},{id:uid(92),organization_id:uid(99),lead_id:LEAD,status:'SENDING'});assert.equal((await f.run()).body.ok,true);assert.equal(f.state.sends.length,1);
});
test('repository pending-case query is service ledger only, scoped by org/case/status and excludes own reservation',async()=>{
  const calls=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json([{id:uid(92)}]);}});assert.equal((await repo.getPendingCase(ORG,LEAD,OUT)).id,uid(92));const q=calls[0].url.searchParams;assert.equal(q.get('select'),'id');assert.equal(q.get('organization_id'),`eq.${ORG}`);assert.equal(q.get('lead_id'),`eq.${LEAD}`);assert.equal(q.get('status'),'not.in.(SENT,FAILED)');assert.equal(q.get('id'),`neq.${OUT}`);assert.equal(q.get('limit'),'1');assert.equal(calls[0].options.headers.authorization,'Bearer service');
});

test('legacy SENT without valid provider evidence and UNKNOWN freeze case without rewriting history',async()=>{
  for(const legacy of [{status:'UNKNOWN',provider_message_id:null},... [null,'',' ','no-disponible','undefined','false','provider@invalid','x'.repeat(201)].map(provider_message_id=>({status:'SENT',provider_message_id}))]){const f=fixture(),row={id:uid(97),organization_id:ORG,lead_id:LEAD,idempotency_key:uid(98),request_hash:null,...legacy};f.state.attempts.push(row);f.repository.getInbound=async()=>{throw Error('must freeze before mutable reads');};const r=await f.run();assert.equal(r.body.error,'matching_attempt_requires_review');assert.equal(r.body.retry_allowed,false);assert.equal(r.body.outbox_id,row.id);assert.equal(f.state.sends.length,0);assert.equal(f.state.attempts.length,1);assert.deepEqual(f.state.attempts[0],row);}
});
test('valid historical SENT evidence does not freeze a later explicit new attempt',async()=>{
  const f=fixture();f.state.attempts.push({id:uid(97),organization_id:ORG,lead_id:LEAD,idempotency_key:uid(98),request_hash:null,status:'SENT',provider_message_id:'provider-valid-historical'});assert.equal((await f.run()).body.ok,true);assert.equal(f.state.sends.length,1);
});
test('provider evidence rejects historical sentinels consistently for provider response and durable replay',async()=>{
  for(const value of ['no_disponible','SIN-ID','none','NULL','undefined','false','true','n-a','unknown','pending','unavailable','not-available','not_provided','missing','0']){assert.equal(providerEvidenceId(value),'');assert.equal(classifyProviderResponse(200,{id:value}).accepted,false);const f=fixture();f.provider.send=async()=>({accepted:true,id:value});const r=await f.run();assert.equal(r.body.status,'UNKNOWN');assert.equal(f.state.attempts[0].status,'SENDING');}
});
test('SENT history pagination advances by actual short pages and finds invalid evidence later',async()=>{
  const calls=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async(url,options)=>{const u=new URL(url),q=u.searchParams;calls.push({u,options});if(q.get('status')==='not.in.(SENT,FAILED)')return Response.json([]);assert.equal(q.get('select'),'id,provider_message_id');assert.equal(q.get('order'),'id.asc');assert.equal(q.get('organization_id'),`eq.${ORG}`);assert.equal(q.get('lead_id'),`eq.${LEAD}`);assert.equal(q.get('id'),`neq.${OUT}`);return Response.json(q.get('offset')==='0'?[{id:uid(90),provider_message_id:'valid-provider'}]:[{id:uid(91),provider_message_id:'no_disponible'}]);}});assert.deepEqual(await repo.getPendingCase(ORG,LEAD,OUT),{id:uid(91)});assert.deepEqual(calls.map(c=>c.u.searchParams.get('offset')),[null,'0','1']);assert.ok(calls.every(c=>c.options.headers.authorization==='Bearer service'));
});
test('short valid history page is followed until empty rather than assumed exhausted',async()=>{
  const offsets=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async url=>{const q=new URL(url).searchParams;if(q.get('status')==='not.in.(SENT,FAILED)')return Response.json([]);offsets.push(q.get('offset'));return Response.json(q.get('offset')==='0'?[{id:uid(90),provider_message_id:'valid-provider'}]:[]);}});assert.equal(await repo.getPendingCase(ORG,LEAD),null);assert.deepEqual(offsets,['0','1']);
});
test('bounded history inspection fails closed, never hides an invalid row beyond 1000 valid rows',async()=>{
  const offsets=[];const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async url=>{const q=new URL(url).searchParams;if(q.get('status')==='not.in.(SENT,FAILED)')return Response.json([]);const offset=Number(q.get('offset'));offsets.push(offset);return Response.json(offset<1000?Array.from({length:100},(_,i)=>({id:uid(1000+offset+i),provider_message_id:'valid-provider'})):[{id:uid(9000),provider_message_id:null}]);}});await assert.rejects(repo.getPendingCase(ORG,LEAD),e=>e.code==='mail_history_review_required');assert.equal(offsets.length,10);
  const f=fixture();f.repository.getPendingCase=()=>repo.getPendingCase(ORG,LEAD);const r=await f.run();assert.equal(r.body.error,'mail_history_review_required');assert.equal(r.body.send_attempted,false);assert.equal(r.body.requires_review,true);assert.equal(r.body.retry_allowed,false);assertNoMail(f);
});

test('history inspection also bounds request count when server returns only one row per page',async()=>{
  let pages=0;const repo=createRepository({url:'https://synthetic.supabase.co',publicKey:'public',serviceKey:'service',fetcher:async url=>{const q=new URL(url).searchParams;if(q.get('status')==='not.in.(SENT,FAILED)')return Response.json([]);pages++;assert.equal(Number(q.get('offset')),pages-1);return Response.json([{id:uid(1000+pages),provider_message_id:'valid-provider'}]);}});await assert.rejects(repo.getPendingCase(ORG,LEAD),e=>e.code==='mail_history_review_required');assert.equal(pages,10);
});
