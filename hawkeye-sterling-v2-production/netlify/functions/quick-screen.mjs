// Netlify function — /.netlify/functions/quick-screen
// Netlify's redirect rule in netlify.toml maps /api/* → /.netlify/functions/:splat,
// so the browser can call POST /api/quick-screen the same way in prod as in dev.
//
// Imports from the compiled brain at ../../../../dist. Ensure `npm run build`
// has been executed at the repo root before bundling this function.

import { quickScreen } from '../../../dist/src/brain/quick-screen.js';

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid JSON body' });
  }

  const subject = body.subject;
  const candidates = body.candidates;
  if (!subject || typeof subject.name !== 'string' || !subject.name.trim()) {
    return json(400, { ok: false, error: 'subject.name required' });
  }
  if (!Array.isArray(candidates)) {
    return json(400, { ok: false, error: 'candidates must be an array' });
  }

  try {
    const result = quickScreen(subject, candidates, body.options ?? {});
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(500, { ok: false, error: 'quick-screen failed', detail: err?.message ?? String(err) });
  }
}
