import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../conversations-store.mjs';
import {createHandler, errorResponse} from '../api/conversations.mjs';
import {createHandler as createBridgeHandler} from '../api/conversations-bridge.mjs';

// Deliberately unsigned, synthetic fixtures. No environment or live service is read.
const jwt = (role, subject) => [
  {alg: 'HS256', typ: 'JWT'},
  {role, sub: subject, iss: 'synthetic-tests-only'},
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic-signature';
const SERVICE_JWT = jwt('service_role', 'synthetic-service');
const SERVICE_SECRET = 'sb_secret_SYNTHETIC_TEST_ONLY_not_a_real_key';
const ANON_JWT = jwt('anon', 'synthetic-anonymous');
const PUBLISHABLE_KEY = 'sb_publishable_SYNTHETIC_TEST_ONLY_not_a_real_key';
const USER_JWT = jwt('authenticated', 'synthetic-user-one');
const OTHER_USER_JWT = jwt('authenticated', 'synthetic-user-two');
const SENSITIVE_BODY = 'SYNTHETIC_PRIVATE_MESSAGE_DO_NOT_EXPOSE';
const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const CONTACT = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const THREAD = 'synthetic-thread';
const env = (serviceKey = SERVICE_SECRET, publicKey = PUBLISHABLE_KEY) => ({
  VERCEL_ENV: 'preview',
  CONVERSATIONS_DEV_ENABLED: 'true',
  CONVERSATIONS_SUPABASE_URL: 'https://rmximatxuaczhpqbcuho.supabase.co',
  CONVERSATIONS_PUBLIC_KEY: publicKey,
  CONVERSATIONS_SERVICE_KEY: serviceKey,
  CONVERSATIONS_BRIDGE_TOKEN: 'synthetic-bridge-token',
  CONVERSATIONS_TEST_ORG_ID: ORG,
  CONVERSATIONS_TEST_OWNER_ID: ACTOR,
  CONVERSATIONS_TEST_CONTACT_ID: CONTACT,
});
const profile = {id: ACTOR, organization_id: ORG, role: 'ADMIN'};
const conversation = {id: CONVERSATION, revision: 1};
const commandData = {conversation_id: CONVERSATION, revision: 1};
const calls = {
  authenticate: store => store.authenticate(USER_JWT),
  list: store => store.list(USER_JWT),
  detail: store => store.detail(USER_JWT, CONVERSATION),
  command: store => store.command(ORG, ACTOR, 'takeover', commandData),
  bridge: store => store.bridge(ORG, CONTACT, THREAD, MESSAGE),
};
const success = url => {
  const path = new URL(url).pathname;
  if (path === '/auth/v1/user') return {id: ACTOR};
  if (path === '/rest/v1/profiles') return [profile];
  if (path === '/rest/v1/commercial_conversations') return [conversation];
  if (path.startsWith('/rest/v1/rpc/')) return {conversation_id: CONVERSATION};
  return [];
};
const recorder = () => {
  const requests = [];
  return {
    requests,
    fetcher: async (url, options) => {
      requests.push({url, options});
      return Response.json(success(url));
    },
  };
};
const headersOf = request => new Headers(request.options.headers);
const assertPublic = (request, publicKey, token = USER_JWT) => {
  const headers = headersOf(request);
  assert.equal(headers.get('apikey'), publicKey);
  assert.equal(headers.get('authorization'), 'Bearer ' + token);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.stringify([...headers]).includes(SERVICE_SECRET), false);
  assert.equal(JSON.stringify([...headers]).includes(SERVICE_JWT), false);
};
const assertPrivileged = (request, serviceKey) => {
  const headers = headersOf(request);
  assert.equal(headers.get('apikey'), serviceKey);
  assert.equal(headers.get('authorization'), serviceKey === SERVICE_JWT ? 'Bearer ' + SERVICE_JWT : null);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.redirect, 'error');
};
const assertSafeError = (error, expected = 'storage_unavailable') => {
  assert.ok(error instanceof Error);
  assert.equal(error.message, expected);
  const serialized = [String(error), error.stack, JSON.stringify(error, Object.getOwnPropertyNames(error))].join('\n');
  for (const sensitive of [SERVICE_SECRET, SERVICE_JWT, USER_JWT, SENSITIVE_BODY]) {
    assert.equal(serialized.includes(sensitive), false, 'error must not expose transport inputs or upstream content');
  }
  assert.equal(error.cause, undefined, 'raw transport failures must not be retained as an observable cause');
  return true;
};

for (const [serviceName, serviceKey] of [['legacy service-role JWT', SERVICE_JWT], ['modern secret key', SERVICE_SECRET]]) {
  test(`privileged RPCs use the ${serviceName} in apikey with format-specific bearer`, async () => {
    const transport = recorder();
    const store = createStore(env(serviceKey), transport.fetcher);
    await calls.command(store);
    await calls.bridge(store);
    assert.equal(transport.requests.length, 2);
    const [command, bridge] = transport.requests;
    assert.equal(new URL(command.url).pathname, '/rest/v1/rpc/conversation_command');
    assert.equal(new URL(bridge.url).pathname, '/rest/v1/rpc/conversation_bridge');
    for (const request of transport.requests) assertPrivileged(request, serviceKey);
    assert.deepEqual(JSON.parse(command.options.body), {p_org: ORG, p_actor: ACTOR, p_action: 'takeover', p_data: commandData});
    assert.deepEqual(JSON.parse(bridge.options.body), {p_org: ORG, p_contact: CONTACT, p_thread: THREAD, p_ack: MESSAGE});
    await store.bridge(ORG, CONTACT, THREAD);
    assert.equal(JSON.parse(transport.requests[2].options.body).p_ack, null);
  });

  for (const [publicName, publicKey] of [['legacy anon JWT', ANON_JWT], ['publishable key', PUBLISHABLE_KEY]]) {
    test(`user reads retain ${publicName} and user JWT after ${serviceName} RPCs`, async () => {
      const transport = recorder();
      const store = createStore(env(serviceKey, publicKey), transport.fetcher);
      await calls.command(store);
      await calls.bridge(store);
      assert.deepEqual(await calls.authenticate(store), profile);
      assert.deepEqual(await calls.list(store), [conversation]);
      assert.deepEqual(await calls.detail(store), {conversation, messages: [], events: []});
      assert.equal(transport.requests.length, 8);
      for (const request of transport.requests.slice(0, 2)) assertPrivileged(request, serviceKey);
      for (const request of transport.requests.slice(2)) {
        assertPublic(request, publicKey);
        assert.equal(request.options.method, 'GET');
        assert.equal(request.options.body, undefined);
      }
    });
  }

  test(`concurrent user and ${serviceName} requests never share mutable headers`, async () => {
    const requests = [];
    const pending = [];
    let unblock;
    const gate = new Promise(resolve => { unblock = resolve; });
    const store = createStore(env(serviceKey), async (url, options) => {
      requests.push({url, options, initialHeaders: [...new Headers(options.headers)]});
      pending.push(new URL(url).pathname);
      await gate;
      return Response.json(success(url));
    });
    const results = Promise.all([
      store.command(ORG, ACTOR, 'takeover', commandData),
      store.authenticate(USER_JWT),
      store.list(OTHER_USER_JWT),
      store.detail(USER_JWT, CONVERSATION),
      store.bridge(ORG, CONTACT, THREAD),
    ]);
    assert.equal(pending.length, 7, 'all first-wave requests must be in flight together');
    unblock();
    await results;
    assert.equal(requests.length, 8);
    assert.equal(new Set(requests.map(request => request.options.headers)).size, requests.length, 'each request owns its headers');
    for (const request of requests) {
      assert.deepEqual([...headersOf(request)], request.initialHeaders, 'headers cannot mutate while a request is in flight');
      if (new URL(request.url).pathname.startsWith('/rest/v1/rpc/')) assertPrivileged(request, serviceKey);
      else assertPublic(request, PUBLISHABLE_KEY, request.url.includes('order=updated_at.desc') ? OTHER_USER_JWT : USER_JWT);
    }
  });
}

test('missing public/service keys fail closed before fetch', async t => {
  for (const missing of [undefined, '', '   ']) {
    for (const [key, methods] of [
      ['CONVERSATIONS_PUBLIC_KEY', ['authenticate', 'list', 'detail']],
      ['CONVERSATIONS_SERVICE_KEY', ['command', 'bridge']],
    ]) {
      await t.test(`${key}=${JSON.stringify(missing)}`, async () => {
        let fetchCount = 0;
        const store = createStore({...env(), [key]: missing}, async () => { fetchCount++; return Response.json([]); });
        for (const method of methods) await assert.rejects(async () => calls[method](store), assertSafeError);
        assert.equal(fetchCount, 0, 'missing credentials cannot issue a request');
      });
    }
  }
});

test('user reads do not depend on a service key and privileged RPCs do not depend on a public key', async () => {
  const userTransport = recorder();
  const userStore = createStore({...env(), CONVERSATIONS_SERVICE_KEY: undefined}, userTransport.fetcher);
  assert.deepEqual(await calls.authenticate(userStore), profile);
  assert.deepEqual(await calls.list(userStore), [conversation]);
  assert.deepEqual(await calls.detail(userStore), {conversation, messages: [], events: []});
  assert.equal(userTransport.requests.length, 6);
  for (const request of userTransport.requests) assertPublic(request, PUBLISHABLE_KEY);

  for (const serviceKey of [SERVICE_SECRET, SERVICE_JWT]) {
    const serviceTransport = recorder();
    const serviceStore = createStore({...env(serviceKey), CONVERSATIONS_PUBLIC_KEY: undefined}, serviceTransport.fetcher);
    await calls.command(serviceStore);
    await calls.bridge(serviceStore);
    assert.equal(serviceTransport.requests.length, 2);
    for (const request of serviceTransport.requests) assertPrivileged(request, serviceKey);
  }
});

test('missing or service/API credentials used as user bearer tokens fail closed', async t => {
  for (const [label, token] of [
    ['missing', undefined], ['empty', ''], ['whitespace', '   '],
    ['service-role JWT', SERVICE_JWT], ['secret key', SERVICE_SECRET], ['publishable key', PUBLISHABLE_KEY],
  ]) {
    await t.test(label, async () => {
      let fetchCount = 0;
      const store = createStore(env(), async () => { fetchCount++; return Response.json([]); });
      for (const request of [() => store.authenticate(token), () => store.list(token), () => store.detail(token, CONVERSATION)]) {
        await assert.rejects(request, error => assertSafeError(error, 'forbidden'));
      }
      assert.equal(fetchCount, 0, 'credentials must never be promoted into a user session');
    });
  }
});

test('malformed or wrong-role API key configuration fails closed before fetch', async t => {
  for (const [key, values, methods] of [
    ['CONVERSATIONS_PUBLIC_KEY', ['synthetic-invalid-key', USER_JWT, 'not.valid-jwt.synthetic'], ['authenticate', 'list', 'detail']],
    ['CONVERSATIONS_SERVICE_KEY', ['synthetic-invalid-key', USER_JWT, ANON_JWT, PUBLISHABLE_KEY], ['command', 'bridge']],
  ]) {
    for (const [index, value] of values.entries()) {
      await t.test(`${key}: invalid fixture ${index + 1}`, async () => {
        let fetchCount = 0;
        const store = createStore({...env(), [key]: value}, async () => { fetchCount++; return Response.json([]); });
        for (const method of methods) await assert.rejects(async () => calls[method](store), assertSafeError);
        assert.equal(fetchCount, 0);
      });
    }
  }
});

test('service credentials mistakenly configured as public keys never reach user routes', async t => {
  for (const publicKey of [SERVICE_SECRET, SERVICE_JWT]) {
    await t.test(publicKey === SERVICE_SECRET ? 'secret key' : 'service-role JWT', async () => {
      let fetchCount = 0;
      const store = createStore(env(SERVICE_SECRET, publicKey), async () => { fetchCount++; return Response.json([]); });
      for (const method of ['authenticate', 'list', 'detail']) await assert.rejects(async () => calls[method](store), assertSafeError);
      assert.equal(fetchCount, 0, 'public configuration must not elevate authenticated reads');
    });
  }
});

test('HTTP, network, and JSON failures are sanitized without logging', async t => {
  const logs = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, method, (...args) => logs.push(args));
  const sensitive = [SERVICE_SECRET, SERVICE_JWT, USER_JWT, SENSITIVE_BODY].join(' ');
  const failures = {
    'HTTP JSON error': async () => Response.json({message: sensitive, details: sensitive, hint: sensitive}, {status: 500}),
    'HTTP non-JSON error': async () => new Response(sensitive, {status: 502}),
    'HTTP null error payload': async () => Response.json(null, {status: 500}),
    'network exception': async () => { throw new Error(sensitive, {cause: sensitive}); },
    'network exception containing a domain code': async () => { throw new Error('forbidden ' + sensitive); },
    'network non-Error rejection': async () => { throw {message: sensitive, body: sensitive}; },
    'successful response with invalid JSON': async () => new Response(sensitive, {status: 200}),
    'successful response with JSON decoder rejection': async () => ({ok: true, json: async () => { throw new Error(sensitive); }}),
    'JSON decoder rejection containing a domain code': async () => ({ok: true, json: async () => { throw new Error('stale_revision ' + sensitive); }}),
    'error response with JSON decoder rejection': async () => ({ok: false, json: async () => { throw new Error(sensitive); }}),
  };
  for (const [failureName, fetcher] of Object.entries(failures)) {
    for (const method of Object.keys(calls)) {
      await t.test(`${method}: ${failureName}`, async () => {
        const store = createStore(env(), fetcher);
        await assert.rejects(async () => calls[method](store), assertSafeError);
      });
    }
  }
  assert.equal(logs.length, 0, 'store must not log credentials, upstream bodies, or errors');
});

const statuses = {forbidden: 403, not_found: 404, stale_revision: 409, event_conflict: 409, identity_conflict: 409, closure_blocked: 409, scope_mismatch: 400, takeover_required: 409};
test('allowlisted domain errors preserve their code without exposing upstream details', async t => {
  for (const [code, status] of Object.entries(statuses)) {
    await t.test(code, async () => {
      const store = createStore(env(), async () => Response.json({message: code, details: SENSITIVE_BODY, hint: SERVICE_SECRET}, {status: 400}));
      for (const method of Object.keys(calls)) await assert.rejects(async () => calls[method](store), error => assertSafeError(error, code));
      const response = errorResponse(new Error(code));
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {ok: false, error: code});
    });
  }
});

test('API and bridge HTTP failures never expose credentials or sensitive upstream bodies', async t => {
  for (const [failureName, failure] of [
    ['HTTP', async () => Response.json({message: SENSITIVE_BODY, details: SERVICE_SECRET}, {status: 500})],
    ['network', async () => { throw new Error(SERVICE_SECRET + SENSITIVE_BODY); }],
    ['JSON', async () => new Response(USER_JWT + SENSITIVE_BODY, {status: 200})],
  ]) {
    for (const route of ['list', 'detail', 'command', 'bridge']) {
      await t.test(`${route}: ${failureName}`, async () => {
        const config = env();
        const store = createStore(config, async (url, options) => {
          const path = new URL(url).pathname;
          if (path === '/auth/v1/user' || path === '/rest/v1/profiles') return Response.json(success(url));
          return failure(url, options);
        });
        const bridge = route === 'bridge';
        const handler = bridge ? createBridgeHandler({env: config, store}) : createHandler({env: config, store});
        const body = bridge ? {action: 'poll', data: {thread_id: THREAD}} : route === 'command' ? {action: 'takeover', data: commandData} : undefined;
        const response = await handler(new Request('http://localhost/api/conversations' + (route === 'detail' ? '?id=' + CONVERSATION : ''), {
          method: body ? 'POST' : 'GET',
          headers: {authorization: 'Bearer ' + (bridge ? config.CONVERSATIONS_BRIDGE_TOKEN : USER_JWT), 'content-type': 'application/json'},
          ...(body ? {body: JSON.stringify(body)} : {}),
        }));
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), {ok: false, error: 'storage_unavailable'});
      });
    }
  }
});
