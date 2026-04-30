// Hawkeye Sterling — outbound webhook emitter (audit follow-up #51).
//
// Fires HTTP POSTs to configured webhook URLs when high-severity events
// occur (escalate / block / freeze, redline fired, sanctions delta with
// re-screen targets, MLRO override). Routes integrate this with the
// shared `redactPdplObject` helper before payload emission so the
// PDPL guard fires on every outbound body (Charter P4 + PDPL Art.13).
//
// Configuration: env-driven, comma-separated URL list per channel.
//   WEBHOOK_VERDICT_ESCALATE       — fired on outcome ∈ {escalate, block, freeze}
//   WEBHOOK_VERDICT_REDLINE        — fired on any redline match
//   WEBHOOK_SANCTIONS_DELTA        — fired by sanctions-ingest scheduler
//   WEBHOOK_MLRO_OVERRIDE          — fired on disposition override
//   WEBHOOK_HMAC_SECRET            — optional HMAC-SHA256 signing key
//
// Behaviour:
//   · Best-effort: failures are logged + swallowed. No retry storm.
//   · Per-URL 5s timeout with AbortController.
//   · Optional HMAC-SHA256 signature in `X-Hawkeye-Signature` header.
//   · Body is JSON; PDPL fields redacted at the payload layer.
//
// This module is pure plumbing — DOES NOT call redactPdplObject itself
// (the caller does, since they own the payload shape). Keeps the
// emitter generic + testable.

import { createHmac } from 'node:crypto';

export type WebhookChannel =
  | 'verdict_escalate'
  | 'verdict_redline'
  | 'sanctions_delta'
  | 'mlro_override'
  | 'audit_drift';

const ENV_KEY: Record<WebhookChannel, string> = {
  verdict_escalate: 'WEBHOOK_VERDICT_ESCALATE',
  verdict_redline: 'WEBHOOK_VERDICT_REDLINE',
  sanctions_delta: 'WEBHOOK_SANCTIONS_DELTA',
  mlro_override: 'WEBHOOK_MLRO_OVERRIDE',
  audit_drift: 'WEBHOOK_AUDIT_DRIFT',
};

const HMAC_SECRET_ENV = 'WEBHOOK_HMAC_SECRET';
const PER_URL_TIMEOUT_MS = 5_000;

export interface EmitOutcome {
  channel: WebhookChannel;
  ok: boolean;
  url: string;
  status?: number;
  durationMs: number;
  error?: string;
}

function urlsFor(channel: WebhookChannel): string[] {
  const raw = process.env[ENV_KEY[channel]];
  if (!raw) return [];
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

function sign(body: string): string | undefined {
  const secret = process.env[HMAC_SECRET_ENV];
  if (!secret) return undefined;
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function fireOne(
  channel: WebhookChannel,
  url: string,
  body: string,
  signature: string | undefined,
): Promise<EmitOutcome> {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PER_URL_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-hawkeye-channel': channel,
      'x-hawkeye-emit-ts': new Date().toISOString(),
    };
    if (signature) headers['x-hawkeye-signature'] = signature;
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    clearTimeout(t);
    return {
      channel,
      ok: res.ok,
      url,
      status: res.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    clearTimeout(t);
    return {
      channel,
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** Emit a payload to every URL configured for a channel. Best-effort.
 *  Returns one EmitOutcome per URL. Caller is responsible for redacting
 *  PDPL fields BEFORE calling this — keeps the emitter generic. */
export async function emit(
  channel: WebhookChannel,
  payload: unknown,
): Promise<EmitOutcome[]> {
  const urls = urlsFor(channel);
  if (urls.length === 0) return [];
  const body = JSON.stringify({
    channel,
    emittedAt: new Date().toISOString(),
    payload,
  });
  const signature = sign(body);
  return Promise.all(urls.map((u) => fireOne(channel, u, body, signature)));
}

/** Convenience: emit + log a one-line summary per outcome. */
export async function emitAndLog(
  channel: WebhookChannel,
  payload: unknown,
  logger: (line: string) => void = (l) => console.warn(l),
): Promise<EmitOutcome[]> {
  const outcomes = await emit(channel, payload);
  for (const o of outcomes) {
    logger(
      `[webhook] ${o.channel} ${o.ok ? 'OK' : 'FAIL'} ${o.url} ` +
        `${o.status ?? '-'} (${o.durationMs}ms)${o.error ? ' err=' + o.error : ''}`,
    );
  }
  return outcomes;
}

/** Channel introspection — list channels with at least one URL configured. */
export function configuredChannels(): WebhookChannel[] {
  const all: WebhookChannel[] = [
    'verdict_escalate',
    'verdict_redline',
    'sanctions_delta',
    'mlro_override',
    'audit_drift',
  ];
  return all.filter((c) => urlsFor(c).length > 0);
}
