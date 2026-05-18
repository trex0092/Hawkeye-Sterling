// Hawkeye Sterling — audit-chain integrity probe (audit follow-up #41).
//
// Hourly Netlify scheduled function that re-verifies the FNV-1a chain
// hashes inside the persisted audit-chain blob. If any entry's
// computed hash != recorded hash, the chain has been tampered with —
// fires a critical webhook and writes a tamper marker that surfaces
// in the next /api/mlro/performance call.
//
// This is what makes the audit chain genuinely tamper-evident in
// production (vs. theoretically tamper-evident when only the
// in-process append validates). Charter P9 + FDL 10/2025 Art.24
// (records must be tamper-evident on regulator demand).

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { emit } from '../../dist/src/integrations/webhook-emitter.js';
import { writeHeartbeat } from '../lib/heartbeat.js';

const STORE_NAME = 'hawkeye-audit-chain';
const CHAIN_KEY = 'chain.json';
const TAMPER_MARKER_KEY = 'tamper-detected.json';
const RUN_LABEL = 'audit-chain-probe';

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  /** hashAlg absent = legacy FNV-1a; "sha256" = SHA-256 (no HMAC);
   *  "hmac-sha256" = HMAC-SHA256 with per-tenant derived key (current). */
  hashAlg?: 'sha256' | 'fnv1a' | 'hmac-sha256';
  payload: unknown;
  at: string;
}

// Legacy FNV-1a implementation kept for backward-compatibility with entries
// written before 2026-05-18. New entries use SHA-256 (hashAlg: "sha256").
// If the write-side implementation changes again, update both this file and
// web/lib/server/audit-chain.ts's computeHash function atomically.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// crypto.createHash / createHmac not available in Deno (Netlify scheduled functions).
// Use WebCrypto (SubtleCrypto) which is universally available.
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Mirror the key derivation from audit-chain.ts (web/lib/server/audit-chain.ts).
// Both sides MUST use the same domain label: "hawkeye-audit-chain-v1:<tenantId>".
async function deriveChainKey(rootSecret: string, tenantId: string): Promise<string> {
  return hmacSha256Hex(rootSecret, `hawkeye-audit-chain-v1:${tenantId}`);
}

// Safe env-var accessor that works in both Deno (Netlify scheduled functions)
// and Node.js (local test runs). Deno.env.get() is the canonical path;
// process.env is a common polyfill.
function getEnv(key: string): string | undefined {
  try {
    // @ts-ignore — Deno global defined in Netlify scheduled function runtime.
    if (typeof Deno !== 'undefined') return Deno.env.get(key);
  } catch { /* not Deno */ }
  return process?.env?.[key];
}

async function getProbeChainSecret(tenantId = 'default'): Promise<string | null> {
  const envKey = `AUDIT_CHAIN_SECRET_${tenantId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const perTenant = getEnv(envKey);
  if (perTenant && perTenant.length >= 32) return perTenant;

  const root = getEnv('AUDIT_CHAIN_SECRET');
  if (!root || root.length < 32) return null;
  return deriveChainKey(root, tenantId);
}

async function computeEntryHash(
  prevHash: string | undefined,
  payload: unknown,
  at: string,
  seq: number,
  hashAlg?: string,
  hmacSecret?: string | null,
): Promise<string> {
  const material = `${prevHash ?? ''}::${seq}::${at}::${JSON.stringify(payload)}`;
  if (hashAlg === 'hmac-sha256' && hmacSecret) {
    return hmacSha256Hex(hmacSecret, material);
  }
  if (hashAlg === 'sha256') {
    return sha256Hex(material);
  }
  // Legacy FNV-1a for entries written before 2026-05-18.
  return fnv1a(material);
}

interface ProbeOutcome {
  ok: boolean;
  totalEntries: number;
  verified: number;
  tamperedAt?: number[];   // seqs that fail verification
  brokenLinkAt?: number[];  // seqs whose prevHash != prior entry's entryHash
  durationMs: number;
  error?: string;
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `getStore failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 503);
  }

  let raw: string | null;
  try {
    raw = await store.get(CHAIN_KEY, { type: 'text' });
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `chain read failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 503);
  }

  if (raw === null || raw === undefined || raw === '') {
    return jsonResponse({
      ok: true,
      label: RUN_LABEL,
      message: 'no audit-chain blob found — nothing to verify',
      durationMs: Date.now() - startedAt,
    });
  }

  let entries: ChainEntry[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('chain blob is not an array');
    entries = parsed as ChainEntry[];
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `chain parse failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }

  // Resolve the HMAC secret once — all HMAC entries in this chain share
  // the same derived key (chain file = "default" tenant = chain.json).
  const hmacSecret = await getProbeChainSecret('default');

  const tamperedAt: number[] = [];
  const brokenLinkAt: number[] = [];
  let prev: ChainEntry | undefined;

  for (const e of entries) {
    if (!e || typeof e.seq !== 'number') {
      tamperedAt.push(-1);
      continue;
    }
    // Dispatch to the correct algorithm based on hashAlg tag:
    //   "hmac-sha256"  → HMAC-SHA256 with derived tenant key
    //   "sha256"       → plain SHA-256 (no HMAC, pre-2026-05-19 entries)
    //   absent/fnv1a   → legacy FNV-1a (pre-2026-05-18 entries)
    const expected = await computeEntryHash(e.prevHash, e.payload, e.at, e.seq, e.hashAlg, hmacSecret);
    if (expected !== e.entryHash) tamperedAt.push(e.seq);
    if (prev && e.prevHash !== prev.entryHash) brokenLinkAt.push(e.seq);
    prev = e;
  }

  const verified = entries.length - tamperedAt.length - brokenLinkAt.length;
  const ok = tamperedAt.length === 0 && brokenLinkAt.length === 0;

  const outcome: ProbeOutcome = {
    ok,
    totalEntries: entries.length,
    verified,
    durationMs: Date.now() - startedAt,
  };
  if (tamperedAt.length > 0) outcome.tamperedAt = tamperedAt;
  if (brokenLinkAt.length > 0) outcome.brokenLinkAt = brokenLinkAt;

  // Tamper detected → fire critical webhook + write marker. Marker
  // includes the offending seqs so the operator dashboard can render
  // them. Does NOT mutate the chain (that would itself be tampering).
  if (!ok) {
    try {
      await store.set(
        TAMPER_MARKER_KEY,
        JSON.stringify({
          detectedAt: new Date().toISOString(),
          tamperedAt,
          brokenLinkAt,
          totalEntries: entries.length,
        }),
      );
    } catch {
      // best-effort
    }
    try {
      await emit('audit_drift', {
        severity: 'critical',
        message: 'Audit-chain tamper detected',
        tamperedAt,
        brokenLinkAt,
        totalEntries: entries.length,
      });
    } catch {
      // best-effort
    }
  }

  await writeHeartbeat(RUN_LABEL);
  return jsonResponse({ label: RUN_LABEL, ...outcome });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config: Config = {
  // Hourly at :42 (UTC) — staggered off the hour mark.
  schedule: '42 * * * *',
};
