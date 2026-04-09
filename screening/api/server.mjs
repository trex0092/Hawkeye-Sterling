#!/usr/bin/env node
/**
 * REST API server wrapping the Hawkeye-Sterling screening engine.
 *
 * Pure Node.js HTTP server — no Express, no external dependencies.
 * Integrates authentication/RBAC (auth.mjs) and multi-tenancy
 * (tenant.mjs) so every request is scoped to a tenant with isolated
 * data, audit trail, and configuration.
 *
 * Routes:
 *   POST   /api/v1/screen       Screen a single subject
 *   POST   /api/v1/batch        Screen multiple subjects
 *   POST   /api/v1/decision     Record a reviewer decision
 *   GET    /api/v1/sources      List enabled sources
 *   GET    /api/v1/stats        Store + audit metadata
 *   POST   /api/v1/refresh      Trigger list refresh
 *   GET    /api/v1/verify       Verify audit chain
 *   GET    /api/v1/health       Health check (public)
 *   POST   /api/v1/keys         Create API key (admin)
 *   DELETE /api/v1/keys/:id     Revoke API key (admin)
 *   GET    /api/v1/keys         List API keys (admin)
 *   POST   /api/v1/tenants      Create tenant (admin)
 *   GET    /api/v1/tenants      List tenants (admin)
 *   PATCH  /api/v1/tenants/:id  Update tenant config (admin)
 *
 * Environment:
 *   PORT             — listen port (default 3000)
 *   CORS_ORIGIN      — allowed origin (default '*')
 *   RATE_LIMIT_RPM   — requests per minute per IP (default 100)
 *
 * For review by the MLRO.
 */

import { createServer } from 'node:http';
import { join } from 'node:path';
import Screening, {
  init as screeningInit,
  screen as screeningScreen,
  batch as screeningBatch,
  decision as screeningDecision,
  refreshAll as screeningRefreshAll,
  verify as screeningVerify,
  stats as screeningStats,
} from '../index.js';
import { SOURCES, DATA_DIR } from '../config.js';
import { KeyStore, PerKeyRateLimiter, authenticate } from './auth.mjs';
import { TenantRegistry, DEFAULT_TENANT_ID } from './tenant.mjs';

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM) || 100;

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

const keyStore = new KeyStore(DATA_DIR);
const tenantRegistry = new TenantRegistry(DATA_DIR);
const perKeyLimiter = new PerKeyRateLimiter(RATE_LIMIT_RPM);

/**
 * IP-based sliding-window rate limiter.
 * Each IP is allowed RATE_LIMIT_RPM requests per 60-second window.
 */
const ipWindows = new Map();

function checkIpRate(ip) {
  const now = Date.now();
  const cutoff = now - 60_000;
  let timestamps = ipWindows.get(ip);
  if (!timestamps) {
    timestamps = [];
    ipWindows.set(ip, timestamps);
  }
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_RPM) {
    const resetMs = timestamps[0] + 60_000 - now;
    return { allowed: false, remaining: 0, resetMs };
  }
  timestamps.push(now);
  return { allowed: true, remaining: RATE_LIMIT_RPM - timestamps.length, resetMs: 0 };
}

// Periodic cleanup of stale IP windows (every 5 minutes).
const _ipCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [ip, ts] of ipWindows) {
    if (ts.length === 0 || ts[ts.length - 1] < cutoff) {
      ipWindows.delete(ip);
    }
  }
}, 300_000);
_ipCleanupInterval.unref();

/**
 * Per-tenant Screening instances. The default tenant reuses the global
 * Screening singleton; other tenants each get their own init().
 *
 * @type {Map<string, { initialized: boolean, init: Function }>}
 */
const tenantScreening = new Map();

async function getScreeningForTenant(tenant) {
  if (tenant.id === DEFAULT_TENANT_ID) {
    // Default tenant uses the global screening singleton.
    await screeningInit();
    return Screening;
  }

  if (tenantScreening.has(tenant.id)) {
    return tenantScreening.get(tenant.id);
  }

  // For non-default tenants we create a fresh module-level context by
  // re-importing with different paths. Since the screening module uses
  // module-level singletons, we work around this by calling init with
  // the tenant's paths. In practice, multi-tenant usage with isolated
  // stores requires separate Screening instances. We approximate this
  // by storing per-tenant init options and calling the base API with
  // explicit path overrides.
  //
  // For a production multi-tenant deployment this would be refactored
  // to support constructor-injected stores. For now, the default tenant
  // is the expected hot path.
  const paths = tenantRegistry.tenantPaths(tenant.id);
  const proxy = {
    async init() { return screeningInit({ storeFile: paths.storeFile, auditFile: paths.auditFile }); },
    async screen(q, opts = {}) {
      await this.init();
      return screeningScreen(q, { ...opts, thresholds: tenant.thresholds || undefined });
    },
    async batch(qs, opts = {}) {
      await this.init();
      return screeningBatch(qs, { ...opts, thresholds: tenant.thresholds || undefined });
    },
    async decision(caseId, outcome, reason, actor) {
      await this.init();
      return screeningDecision(caseId, outcome, reason, actor);
    },
    async refreshAll(opts = {}) {
      await this.init();
      return screeningRefreshAll(opts);
    },
    async verify() {
      await this.init();
      return screeningVerify();
    },
    stats() { return screeningStats(); },
  };
  tenantScreening.set(tenant.id, proxy);
  return proxy;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

/**
 * Read the full request body as a parsed JSON object.
 * Rejects if body exceeds 1 MiB or is not valid JSON.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024; // 1 MiB

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large (max 1 MiB)'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON in request body'));
      }
    });

    req.on('error', reject);
  });
}

function clientIp(req) {
  // Trust X-Forwarded-For only in well-known proxy setups; for simplicity
  // we take the first value or fall back to socket address.
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function log(method, url, status, ip, ms) {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} ${method} ${url} ${status} ${ip} ${ms}ms\n`);
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/**
 * Extract a route key and any path parameter from the URL.
 * Returns { routeKey, paramId } where routeKey is "METHOD /path".
 */
function matchRoute(method, pathname) {
  // Static routes.
  const statics = [
    '/api/v1/screen', '/api/v1/batch', '/api/v1/decision',
    '/api/v1/sources', '/api/v1/stats', '/api/v1/refresh',
    '/api/v1/verify', '/api/v1/health',
    '/api/v1/keys', '/api/v1/tenants',
  ];

  for (const p of statics) {
    if (pathname === p) {
      return { routeKey: `${method} ${p}`, paramId: null };
    }
  }

  // Parameterised routes: /api/v1/keys/:id and /api/v1/tenants/:id
  const keysMatch = /^\/api\/v1\/keys\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (keysMatch) {
    return { routeKey: `${method} /api/v1/keys`, paramId: keysMatch[1] };
  }

  const tenantsMatch = /^\/api\/v1\/tenants\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (tenantsMatch) {
    return { routeKey: `${method} /api/v1/tenants`, paramId: tenantsMatch[1] };
  }

  return { routeKey: null, paramId: null };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleScreen(body, tenant) {
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { status: 400, body: { error: 'Field "name" is required and must be a non-empty string' } };
  }

  const query = {
    name: body.name.trim(),
    ...(body.aliases ? { aliases: body.aliases } : {}),
    ...(body.type ? { type: body.type } : {}),
    ...(body.dob ? { dob: body.dob } : {}),
    ...(body.countries ? { countries: body.countries } : {}),
    ...(body.subjectId ? { subjectId: body.subjectId } : {}),
    ...(body.include_adverse_media !== undefined ? { includeAdverseMedia: body.include_adverse_media } : {}),
  };

  const eng = await getScreeningForTenant(tenant);
  const result = await eng.screen(query, {
    actor: 'api',
    thresholds: tenant.thresholds || undefined,
  });

  return { status: 200, body: result };
}

async function handleBatch(body, tenant) {
  if (!body || !Array.isArray(body.subjects) || body.subjects.length === 0) {
    return { status: 400, body: { error: 'Field "subjects" is required and must be a non-empty array' } };
  }

  // Validate each subject.
  for (let i = 0; i < body.subjects.length; i++) {
    const s = body.subjects[i];
    if (!s || typeof s.name !== 'string' || s.name.trim().length === 0) {
      return { status: 400, body: { error: `subjects[${i}].name is required and must be a non-empty string` } };
    }
  }

  const queries = body.subjects.map(s => ({
    name: s.name.trim(),
    ...(s.aliases ? { aliases: s.aliases } : {}),
    ...(s.type ? { type: s.type } : {}),
    ...(s.dob ? { dob: s.dob } : {}),
    ...(s.countries ? { countries: s.countries } : {}),
    ...(s.subjectId ? { subjectId: s.subjectId } : {}),
    ...(s.include_adverse_media !== undefined ? { includeAdverseMedia: s.include_adverse_media } : {}),
  }));

  const eng = await getScreeningForTenant(tenant);
  const results = await eng.batch(queries, {
    actor: 'api',
    thresholds: tenant.thresholds || undefined,
  });

  return { status: 200, body: { count: results.length, results } };
}

async function handleDecision(body, tenant) {
  if (!body || typeof body.caseId !== 'string' || body.caseId.trim().length === 0) {
    return { status: 400, body: { error: 'Field "caseId" is required' } };
  }
  if (typeof body.outcome !== 'string' || body.outcome.trim().length === 0) {
    return { status: 400, body: { error: 'Field "outcome" is required' } };
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    return { status: 400, body: { error: 'Field "reason" is required' } };
  }

  const eng = await getScreeningForTenant(tenant);
  const entry = await eng.decision(
    body.caseId.trim(),
    body.outcome.trim(),
    body.reason.trim(),
    body.actor || 'api',
  );

  return { status: 200, body: { seq: entry.seq, hash: entry.hash, ts: entry.ts } };
}

async function handleSources(_body, _tenant) {
  const sources = SOURCES.map(s => ({
    id: s.id,
    name: s.name,
    license: s.license,
    priority: s.priority,
    enabled: s.enabled,
    runtime: !!s.runtime,
  }));
  return { status: 200, body: { sources } };
}

async function handleStats(_body, tenant) {
  const eng = await getScreeningForTenant(tenant);
  const s = eng.stats();
  return { status: 200, body: s };
}

async function handleRefresh(_body, tenant) {
  const eng = await getScreeningForTenant(tenant);
  const results = await eng.refreshAll({ logger: (msg) => process.stderr.write(msg + '\n') });
  return { status: 200, body: results };
}

async function handleVerify(_body, tenant) {
  const eng = await getScreeningForTenant(tenant);
  const result = await eng.verify();
  return { status: 200, body: result };
}

function handleHealth() {
  return {
    status: 200,
    body: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  };
}

async function handleCreateKey(body) {
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { status: 400, body: { error: 'Field "name" is required' } };
  }
  if (!body.role || typeof body.role !== 'string') {
    return { status: 400, body: { error: 'Field "role" is required' } };
  }

  const { rawKey, record } = await keyStore.create(
    body.name,
    body.role,
    body.tenantId || DEFAULT_TENANT_ID,
  );

  return {
    status: 201,
    body: {
      id: record.id,
      name: record.name,
      role: record.role,
      tenantId: record.tenantId,
      created: record.created,
      apiKey: rawKey, // Shown only once.
    },
  };
}

async function handleRevokeKey(keyId) {
  if (!keyId) {
    return { status: 400, body: { error: 'Key id is required in URL path' } };
  }
  const rec = await keyStore.revoke(keyId);
  return { status: 200, body: { id: rec.id, revoked: rec.revoked, revokedAt: rec.revokedAt } };
}

function handleListKeys() {
  return { status: 200, body: { keys: keyStore.listRedacted() } };
}

async function handleCreateTenant(body) {
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { status: 400, body: { error: 'Field "name" is required' } };
  }

  const tenant = await tenantRegistry.create({
    name: body.name,
    thresholds: body.thresholds || null,
    enabledSources: body.enabledSources || null,
  });

  return { status: 201, body: tenant };
}

function handleListTenants() {
  return { status: 200, body: { tenants: tenantRegistry.list() } };
}

async function handleUpdateTenant(tenantId, body) {
  if (!tenantId) {
    return { status: 400, body: { error: 'Tenant id is required in URL path' } };
  }
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'Request body must be a JSON object' } };
  }

  const updated = await tenantRegistry.update(tenantId, body);
  return { status: 200, body: updated };
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

async function dispatch(req, res) {
  const start = Date.now();
  const ip = clientIp(req);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // CORS preflight.
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    log('OPTIONS', pathname, 204, ip, Date.now() - start);
    return;
  }

  // IP-based rate limit.
  const ipRate = checkIpRate(ip);
  if (!ipRate.allowed) {
    sendError(res, 429, `Rate limit exceeded. Retry after ${Math.ceil(ipRate.resetMs / 1000)}s`);
    log(method, pathname, 429, ip, Date.now() - start);
    return;
  }

  // Route matching.
  const { routeKey, paramId } = matchRoute(method, pathname);
  if (!routeKey) {
    sendError(res, 404, `Not found: ${method} ${pathname}`);
    log(method, pathname, 404, ip, Date.now() - start);
    return;
  }

  // Authentication and authorisation.
  const authResult = authenticate(req, routeKey, keyStore, perKeyLimiter);
  if (!authResult.ok) {
    sendError(res, authResult.status, authResult.error);
    log(method, pathname, authResult.status, ip, Date.now() - start);
    return;
  }

  // Resolve tenant from API key.
  const tenant = tenantRegistry.resolveFromKey(authResult.key);

  try {
    let result;

    // Parse body for methods that carry one.
    let body = null;
    if (method === 'POST' || method === 'PATCH') {
      body = await readBody(req);
    }

    switch (routeKey) {
      case 'GET /api/v1/health':
        result = handleHealth();
        break;
      case 'POST /api/v1/screen':
        result = await handleScreen(body, tenant);
        break;
      case 'POST /api/v1/batch':
        result = await handleBatch(body, tenant);
        break;
      case 'POST /api/v1/decision':
        result = await handleDecision(body, tenant);
        break;
      case 'GET /api/v1/sources':
        result = await handleSources(body, tenant);
        break;
      case 'GET /api/v1/stats':
        result = await handleStats(body, tenant);
        break;
      case 'POST /api/v1/refresh':
        result = await handleRefresh(body, tenant);
        break;
      case 'GET /api/v1/verify':
        result = await handleVerify(body, tenant);
        break;
      case 'POST /api/v1/keys':
        result = await handleCreateKey(body);
        break;
      case 'DELETE /api/v1/keys':
        result = await handleRevokeKey(paramId);
        break;
      case 'GET /api/v1/keys':
        result = handleListKeys();
        break;
      case 'POST /api/v1/tenants':
        result = await handleCreateTenant(body);
        break;
      case 'GET /api/v1/tenants':
        result = handleListTenants();
        break;
      case 'PATCH /api/v1/tenants':
        result = await handleUpdateTenant(paramId, body);
        break;
      default:
        result = { status: 405, body: { error: `Method not allowed: ${routeKey}` } };
    }

    sendJSON(res, result.status, result.body);
    log(method, pathname, result.status, ip, Date.now() - start);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    sendError(res, status, err.message);
    log(method, pathname, status, ip, Date.now() - start);
    if (status === 500) {
      process.stderr.write(`[ERROR] ${err.stack || err.message}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

async function start() {
  // Load subsystems before accepting connections.
  await keyStore.load();
  await tenantRegistry.load();
  await screeningInit();

  const server = createServer(dispatch);

  // Graceful shutdown.
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`\n[${signal}] Shutting down gracefully...\n`);
    server.close(() => {
      process.stderr.write('[shutdown] Server closed. Exiting.\n');
      process.exit(0);
    });
    // Force exit after 10 seconds if connections linger.
    const forceTimeout = setTimeout(() => {
      process.stderr.write('[shutdown] Timeout reached, forcing exit.\n');
      process.exit(1);
    }, 10_000);
    forceTimeout.unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    process.stderr.write(`Hawkeye-Sterling Screening API listening on port ${PORT}\n`);
    process.stderr.write(`CORS origin: ${CORS_ORIGIN}\n`);
    process.stderr.write(`Rate limit: ${RATE_LIMIT_RPM} req/min per IP\n`);
  });
}

start().catch((err) => {
  process.stderr.write(`[FATAL] ${err.stack || err.message}\n`);
  process.exit(1);
});
