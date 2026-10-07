import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHandler } from '../api/whatsapp-webhook.mjs';
import { normalizeWebhook, deliveryEvidence, MAX_WEBHOOK_BYTES } from '../whatsapp-intake.mjs';

const env = { WHATSAPP_INTAKE_ENABLED: 'true', WHATSAPP_APP_SECRET: 'synthetic-secret', WHATSAPP_VERIFY_TOKEN: 'synthetic-verify', WHATSAPP_WABA_ID: 'test-waba', WHATSAPP_PHONE_NUMBER_ID: 'test-phone' };
const account = { wabaId: 'test-waba', phoneNumberId: 'test-phone' };
const message = { id: 'wamid.synthetic', from: '00000000000', timestamp: '1791331200', type: 'text', text: { body: 'Consulta de prueba sin cliente real' } };
const payload = (messages = [message], statuses = []) => ({ object: 'whatsapp_business_account', entry: [{ id: account.wabaId, changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: account.phoneNumberId }, messages, statuses } }] }] });
function request(body = payload(), signature) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://local.test/api/whatsapp-webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature ?? 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex') }, body: raw });
}
// Deliberately test-only. It does NOT implement real storage or CRM integration.
function memoryDouble() {
  const rows = new Map(); let calls = 0;
  return { rows, get calls() { return calls; }, async commitBatch(events) {
    calls++;
    for (const e of events) if (rows.has(e.eventKey) && rows.get(e.eventKey).contentHash !== e.contentHash) throw new Error('conflict');
    for (const e of events) rows.set(e.eventKey, e);
    return { durable: true, receiptId: 'synthetic-receipt', eventKeys: events.map(e => e.eventKey) };
  } };
}
test('default endpoint and enabled endpoint without adapter cannot subscribe or acknowledge', async () => {
  assert.equal((await createHandler({ env: {} })(request())).status, 503);
  assert.equal((await createHandler({ env })(request())).status, 503);
  const get = new Request('https://local.test/?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=123');
  assert.equal((await createHandler({ env })(get)).status, 503);
});
test('subscription validates token and challenge', async () => {
  const handler = createHandler({ env, commitBatch: memoryDouble().commitBatch });
  const url = 'https://local.test/?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=123';
  assert.equal(await (await handler(new Request(url))).text(), '123');
  assert.equal((await handler(new Request(url.replace('synthetic-verify', 'wrong')))).status, 403);
  assert.equal((await handler(new Request(url.replace('123', '<script>')))).status, 400);
});
test('invalid signature and tampered raw bytes never reach storage', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  assert.equal((await handler(request(payload(), 'sha256=' + '0'.repeat(64)))).status, 401);
  const signed = request();
  assert.equal((await handler(request(JSON.stringify(payload()) + ' ', signed.headers.get('x-hub-signature-256')))).status, 401);
  assert.equal(db.calls, 0);
});
test('signed malformed JSON and invalid account rejected before storage', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  assert.equal((await handler(request('{'))).status, 400);
  const body = payload(); body.entry[0].id = 'other-tenant';
  assert.equal((await handler(request(body))).status, 400);
  body.entry[0].id = account.wabaId; body.entry[0].changes[0].value.metadata.phone_number_id = 'other-phone';
  assert.equal((await handler(request(body))).status, 400);
  assert.equal(db.calls, 0);
});
test('retry and duplicates within batch produce one event in the contract double', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  for (let i = 0; i < 3; i++) assert.equal((await handler(request(payload([message, message])))).status, 200);
  assert.equal(db.rows.size, 1);
  const body = await (await handler(request())).json();
  assert.deepEqual(body, { ok: true, received: true, processing: 'unconfirmed' });
});
test('concurrent deliveries reuse the same stable key in the test double', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  const results = await Promise.all(Array.from({ length: 10 }, () => handler(request())));
  assert.ok(results.every(r => r.status === 200)); assert.equal(db.rows.size, 1);
});
test('same message id with changed content is never silently overwritten', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  await handler(request());
  assert.equal((await handler(request(payload([{ ...message, text: { body: 'changed' } }])))).status, 503);
  assert.equal([...db.rows.values()][0].text, message.text.body);
  assert.throws(() => normalizeWebhook(payload([message, { ...message, text: { body: 'changed' } }]), account));
});
test('storage down and uncertain post-commit acknowledgement return retryable failure', async () => {
  assert.equal((await createHandler({ env, commitBatch: async () => { throw new Error('down'); } })(request())).status, 503);
  const db = memoryDouble(); let first = true;
  const handler = createHandler({ env, commitBatch: async events => {
    const receipt = await db.commitBatch(events);
    if (first) { first = false; throw new Error('lost acknowledgement'); }
    return receipt;
  } });
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(request())).status, 200); assert.equal(db.rows.size, 1);
});
test('HTTP-like success is insufficient without matching durable receipt for every event', async () => {
  for (const receipt of [{ ok: true }, { durable: true, receiptId: 'x', eventKeys: [] }, { durable: true, receiptId: 'x', eventKeys: ['wrong'] }]) {
    assert.equal((await createHandler({ env, commitBatch: async () => receipt })(request())).status, 503);
  }
});
test('partial or duplicate receipt keys cannot hide an uncommitted event', async () => {
  const handler = createHandler({ env, commitBatch: async events => ({ durable: true, receiptId: 'x', eventKeys: [events[0].eventKey, events[0].eventKey] }) });
  assert.equal((await handler(request(payload([message, { ...message, id: 'other-id' }])))).status, 503);
});
test('read/delivered before sent does not downgrade delivery; receipt alone means unknown', () => {
  const status = s => ({ kind: 'status', status: s });
  assert.deepEqual(deliveryEvidence([]), { status: 'unknown', requiresReview: false });
  assert.equal(deliveryEvidence([status('read'), status('sent'), status('delivered')]).status, 'read');
  assert.deepEqual(deliveryEvidence([status('delivered'), status('failed')]), { status: 'delivered', requiresReview: true });
});
test('message and status events have distinct identities and preserve timestamps', () => {
  const events = normalizeWebhook(payload([message], [{ id: message.id, status: 'delivered', timestamp: message.timestamp }]), account);
  assert.equal(events.length, 2); assert.notEqual(events[0].eventKey, events[1].eventKey);
  assert.equal(events[1].occurredAt, '2026-10-07T00:00:00.000Z');
});
test('non-text media retained as review item without download or false attribution', () => {
  const events = normalizeWebhook(payload([{ ...message, type: 'image', image: { id: 'private-media' } }]), account);
  assert.equal(events[0].text, null); assert.equal(events[0].requiresReview, true);
  assert.equal(events[0].attribution, 'unconfirmed');
});
test('unsupported events and empty batches cannot be silently acknowledged', () => {
  assert.throws(() => normalizeWebhook(payload([]), account));
  const body = payload(); body.entry[0].changes[0].field = 'history';
  assert.throws(() => normalizeWebhook(body, account));
});
test('body size limit applies even without content-length', async () => {
  const db = memoryDouble(), handler = createHandler({ env, commitBatch: db.commitBatch });
  assert.equal((await handler(request('x'.repeat(MAX_WEBHOOK_BYTES + 1)))).status, 413);
  assert.equal(db.calls, 0);
});
