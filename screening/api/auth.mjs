/**
 * Authentication and role-based access control middleware for the
 * Hawkeye-Sterling screening REST API.
 *
 * API keys are stored as SHA-256 hashes in .screening/api-keys.json.
 * Raw keys are never persisted. Each key carries a role that gates
 * access to endpoint groups:
 *
 *   viewer  — GET-only (sources, stats, verify, health)
 *   analyst — viewer + screen, batch
 *   mlro    — analyst + decision, refresh
 *   admin   — all endpoints + key management
 *
 * The health endpoint is always public (no auth required).
 *
 * For review by the MLRO.
 */

import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES = ['viewer', 'analyst', 'mlro', 'admin'];

/**
 * Role hierarchy: each role inherits everything the roles before it can do.
 * The numeric level is used for >= comparisons.
 */
const ROLE_LEVEL = { viewer: 0, analyst: 1, mlro: 2, admin: 3 };

/**
 * Minimum role required per route. Routes not listed here default to 'admin'.
 * The health endpoint is handled separately (always public).
 */
const ROUTE_ROLES = {
  'GET /api/v1/sources':   'viewer',
  'GET /api/v1/stats':     'viewer',
  'GET /api/v1/verify':    'viewer',
  'POST /api/v1/screen':   'analyst',
  'POST /api/v1/batch':    'analyst',
  'POST /api/v1/decision': 'mlro',
  'POST /api/v1/refresh':  'mlro',
  'POST /api/v1/keys':     'admin',
  'DELETE /api/v1/keys':    'admin',
  'GET /api/v1/keys':      'admin',
  'POST /api/v1/tenants':  'admin',
  'GET /api/v1/tenants':   'admin',
  'PATCH /api/v1/tenants': 'admin',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function generateKey() {
  return randomBytes(32).toString('hex');
}

function redactKey(hash) {
  return hash.slice(0, 8) + '...' + hash.slice(-8);
}

// ---------------------------------------------------------------------------
// Key store — flat JSON file
// ---------------------------------------------------------------------------

export class KeyStore {
  /**
   * @param {string} dataDir — base screening data directory (.screening)
   */
  constructor(dataDir) {
    this.filePath = join(dataDir, 'api-keys.json');
    /** @type {Map<string, object>} id -> key record */
    this.keys = new Map();
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    if (existsSync(this.filePath)) {
      const raw = await readFile(this.filePath, 'utf8');
      const arr = JSON.parse(raw);
      for (const rec of arr) {
        this.keys.set(rec.id, rec);
      }
    }
    this._loaded = true;
  }

  async _save() {
    const arr = Array.from(this.keys.values());
    await writeFile(this.filePath, JSON.stringify(arr, null, 2), 'utf8');
  }

  /**
   * Create a new API key. Returns the raw key (shown only once) and the
   * persisted record with the hashed key.
   *
   * @param {string} name  — human-readable label
   * @param {string} role  — one of ROLES
   * @param {string} [tenantId] — tenant the key belongs to (default: 'default')
   * @returns {{ rawKey: string, record: object }}
   */
  async create(name, role, tenantId = 'default') {
    if (!ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${ROLES.join(', ')}`);
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Key name is required');
    }

    const rawKey = generateKey();
    const hash = sha256(rawKey);
    const id = 'key_' + randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const record = {
      id,
      name: name.trim(),
      role,
      hash,
      tenantId,
      created: now,
      lastUsed: null,
      revoked: false,
    };

    this.keys.set(id, record);
    await this._save();
    return { rawKey, record };
  }

  /**
   * Revoke a key by id. Does not delete — marks as revoked for audit trail.
   */
  async revoke(id) {
    const rec = this.keys.get(id);
    if (!rec) throw new Error(`Key not found: ${id}`);
    if (rec.revoked) throw new Error(`Key already revoked: ${id}`);
    rec.revoked = true;
    rec.revokedAt = new Date().toISOString();
    await this._save();
    return rec;
  }

  /**
   * Look up a key record by raw API key value.
   * Returns null if not found or revoked.
   */
  findByRawKey(rawKey) {
    const hash = sha256(rawKey);
    for (const rec of this.keys.values()) {
      if (rec.hash === hash && !rec.revoked) return rec;
    }
    return null;
  }

  /**
   * Update lastUsed timestamp on a key.
   */
  async touch(id) {
    const rec = this.keys.get(id);
    if (rec) {
      rec.lastUsed = new Date().toISOString();
      // Fire-and-forget save; we do not block the request on this.
      this._save().catch(() => {});
    }
  }

  /**
   * List all keys with hashes redacted. For admin display only.
   */
  listRedacted() {
    const out = [];
    for (const rec of this.keys.values()) {
      out.push({
        id: rec.id,
        name: rec.name,
        role: rec.role,
        tenantId: rec.tenantId,
        created: rec.created,
        lastUsed: rec.lastUsed,
        revoked: rec.revoked,
        revokedAt: rec.revokedAt || null,
        hashPreview: redactKey(rec.hash),
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Per-key rate limiter (sliding window)
// ---------------------------------------------------------------------------

export class PerKeyRateLimiter {
  /**
   * @param {number} maxPerMinute — requests allowed per key per minute
   */
  constructor(maxPerMinute = 100) {
    this.maxPerMinute = maxPerMinute;
    this.windowMs = 60_000;
    /** @type {Map<string, number[]>} keyId -> sorted array of timestamps */
    this._windows = new Map();
  }

  /**
   * Check whether a request from the given key should be allowed.
   * Returns { allowed: boolean, remaining: number, resetMs: number }.
   */
  check(keyId) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this._windows.get(keyId);
    if (!timestamps) {
      timestamps = [];
      this._windows.set(keyId, timestamps);
    }

    // Prune expired entries.
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxPerMinute) {
      const resetMs = timestamps[0] + this.windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxPerMinute - timestamps.length,
      resetMs: timestamps[0] + this.windowMs - now,
    };
  }
}

// ---------------------------------------------------------------------------
// Auth middleware — call from request handler
// ---------------------------------------------------------------------------

/**
 * Authenticate and authorise a request.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {string} routeKey — e.g. "POST /api/v1/screen"
 * @param {KeyStore} keyStore
 * @param {PerKeyRateLimiter} rateLimiter
 * @returns {{ ok: boolean, status?: number, error?: string, key?: object }}
 */
export function authenticate(req, routeKey, keyStore, rateLimiter) {
  // Health endpoint is always public.
  if (routeKey === 'GET /api/v1/health') {
    return { ok: true, key: null };
  }

  // Extract bearer token.
  const authHeader = req.headers['authorization'] || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) {
    return { ok: false, status: 401, error: 'Missing or malformed Authorization header. Expected: Bearer <api-key>' };
  }

  const rawKey = match[1];
  const keyRecord = keyStore.findByRawKey(rawKey);
  if (!keyRecord) {
    return { ok: false, status: 401, error: 'Invalid API key' };
  }

  // Per-key rate limit.
  const rateResult = rateLimiter.check(keyRecord.id);
  if (!rateResult.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Per-key rate limit exceeded. Retry after ${Math.ceil(rateResult.resetMs / 1000)}s`,
      remaining: rateResult.remaining,
      resetMs: rateResult.resetMs,
    };
  }

  // Role check.
  const requiredRole = ROUTE_ROLES[routeKey] || 'admin';
  const requiredLevel = ROLE_LEVEL[requiredRole];
  const actualLevel = ROLE_LEVEL[keyRecord.role];

  if (actualLevel === undefined || actualLevel < requiredLevel) {
    return {
      ok: false,
      status: 403,
      error: `Insufficient permissions. Required role: ${requiredRole}, your role: ${keyRecord.role}`,
    };
  }

  // Touch last-used (fire-and-forget).
  keyStore.touch(keyRecord.id);

  return { ok: true, key: keyRecord };
}

export { ROLES, ROLE_LEVEL, ROUTE_ROLES };
