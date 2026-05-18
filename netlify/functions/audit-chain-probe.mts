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
  /** hashAlg absent = legacy FNV-1a; "sha256" = SHA-256 (current, post 2026-05-18). */
  hashAlg?: 'sha256' | 'fnv1a';
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

// crypto.createHash is not available in Netlify scheduled functions (Deno runtime).
// Use the Web Crypto API (SubtleCrypto) which is available everywhere.
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeEntryHash(prevHash: string | undefined, payload: unknown, at: string, seq: number, hashAlg?: string): Promise<string> {
  const material = `${prevHash ?? ''}::${seq}::${at}::${JSON.stringify(payload)}`;
  // Entries with hashAlg: "sha256" (written post 2026-05-18) use SHA-256.
  // Entries with no hashAlg or hashAlg: "fnv1a" use the legacy FNV-1a.
  if (hashAlg === 'sha256') {
    return sha256Hex(material);
  }
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

  const tamperedAt: number[] = [];
  const brokenLinkAt: number[] = [];
  let prev: ChainEntry | undefined;

  for (const e of entries) {
    if (!e || typeof e.seq !== 'number') {
      tamperedAt.push(-1);
      continue;
    }
    // Pass hashAlg so legacy FNV-1a entries and new SHA-256 entries are
    // each verified with the algorithm that was used to write them.
    const expected = await computeEntryHash(e.prevHash, e.payload, e.at, e.seq, e.hashAlg);
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
