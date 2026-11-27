import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DEFAULT_ORDER, PACKS, PORTALS } from '../public/catalog.mjs';
import { createAfalServer } from '../server/server.mjs';

const adminToken = 'mock-administrator-credential';
const order = {
  ...DEFAULT_ORDER,
  budget: 100,
  name: 'Example Person',
  contact: 'example@example.invalid',
  details: 'One-page site with services and examples.',
  consent: true,
  lang: 'en',
};

async function start(t, env = {}, fetcher) {
  const server = createAfalServer({ env: { AFAL_DB_PATH: ':memory:', ...env }, fetcher });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let stopped = false;
  const stop = () => {
    if (stopped) return Promise.resolve();
    stopped = true;
    return new Promise((resolve) => server.close(resolve));
  };
  t.after(stop);
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    stop,
    url: base,
    async call(path, { method, body, headers } = {}) {
      const response = await fetch(base + path, {
        method: method ?? (body ? 'POST' : 'GET'),
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      return { response, data };
    },
  };
}

const idempotency = () => ({ 'Idempotency-Key': randomUUID() });
const adminHeaders = { Authorization: 'Bearer ' + adminToken };

function temporaryDatabase(t) {
  const directory = mkdtempSync(join(tmpdir(), 'afal-api-'));
  const path = join(directory, 'orders.sqlite');
  t.after(() => {
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
    rmdirSync(directory);
  });
  return path;
}

test('creates and safely replays orders and preserves tracking state when upgrading a legacy database', async (t) => {
  const path = temporaryDatabase(t);
  const env = { AFAL_DB_PATH: path, AFAL_ADMIN_TOKEN: adminToken };
  const first = await start(t, env);
  const headers = idempotency();
  const created = await first.call('/api/orders', { body: order, headers });
  assert.equal(created.response.status, 201);
  assert.equal(created.response.headers.get('cache-control'), 'no-store');
  assert.match(created.data.code, /^AFAL-[A-F0-9]{32}$/);
  assert.equal(created.data.status, 'received');
  assert.equal(created.data.notification, 'unconfigured');
  const retry = await first.call('/api/orders', { body: order, headers });
  assert.equal(retry.response.status, 200);
  assert.deepEqual(retry.data, created.data);
  const conflict = await first.call('/api/orders', { body: { ...order, name: 'Another person' }, headers });
  assert.equal(conflict.response.status, 409);
  assert.deepEqual(conflict.data, { error: 'idempotency-conflict' });

  const code = created.data.code;
  const adminPath = '/api/admin/orders/' + code;
  const update = { method: 'PATCH', body: { status: 'in-progress' } };
  assert.equal((await first.call(adminPath, update)).response.status, 401);
  assert.equal((await first.call(adminPath, { ...update, headers: adminHeaders })).data.status, 'in-progress');
  await first.stop();

  const legacy = new DatabaseSync(path);
  try {
    legacy.exec('ALTER TABLE orders DROP COLUMN quoted_fraction');
    assert.equal(legacy.prepare('SELECT request_json FROM orders WHERE code = ?').get(code).request_json, JSON.stringify(order));
  } finally {
    legacy.close();
  }

  const second = await start(t, env);
  try {
    const tracked = await second.call('/api/status', { body: { code: code.toLowerCase() } });
    assert.equal(tracked.response.status, 200);
    assert.equal(tracked.data.status, 'in-progress');
    assert.deepEqual(Object.keys(tracked.data).sort(), ['createdAt', 'notification', 'status', 'updatedAt']);
    assert.equal((await second.call('/api/status', { body: { code: 'AFAL-' + 'F'.repeat(32) } })).response.status, 404);
    const migrated = await second.call('/api/orders', { body: { ...order, packId: '', membershipId: '' }, headers });
    assert.equal(migrated.response.status, 200);
    assert.equal(migrated.data.code, code);
  } finally {
    await second.stop();
  }
});

test('validates package selections and sends the durable, conditional membership quote to Telegram', async (t) => {
  const path = temporaryDatabase(t);
  const env = { AFAL_DB_PATH: path, AFAL_ADMIN_TOKEN: adminToken };
  const pack = PACKS.find(({ id }) => id === 'start-pack');
  const body = { ...order, ...pack.config, packId: pack.id, membershipId: 'plus', quotedAmount: 1 };
  const headers = idempotency();
  const first = await start(t, env);
  let code;
  try {
    for (const invalid of [{ packId: 'unknown' }, { membershipId: 'unknown' }, { pages: 2 }, { features: ['booking'] }]) {
      const rejected = await first.call('/api/orders', { body: { ...body, ...invalid }, headers });
      assert.equal(rejected.response.status, 400);
      assert.equal(rejected.data.error, 'invalid-order');
    }
    const created = await first.call('/api/orders', { body, headers });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.notification, 'unconfigured');
    code = created.data.code;
  } finally {
    await first.stop();
  }

  const notifications = [];
  const second = await start(t, { ...env, TELEGRAM_BOT_TOKEN: 'mock-token', TELEGRAM_CHAT_ID: '123' }, async (_, options) => {
    notifications.push(JSON.parse(options.body));
    return Response.json({ ok: true });
  });
  try {
    const replay = await second.call('/api/orders', {
      body: { ...body, features: [...body.features].reverse() }, headers,
    });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.data.code, code);
    const changed = await second.call('/api/orders', { body: { ...body, membershipId: 'pro' }, headers });
    assert.equal(changed.response.status, 409);

    const retried = await second.call('/api/admin/orders/' + code, {
      method: 'PATCH', headers: adminHeaders, body: { retryTelegram: true },
    });
    assert.equal(retried.data.notification, 'sent');
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].text, /Пакет: Start Pack \(−25%\)/);
    assert.match(notifications[0].text, /AFAL Plus \(−5%\).*вручну/);
    assert.match(notifications[0].text, /за умови підтвердження підписки: \$71,25/);
  } finally {
    await second.stop();
  }
});

test('accepts portal requests without a quote and notifies Telegram with a conditional quote when a market estimate is supplied', async (t) => {
  const portal = PORTALS.find(({ id }) => id === 'small-portal');
  const body = { ...order, serviceId: portal.id, pages: portal.pages, membershipId: 'portal' };
  const marketEstimate = 12345.67;
  const notifications = [];
  const env = { TELEGRAM_BOT_TOKEN: 'mock-token', TELEGRAM_CHAT_ID: '123' };
  const server = await start(t, env, async (_, options) => {
    notifications.push(JSON.parse(options.body).text);
    return Response.json({ ok: true });
  });

  const pending = await server.call('/api/orders', { body, headers: idempotency() });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.data.notification, 'sent');
  assert.ok(notifications[0].includes(portal.name.uk));
  assert.match(notifications[0], /AFAL Portal \(−50%\).*вручну/);
  assert.match(notifications[0], /потрібна ринкова оцінка/);
  assert.doesNotMatch(notifications[0], /:\s*0\s+грн/);

  const headers = idempotency();
  const priced = await server.call('/api/orders', { body: { ...body, marketEstimate }, headers });
  assert.equal(priced.response.status, 201);
  assert.equal(priced.data.notification, 'sent');
  assert.match(notifications[1], /Орієнтовна ринкова оцінка: 12\s345,67 грн.*перевірити/);
  assert.match(notifications[1], /за умови підтвердження підписки: 6\s172,84 грн/);
  const replay = await server.call('/api/orders', { body: { ...body, marketEstimate }, headers });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.data.code, priced.data.code);
  const changed = await server.call('/api/orders', { body: { ...body, marketEstimate: 12345.68 }, headers });
  assert.equal(changed.response.status, 409);

  const invalidOrders = [
    { ...body, membershipId: 'pro', marketEstimate },
    { ...body, membershipId: '' },
    { ...body, marketEstimate: '12345.67' },
    { ...body, marketEstimate: 12.111 },
    { ...body, packId: 'start-pack' },
    { ...order, membershipId: 'portal' },
    { ...order, marketEstimate },
  ];
  for (const invalid of invalidOrders) {
    const rejected = await server.call('/api/orders', { body: invalid, headers: idempotency() });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.data.error, 'invalid-order');
  }
  assert.equal(notifications.length, 2);
});

test('validates scope, body size, and configured browser origins', async (t) => {
  const server = await start(t);
  assert.deepEqual((await server.call('/api/health')).data, { telegram: false, ai: false });
  const page = await fetch(server.url + '/afal-site-market/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AFAL Site Market/);
  const prefix = '/afal-site-market/api/';
  const allowedOrigin = { Origin: 'https://afal708.github.io' };
  const preflight = await server.call(prefix + 'orders', { method: 'OPTIONS', headers: allowedOrigin });
  assert.equal(preflight.response.status, 204);
  assert.equal(preflight.response.headers.get('access-control-allow-origin'), allowedOrigin.Origin);
  assert.match(preflight.response.headers.get('access-control-allow-headers'), /idempotency-key/i);
  assert.equal((await server.call(prefix + 'health', { headers: { Origin: 'https://unapproved.example' } })).response.status, 403);
  assert.equal((await server.call('/server/.env.example')).response.status, 404);
  assert.equal((await server.call('/.git/config')).response.status, 404);
  assert.equal((await server.call('/public/%2e%2e/server/server.mjs')).response.status, 404);
  assert.equal((await server.call('/api/orders', { body: order })).data.error, 'invalid-idempotency-key');
  assert.equal((await server.call('/api/orders', { body: { ...order, consent: false }, headers: idempotency() })).data.error, 'invalid-order');
  assert.equal((await server.call('/api/orders', { body: { ...order, features: ['invalid'] }, headers: idempotency() })).response.status, 400);
  assert.equal((await server.call('/api/orders', { body: { ...order, details: 'x'.repeat(17000) }, headers: idempotency() })).response.status, 413);
});

test('persists a request when Telegram fails and allows authenticated retry', async (t) => {
  const notifications = [];
  const env = { AFAL_ADMIN_TOKEN: adminToken, TELEGRAM_BOT_TOKEN: 'mock-token', TELEGRAM_CHAT_ID: '123' };
  const server = await start(t, env, async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/botmock-token/sendMessage');
    const notification = JSON.parse(options.body);
    notifications.push(notification);
    if (notifications.length === 1) return Response.json({ ok: false }, { status: 503 });
    return Response.json({ ok: true });
  });
  const headers = idempotency();
  const created = await server.call('/api/orders', { body: order, headers });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.notification, 'pending');
  assert.ok(notifications[0].text.includes(created.data.code));
  assert.ok(notifications[0].text.includes(order.contact));
  assert.equal(notifications[0].chat_id, '123');
  await server.call('/api/orders', { body: order, headers });
  assert.equal(notifications.length, 1);
  const retried = await server.call('/api/admin/orders/' + created.data.code, {
    method: 'PATCH', headers: adminHeaders, body: { status: 'in-review', retryTelegram: true },
  });
  assert.equal(retried.data.notification, 'sent');
  assert.equal(retried.data.status, 'in-review');
  await server.call('/api/orders', { body: order, headers });
  assert.equal(notifications.length, 2);
});

test('sends one Telegram notification for concurrent retries using the same key', async (t) => {
  let calls = 0;
  const env = { TELEGRAM_BOT_TOKEN: 'mock-token', TELEGRAM_CHAT_ID: '123' };
  const server = await start(t, env, async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return Response.json({ ok: true });
  });
  const headers = idempotency();
  const responses = await Promise.all([
    server.call('/api/orders', { body: order, headers }),
    server.call('/api/orders', { body: order, headers }),
  ]);
  assert.deepEqual(responses.map(({ response }) => response.status).sort(), [200, 201]);
  assert.equal(responses[0].data.code, responses[1].data.code);
  assert.equal(calls, 1);
});

test('generates a localized guided brief and augments it when the AI provider responds', async (t) => {
  const payload = { message: 'I need a simple website with contact form. Please email me@example.invalid', lang: 'en' };
  const local = await start(t);
  const guided = await local.call('/api/consult', { body: payload });
  assert.equal(guided.data.mode, 'guided');
  assert.ok(guided.data.brief.length > 20);

  let providerInput;
  const hosted = await start(t, { OPENAI_API_KEY: 'mock-ai-credential' }, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    providerInput = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      items: ['Confirm the content owners.', 'Check the form on a phone.', 'Offer USD 30.'],
    }) }] }] });
  });
  const ai = await hosted.call('/api/consult', { body: payload });
  assert.ok(providerInput.input.includes('[…]'));
  assert.ok(!providerInput.input.includes('me@example.invalid'));
  assert.equal(providerInput.store, false);
  assert.equal(ai.data.mode, 'ai');
  assert.equal(ai.data.answer, guided.data.answer);
  assert.equal(ai.data.serviceId, guided.data.serviceId);
  assert.deepEqual(ai.data.suggestedConfig, guided.data.suggestedConfig);
  assert.match(ai.data.brief, /Confirm the content owners/);
  assert.doesNotMatch(ai.data.brief, /Offer USD 30/);
  const failedProvider = await start(t, { OPENAI_API_KEY: 'mock-ai-credential' }, async () => new Response(null, { status: 503 }));
  assert.deepEqual((await failedProvider.call('/api/consult', { body: payload })).data, guided.data);
});
