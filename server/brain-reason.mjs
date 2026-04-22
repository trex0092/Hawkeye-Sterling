#!/usr/bin/env node
// Hawkeye Sterling — minimal Node HTTP server for /api/brain-reason.
// Wraps src/integrations/mlroAdvisor.invokeMlroAdvisor so the reference
// public/deep-reasoning.js IIFE + the v2 advisor card have a backend to
// POST to. No auth, no HTTPS, no rate limiting — development use only.
//
// Env:
//   ANTHROPIC_API_KEY        required
//   PORT                     default 8081
//   EXECUTOR_MODEL           default claude-sonnet-4-6
//   ADVISOR_MODEL            default claude-opus-4-7
//
// Start with:
//   npm run build && node server/brain-reason.mjs
//
// POST /api/brain-reason
//   body: { question: string, mode?: string, caseContext?: {...}, audience?: string }
//   200 → MlroAdvisorResult

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { invokeMlroAdvisor } from '../dist/src/integrations/mlroAdvisor.js';
import { AuditChain } from '../dist/src/brain/audit-chain.js';

const PORT = Number(process.env.PORT ?? 8081);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const EXEC = process.env.EXECUTOR_MODEL ?? 'claude-sonnet-4-6';
const ADV = process.env.ADVISOR_MODEL ?? 'claude-opus-4-7';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 256 * 1024); // 256 KiB
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS ?? 60_000);
const RATE_MAX = Number(process.env.RATE_MAX ?? 30);
const AUDIT_DIR = process.env.AUDIT_DIR ?? path.join(process.cwd(), 'server', 'audit');

if (!API_KEY) {
  console.error('[brain-reason] ANTHROPIC_API_KEY not set. The server will run but every request will fail.');
}

try { fs.mkdirSync(AUDIT_DIR, { recursive: true }); } catch (_) { /* ignore */ }
const AUDIT_LOG = path.join(AUDIT_DIR, 'audit.log.jsonl');

const audit = new AuditChain();

// Structured logger — JSON lines to stdout for log ingestion.
function log(level, event, fields = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  process.stdout.write(line + '\n');
}

// Durable write of each audit entry — append-only JSONL.
function persistAudit(entry) {
  try { fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n'); }
  catch (err) { log('warn', 'audit.persist.failed', { err: err.message }); }
}

function appendAudit(actor, action, payload) {
  const entry = audit.append(actor, action, payload);
  persistAudit(entry);
  return entry;
}

// Per-IP sliding-window rate limiter.
const RATE = new Map();
function rateAllow(ip) {
  const now = Date.now();
  const bucket = RATE.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) { RATE.set(ip, fresh); return false; }
  fresh.push(now);
  RATE.set(ip, fresh);
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  });
  res.end(JSON.stringify(body));
}

const OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'Hawkeye Sterling — Brain Reason API',
    version: '0.2.0',
    description: 'MLRO Advisor backend: Sonnet executor + Opus advisor with charter-bound reasoning, tamper-evident audit log, and per-IP rate limiting.',
  },
  servers: [{ url: `http://localhost:${PORT}`, description: 'local dev' }],
  paths: {
    '/healthz': { get: { summary: 'Liveness probe', responses: { 200: { description: 'ok' } } } },
    '/api/brain-reason': {
      post: {
        summary: 'Run the MLRO advisor pipeline',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: { type: 'string' },
                  mode: { type: 'string', enum: ['speed', 'balanced', 'multi_perspective'] },
                  audience: { type: 'string' },
                  caseContext: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MlroAdvisorResult' },
          400: { description: 'bad request' },
          413: { description: 'payload too large' },
          429: { description: 'rate limited' },
          503: { description: 'API key missing' },
        },
      },
    },
    '/api/audit': { get: { summary: 'Dump audit chain', responses: { 200: { description: 'entries + verify()' } } } },
  },
};

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

const server = http.createServer(async (req, res) => {
  const ip = clientIp(req);
  const started = Date.now();

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  if (req.method === 'GET' && req.url === '/healthz') {
    sendJson(res, 200, { ok: true, hasApiKey: Boolean(API_KEY), models: { executor: EXEC, advisor: ADV }, auditSeq: audit.head()?.seq ?? 0 });
    return;
  }

  if (req.method === 'GET' && req.url === '/openapi.json') {
    sendJson(res, 200, OPENAPI);
    return;
  }

  if (!rateAllow(ip)) {
    log('warn', 'rate.limited', { ip, url: req.url });
    return sendJson(res, 429, { ok: false, error: 'rate limited', windowMs: RATE_WINDOW_MS, max: RATE_MAX });
  }

  if (req.method === 'POST' && req.url === '/api/brain-reason') {
    let body;
    try { body = await readJson(req); }
    catch (err) {
      const msg = err && err.message === 'payload too large' ? 'payload too large' : 'invalid JSON body';
      const status = msg === 'payload too large' ? 413 : 400;
      log('warn', 'brain.reason.bad_request', { ip, status, reason: msg });
      return sendJson(res, status, { ok: false, error: msg });
    }

    const question = typeof body.question === 'string' ? body.question : '';
    if (!question.trim()) {
      log('warn', 'brain.reason.bad_request', { ip, reason: 'question required' });
      return sendJson(res, 400, { ok: false, error: 'question required' });
    }

    const caseContext = body.caseContext ?? {
      caseId: body.caseId ?? 'HWK-dev-unassigned',
      subjectName: body.subject ?? 'unspecified',
      entityType: body.entityType ?? 'individual',
      scope: { listsChecked: [], listVersionDates: {}, jurisdictions: [], matchingMethods: [] },
      evidenceIds: [],
    };

    if (!API_KEY) {
      appendAudit('server', 'brain.reason.no_api_key', { caseId: caseContext.caseId });
      log('error', 'brain.reason.no_api_key', { ip, caseId: caseContext.caseId });
      return sendJson(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY not set on the server' });
    }

    appendAudit('server', 'brain.reason.request', { caseId: caseContext.caseId, mode: body.mode ?? 'multi_perspective', ip });
    log('info', 'brain.reason.request', { ip, caseId: caseContext.caseId, mode: body.mode ?? 'multi_perspective' });

    try {
      const result = await invokeMlroAdvisor(
        { question, caseContext, mode: body.mode, audience: body.audience },
        { apiKey: API_KEY, executorModel: EXEC, advisorModel: ADV },
      );

      appendAudit('server', 'brain.reason.response', {
        caseId: caseContext.caseId,
        ok: result.ok,
        partial: result.partial,
        elapsedMs: result.elapsedMs,
        verdict: result.complianceReview.advisorVerdict,
      });
      log('info', 'brain.reason.response', {
        ip, caseId: caseContext.caseId, ok: result.ok, partial: result.partial,
        elapsedMs: result.elapsedMs, verdict: result.complianceReview.advisorVerdict,
        totalMs: Date.now() - started,
      });

      return sendJson(res, 200, result);
    } catch (err) {
      appendAudit('server', 'brain.reason.error', { caseId: caseContext.caseId, err: err?.message ?? String(err) });
      log('error', 'brain.reason.error', { ip, caseId: caseContext.caseId, err: err?.message ?? String(err) });
      return sendJson(res, 500, { ok: false, error: 'advisor failed', detail: err?.message ?? String(err) });
    }
  }

  if (req.method === 'GET' && req.url === '/api/audit') {
    return sendJson(res, 200, { entries: audit.list(), verify: audit.verify() });
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.info(`[brain-reason] listening on :${PORT} · executor=${EXEC} · advisor=${ADV}`);
});
