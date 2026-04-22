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
import { invokeMlroAdvisor } from '../dist/src/integrations/mlroAdvisor.js';
import { AuditChain } from '../dist/src/brain/audit-chain.js';

const PORT = Number(process.env.PORT ?? 8081);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const EXEC = process.env.EXECUTOR_MODEL ?? 'claude-sonnet-4-6';
const ADV = process.env.ADVISOR_MODEL ?? 'claude-opus-4-7';

if (!API_KEY) {
  console.error('[brain-reason] ANTHROPIC_API_KEY not set. The server will run but every request will fail.');
}

const audit = new AuditChain();

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  if (req.method === 'GET' && req.url === '/healthz') {
    sendJson(res, 200, { ok: true, hasApiKey: Boolean(API_KEY), models: { executor: EXEC, advisor: ADV }, auditSeq: audit.head()?.seq ?? 0 });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/brain-reason') {
    let body;
    try { body = await readJson(req); }
    catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }

    const question = typeof body.question === 'string' ? body.question : '';
    if (!question.trim()) return sendJson(res, 400, { ok: false, error: 'question required' });

    const caseContext = body.caseContext ?? {
      caseId: body.caseId ?? 'HWK-dev-unassigned',
      subjectName: body.subject ?? 'unspecified',
      entityType: body.entityType ?? 'individual',
      scope: { listsChecked: [], listVersionDates: {}, jurisdictions: [], matchingMethods: [] },
      evidenceIds: [],
    };

    if (!API_KEY) {
      audit.append('server', 'brain.reason.no_api_key', { caseId: caseContext.caseId });
      return sendJson(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY not set on the server' });
    }

    audit.append('server', 'brain.reason.request', { caseId: caseContext.caseId, mode: body.mode ?? 'multi_perspective' });

    const result = await invokeMlroAdvisor(
      { question, caseContext, mode: body.mode, audience: body.audience },
      { apiKey: API_KEY, executorModel: EXEC, advisorModel: ADV },
    );

    audit.append('server', 'brain.reason.response', {
      caseId: caseContext.caseId,
      ok: result.ok,
      partial: result.partial,
      elapsedMs: result.elapsedMs,
      verdict: result.complianceReview.advisorVerdict,
    });

    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && req.url === '/api/audit') {
    return sendJson(res, 200, { entries: audit.list(), verify: audit.verify() });
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.info(`[brain-reason] listening on :${PORT} · executor=${EXEC} · advisor=${ADV}`);
});
