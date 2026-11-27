import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { estimate } from '../public/catalog.mjs';

export const statuses = ['received', 'in-review', 'in-progress', 'ready', 'completed', 'cancelled'];
export const codePattern = /^AFAL-[A-F0-9]{32}$/i;
const deliveryLease = 60_000;
const maxAttempts = 6;

function text(value, max, min = 0, multiline = false) {
  if (typeof value !== 'string') throw new RangeError('Invalid text');
  const cleaned = value.trim();
  const controls = multiline ? /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (cleaned.length < min || cleaned.length > max || controls.test(cleaned)) {
    throw new RangeError('Invalid text');
  }
  return cleaned;
}

export function normalizeOrder(raw) {
  if (raw.consent !== true || !['uk', 'en'].includes(raw.lang)) throw new RangeError('Invalid consent or language');

  const { serviceId, design, pages, features, packId, membershipId } = raw;
  estimate({ serviceId, design, pages, features, packId, membershipId });

  let budget = raw.budget ?? null;
  if (typeof budget === 'string') {
    budget = text(budget, 120) || null;
  } else if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100_000_000)) {
    throw new RangeError('Invalid budget');
  }

  return {
    serviceId, design, pages, features: [...features].sort(), budget,
    name: text(raw.name, 100, 1),
    contact: text(raw.contact, 160, 3),
    details: text(raw.details ?? '', 1600, 0, true),
    consent: true,
    lang: raw.lang,
    ...(packId ? { packId } : {}),
    ...(membershipId ? { membershipId } : {}),
  };
}

export function publicOrder(row, includeCode = false) {
  return {
    ...(includeCode ? { code: row.code } : {}),
    status: row.status,
    notification: row.notification,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function createOrderStore(databasePath) {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    if (!existsSync(databasePath)) {
      try {
        closeSync(openSync(databasePath, 'wx', 0o600));
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS orders (
      code TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      request_json TEXT NOT NULL,
      quoted_amount INTEGER NOT NULL,
      quoted_fraction INTEGER NOT NULL DEFAULT 0 CHECK (quoted_fraction BETWEEN 0 AND 99),
      quoted_currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      notification TEXT NOT NULL,
      notification_attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      claim_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS order_outbox ON orders (notification, next_attempt_at);
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(orders)').all().some(({ name }) => name === 'quoted_fraction')) {
      db.exec('ALTER TABLE orders ADD COLUMN quoted_fraction INTEGER NOT NULL DEFAULT 0 CHECK (quoted_fraction BETWEEN 0 AND 99)');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

  const insert = db.prepare(`
    INSERT INTO orders (
      code, idempotency_key, request_hash, request_json, quoted_amount, quoted_fraction, quoted_currency,
      notification, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `);
  const byKey = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?');
  const byCode = db.prepare('SELECT * FROM orders WHERE code = ?');
  const setStatus = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE code = ? AND status <> ?');
  const claim = db.prepare(`
    UPDATE orders
    SET notification = 'pending', notification_attempts = notification_attempts + 1, claim_until = ?
    WHERE code = ? AND claim_until <= ?
      AND ((notification = 'pending' AND notification_attempts < ? AND next_attempt_at <= ?)
           OR (? = 1 AND notification IN ('pending', 'unconfigured')))
    RETURNING *
  `);
  const settle = db.prepare(`
    UPDATE orders SET notification = ?, next_attempt_at = ?, claim_until = 0
    WHERE code = ? AND claim_until = ?
  `);
  const due = db.prepare(`
    SELECT code FROM orders
    WHERE notification = 'pending' AND next_attempt_at <= ? AND claim_until <= ? AND notification_attempts < ?
    ORDER BY next_attempt_at LIMIT 5
  `);

  return {
    create(order, key, telegram) {
      const serialized = JSON.stringify(order);
      const hash = createHash('sha256').update(serialized).digest('hex');
      const code = `AFAL-${randomBytes(16).toString('hex').toUpperCase()}`;
      const now = Date.now();
      const { amount, currency } = estimate(order);
      const quote = Math.round(amount * 100);
      const result = insert.run(
        code, key, hash, serialized, Math.floor(quote / 100), quote % 100, currency,
        telegram ? 'pending' : 'unconfigured', now, now, now,
      );
      const row = byKey.get(key);
      return { row, isNew: result.changes === 1, matches: row.request_hash === hash };
    },
    get: (code) => byCode.get(code),
    update: (code, status) => setStatus.run(status, Date.now(), code, status),
    claim(code, force) {
      const now = Date.now();
      return claim.get(now + deliveryLease, code, now, maxAttempts, now, force ? 1 : 0);
    },
    settle(row, sent) {
      const delay = Math.min(900_000, 30_000 * (2 ** Math.min(row.notification_attempts - 1, 5)));
      settle.run(sent ? 'sent' : 'pending', Date.now() + delay, row.code, row.claim_until);
    },
    due() {
      const now = Date.now();
      return due.all(now, now, maxAttempts);
    },
    close: () => db.close(),
  };
}
