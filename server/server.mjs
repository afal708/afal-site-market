import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CONSULT_LENGTH } from '../public/catalog.mjs';
import { createConsultant, createTelegram } from './integrations.mjs';
import { codePattern, createOrderStore, normalizeOrder, publicOrder, statuses } from './orders.mjs';

const root = resolve(import.meta.dirname, '..');
const projectPrefix = '/afal-site-market/';
const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const bodyLimit = 16_384;
const rootFiles = new Set(['.nojekyll', 'index.html', 'en/index.html', 'privacy/index.html', 'en/privacy/index.html',
  'robots.txt', 'sitemap.xml', '404.html', 'google72d43adaa35847f5.html', 'google72d43adaa35847f5.html.txt']);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.css', 'text/css; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'], ['.xml', 'application/xml; charset=utf-8'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

class ApiError extends Error {
  constructor(status, slug, headers) {
    super(slug);
    this.status = status;
    this.headers = headers;
  }
}

function configuration(env, fetcher) {
  const allowedOrigins = new Set(['https://afal708.github.io']);
  for (const origin of (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('ALLOWED_ORIGINS accepts only complete origins without paths or trailing slashes');
    }
    allowedOrigins.add(url.origin);
  }
  const adminToken = env.AFAL_ADMIN_TOKEN?.trim();
  if (adminToken && adminToken.length < 24) throw new Error('AFAL_ADMIN_TOKEN must contain at least 24 characters');
  const proxyHops = Number(env.AFAL_TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('Invalid AFAL_TRUST_PROXY_HOPS');

  const databasePath = env.AFAL_DB_PATH?.trim() || resolve(root, '.local', 'orders.sqlite');
  return {
    allowedOrigins, adminToken, proxyHops, databasePath, fetcher,
    serveStatic: env.AFAL_SERVE_STATIC !== 'false',
    telegramToken: env.TELEGRAM_BOT_TOKEN?.trim(),
    telegramChatId: env.TELEGRAM_CHAT_ID?.trim(),
    openAiKey: env.OPENAI_API_KEY?.trim(),
    openAiModel: env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
  };
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    request.resume();
    throw new ApiError(415, 'unsupported-media-type');
  }
  if (Number(request.headers['content-length']) > bodyLimit) {
    request.resume();
    throw new ApiError(413, 'body-too-large');
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > bodyLimit) {
      request.resume();
      throw new ApiError(413, 'body-too-large');
    }
    chunks.push(chunk);
  }

  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError();
    return body;
  } catch {
    throw new ApiError(400, 'invalid-json');
  }
}

function allowOrigin(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  response.setHeader('Vary', 'Origin');
  if (!origin) return;

  try {
    const url = new URL(origin);
    const sameOrigin = ['http:', 'https:'].includes(url.protocol) &&
      url.origin === origin && url.host === request.headers.host;
    if (allowedOrigins.has(origin) || sameOrigin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      return;
    }
  } catch {
    // A malformed Origin is rejected in the same way as an unapproved origin.
  }
  request.resume();
  throw new ApiError(403, 'forbidden-origin');
}

function clientAddress(request, proxyHops) {
  if (proxyHops) {
    const chain = request.headers['x-forwarded-for']?.split(',').map((part) => part.trim()) ?? [];
    const forwarded = chain.at(-proxyHops);
    if (forwarded && isIP(forwarded)) return forwarded;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function createRateLimiter() {
  const windows = new Map();
  let nextPrune = 0;
  return (key, limit, duration) => {
    const now = Date.now();
    if (now >= nextPrune) {
      for (const [entry, window] of windows) {
        if (window.until <= now) windows.delete(entry);
      }
      nextPrune = now + 60_000;
    }
    const previous = windows.get(key);
    const window = previous?.until > now ? previous : { until: now + duration, uses: 0 };
    if (window.uses >= limit || (!previous && windows.size >= 20_000)) {
      throw new ApiError(429, 'rate-limited', { 'Retry-After': Math.ceil((window.until - now) / 1000) });
    }
    window.uses += 1;
    windows.set(key, window);
  };
}

function getCode(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!codePattern.test(code)) throw new ApiError(400, 'invalid-code');
  return code.toUpperCase();
}

function authorizeAdmin(request, token) {
  if (!token) throw new ApiError(404, 'not-found');
  const supplied = request.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const hash = (value) => createHash('sha256').update(value).digest();
  if (!supplied || !timingSafeEqual(hash(supplied), hash(token))) {
    throw new ApiError(401, 'unauthorized', { 'WWW-Authenticate': 'Bearer' });
  }
}

function servePage(request, response, path) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  let file = path.slice(1);
  if (!file || file.endsWith('/')) file += 'index.html';
  if (file === 'en') file = 'en/index.html';
  const type = contentTypes.get(extname(file)) ?? 'application/octet-stream';
  const publicAsset = file.startsWith('public/') && /^[\w./-]+$/.test(file) &&
    file.split('/').every((part) => part && !part.startsWith('.')) && contentTypes.has(extname(file));
  if (!rootFiles.has(file) && !publicAsset) return false;

  const target = resolve(root, file);
  const fromRoot = relative(root, target);
  if (isAbsolute(fromRoot) || fromRoot.startsWith('..')) return false;
  let metadata;
  try {
    if (realpathSync(target) !== target) return false;
    metadata = statSync(target);
    if (!metadata.isFile()) return false;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }

  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': metadata.size,
    'Cache-Control': publicAsset && !/\.(?:m?js|css|json)$/.test(file) ? 'public, max-age=3600' : 'no-cache',
  });
  if (request.method === 'HEAD') {
    response.end();
  } else {
    const stream = createReadStream(target);
    stream.once('error', () => response.destroy());
    response.once('close', () => stream.destroy());
    stream.pipe(response);
  }
  return true;
}

export function createAfalServer({ env = process.env, fetcher = globalThis.fetch } = {}) {
  const config = configuration(env, fetcher);
  const orders = createOrderStore(config.databasePath);
  const sendTelegram = createTelegram(config);
  const getConsultation = createConsultant(config);
  const limit = createRateLimiter();
  const jobs = new Set();

  function trackJob(promise) {
    jobs.add(promise);
    promise.then(() => jobs.delete(promise), () => jobs.delete(promise));
    return promise;
  }

  async function deliver(code, force = false) {
    if (!sendTelegram) return;
    const claim = orders.claim(code, force);
    if (claim) orders.settle(claim, await sendTelegram(claim));
  }

  const outbox = sendTelegram ? setInterval(() => {
    try {
      for (const { code } of orders.due()) {
        trackJob(deliver(code).catch(() => console.error('AFAL status notification could not be processed.')));
      }
    } catch {
      console.error('AFAL notification queue could not be read.');
    }
  }, 15_000).unref() : null;

  function consume(request, key, amount, duration, globalAmount) {
    limit(key + ':' + clientAddress(request, config.proxyHops), amount, duration);
    if (globalAmount) limit(key, globalAmount, duration);
  }

  async function api(request, response, path) {
    allowOrigin(request, response, config.allowedOrigins);
    const method = request.method;
    if (method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      });
      response.end();
      return;
    }

    if (method === 'GET' && path === '/api/health') {
      sendJson(response, 200, { telegram: Boolean(sendTelegram), ai: Boolean(config.openAiKey) });
      return;
    }

    if (method === 'POST' && path === '/api/orders') {
      consume(request, 'orders', 15, 10 * 60_000, 250);
      const key = request.headers['idempotency-key'];
      if (!keyPattern.test(key ?? '')) {
        request.resume();
        throw new ApiError(400, 'invalid-idempotency-key');
      }
      const raw = await readJson(request);
      let order;
      try {
        order = normalizeOrder(raw);
      } catch (error) {
        if (error instanceof RangeError) throw new ApiError(400, 'invalid-order');
        throw error;
      }

      const { row, isNew, matches } = orders.create(order, key.toLowerCase(), Boolean(sendTelegram));
      if (!matches) throw new ApiError(409, 'idempotency-conflict');
      if (row.notification === 'pending') await deliver(row.code);
      sendJson(response, isNew ? 201 : 200, publicOrder(orders.get(row.code), true));
      return;
    }

    if (method === 'POST' && path === '/api/status') {
      consume(request, 'status', 45, 60_000, 1200);
      const { code } = await readJson(request);
      const row = orders.get(getCode(code));
      if (!row) throw new ApiError(404, 'not-found');
      sendJson(response, 200, publicOrder(row));
      return;
    }

    if (method === 'POST' && path === '/api/consult') {
      consume(request, 'consult', config.openAiKey ? 10 : 30, 60_000, config.openAiKey ? 60 : 300);
      const { message, lang } = await readJson(request);
      const cleaned = typeof message === 'string' ? message.trim() : '';
      if (cleaned.length < 3 || cleaned.length > MAX_CONSULT_LENGTH || !['uk', 'en'].includes(lang)) {
        throw new ApiError(400, 'invalid-message');
      }
      sendJson(response, 200, await getConsultation(cleaned, lang));
      return;
    }

    if (method === 'PATCH' && path.startsWith('/api/admin/orders/')) {
      consume(request, 'admin', 30, 60_000);
      authorizeAdmin(request, config.adminToken);
      const code = getCode(path.slice('/api/admin/orders/'.length));
      const { status, retryTelegram } = await readJson(request);
      if ((status === undefined && retryTelegram !== true) ||
          (status !== undefined && !statuses.includes(status)) ||
          (retryTelegram !== undefined && typeof retryTelegram !== 'boolean')) {
        throw new ApiError(400, 'invalid-status');
      }
      if (!orders.get(code)) throw new ApiError(404, 'not-found');
      if (status !== undefined) orders.update(code, status);
      if (retryTelegram) await deliver(code, true);
      sendJson(response, 200, publicOrder(orders.get(code), true));
      return;
    }

    request.resume();
    throw new ApiError(404, 'not-found');
  }

  async function respond(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      let path = new URL(request.url, 'http://localhost').pathname;
      if (path === projectPrefix.slice(0, -1)) {
        response.writeHead(308, { Location: projectPrefix });
        response.end();
        return;
      }
      if (path.startsWith(projectPrefix)) path = path.slice(projectPrefix.length - 1);
      if (path.startsWith('/api/')) {
        await api(request, response, path);
        return;
      }
      if (config.serveStatic && servePage(request, response, path)) return;
      throw new ApiError(404, 'not-found');
    } catch (error) {
      request.resume();
      if (response.headersSent || response.destroyed) return;
      if (error instanceof ApiError) {
        sendJson(response, error.status, { error: error.message }, error.headers);
      } else {
        console.error('AFAL request could not be completed.');
        sendJson(response, 500, { error: 'server-error' });
      }
    }
  }

  const server = createServer({
    headersTimeout: 8_000, requestTimeout: 15_000, connectionsCheckingInterval: 2_000, maxHeaderSize: 8192,
  }, (request, response) => trackJob(respond(request, response)));
  server.once('close', () => {
    clearInterval(outbox);
    Promise.allSettled([...jobs]).then(() => orders.close());
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid PORT value');
  const server = createAfalServer();
  server.listen(port, host, () => console.log('AFAL listening on http://' + host + ':' + port));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
}
