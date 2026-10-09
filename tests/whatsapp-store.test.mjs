import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevStore, createVerifiedStore, DEV_PROJECT } from '../whatsapp-store.mjs';
import { createHandler } from '../api/whatsapp-webhook.mjs';
const env = { WHATSAPP_ENVIRONMENT: 'dev', WHATSAPP_SUPABASE_URL: `https://${DEV_PROJECT}.supabase.co`, WHATSAPP_SUPABASE_SERVICE_KEY: 'synthetic-key', WHATSAPP_ORGANIZATION_ID: 'synthetic-org', WHATSAPP_WABA_ID: 'synthetic-waba', WHATSAPP_PHONE_NUMBER_ID: 'synthetic-phone' };
test('only exact DEV project is allowed; production and missing configuration fail closed', () => {
  assert.equal(createDevStore({ env: {} }), null);
  assert.equal(createDevStore({ env: { ...env, VERCEL_ENV: 'production' } }), null);
  assert.equal(createDevStore({ env: { ...env, WHATSAPP_SUPABASE_URL: 'https://qzfprdhmcaucqcdqgqiz.supabase.co' } }), null);
  assert.equal(createDevStore({ env: { ...env, WHATSAPP_SUPABASE_URL: env.WHATSAPP_SUPABASE_URL + '.evil.test' } }), null);
});
test('production handler blocks even an injected store', async () => {
  const result = await createHandler({ env: { ...env, VERCEL_ENV: 'production', WHATSAPP_INTAKE_ENABLED: 'true' }, commitBatch: () => assert.fail() })(new Request('https://local.test/'));
  assert.equal(result.status, 503);
});
test('a successful write without complete matching readback is not durable evidence', async () => {
  const event = { eventKey: 'key', contentHash: 'hash' };
  for (const rows of [[], [{ id: 'id', eventKey: 'key', contentHash: 'wrong' }]]) {
    const store = createVerifiedStore({ organizationId: 'org', wabaId: 'w', phoneNumberId: 'p', rpc: async name => name === 'whatsapp_receive_batch' ? { committed: true } : rows });
    await assert.rejects(store.commitBatch([event]));
  }
});
test('transport errors never emit payload or credential in exception', async () => {
  const store = createDevStore({ env, fetcher: async () => new Response('private server error', { status: 500 }) });
  await assert.rejects(store.commitBatch([{ eventKey: 'key' }]), { message: 'storage_unavailable' });
});
test('separate readback request verifies persisted hashes and exact account scope', async () => {
  const calls = [];
  const store = createDevStore({ env, fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? { committed: true } : [{ id: 'receipt', eventKey: 'key', contentHash: 'hash' }]);
  } });
  const result = await store.commitBatch([{ eventKey: 'key', contentHash: 'hash' }]);
  assert.equal(result.durable, true); assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).p_org, env.WHATSAPP_ORGANIZATION_ID);
  assert.match(calls[1].url, /whatsapp_read_receipts$/);
});
