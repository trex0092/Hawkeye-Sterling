// Hawkeye Sterling — API key issuance + validation.
//
// Keys are sha-256 hashed before being stored in Netlify Blobs so a
// compromised blob store cannot yield usable keys. The plaintext is
// returned exactly once at issuance time.
//
// Storage layout:
//   keys/{id}          — ApiKeyRecord (primary, used for listing)
//   keyidx/{sha256}    — "{id}" string (hash → id secondary index)
//
// The secondary index makes validateAndConsume O(1) instead of O(n).
// Keys issued before the index existed fall back to a linear scan and
// then backfill the index for subsequent calls.

import { createHash, randomBytes } from "node:crypto";
import { del, getJson, listKeys, setJson } from "./store";
import { tierFor, type TierDefinition, type TierId } from "@/lib/data/tiers";

const PREFIX = "keys/";
const HASH_IDX_PREFIX = "keyidx/";
const PLAINTEXT_PREFIX = "hks_live_";

export interface ApiKeyRecord {
  id: string;
  hash: string;
  name: string;
  tier: TierId;
  email: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  usageMonthly: number;
  usageResetAt: string;
  // Monotonically increasing; used to detect concurrent writes (soft
  // optimistic lock — Netlify Blobs has no CAS, so quota enforcement
  // is a best-effort soft limit under high concurrency).
  _version?: number;
  // Optional role for role-based access control on sensitive endpoints
  // (e.g. 'mlro' required for disposition recording per Cabinet Res 134/2025).
  role?: string;
}

export interface IssuedKey {
  id: string;
  plaintext: string;
  record: ApiKeyRecord;
  tier: TierDefinition;
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function newKeyPlaintext(): { id: string; plaintext: string } {
  const id = randomBytes(8).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  return { id, plaintext: `${PLAINTEXT_PREFIX}${id}_${secret}` };
}

function monthBoundary(now: Date = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString();
}

export async function issueKey(params: {
  name: string;
  email: string;
  tier: TierId;
}): Promise<IssuedKey> {
  const { id, plaintext } = newKeyPlaintext();
  const record: ApiKeyRecord = {
    id,
    hash: hashKey(plaintext),
    name: params.name,
    tier: params.tier,
    email: params.email,
    createdAt: new Date().toISOString(),
    usageMonthly: 0,
    usageResetAt: monthBoundary(),
    _version: 0,
  };
  // Write primary record and hash index atomically (best-effort; if the
  // index write fails the key still works via the fallback linear scan).
  await setJson(`${PREFIX}${id}`, record);
  await setJson(`${HASH_IDX_PREFIX}${record.hash}`, id);
  return { id, plaintext, record, tier: tierFor(params.tier) };
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const keys = await listKeys(PREFIX);
  const out: ApiKeyRecord[] = [];
  for (const k of keys) {
    const r = await getJson<ApiKeyRecord>(k);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokeKey(id: string): Promise<boolean> {
  const record = await getJson<ApiKeyRecord>(`${PREFIX}${id}`);
  if (!record) return false;
  record.revokedAt = new Date().toISOString();
  await setJson(`${PREFIX}${id}`, record);
  return true;
}

export async function deleteKey(id: string): Promise<void> {
  const record = await getJson<ApiKeyRecord>(`${PREFIX}${id}`);
  if (record) {
    await del(`${HASH_IDX_PREFIX}${record.hash}`);
  }
  await del(`${PREFIX}${id}`);
}

export interface KeyValidation {
  ok: boolean;
  reason?: "missing" | "unknown" | "revoked" | "quota_exceeded";
  record?: ApiKeyRecord;
  tier?: TierDefinition;
  remainingMonthly?: number | null;
}

export async function validateAndConsume(plaintext: string | null): Promise<KeyValidation> {
  if (!plaintext) return { ok: false, reason: "missing" };
  const hash = hashKey(plaintext);

  // O(1): look up id via hash index, then fetch the record directly.
  let match: ApiKeyRecord | null = null;
  const indexedId = await getJson<string>(`${HASH_IDX_PREFIX}${hash}`);
  if (indexedId) {
    match = await getJson<ApiKeyRecord>(`${PREFIX}${indexedId}`);
  }

  // Backward-compat fallback for keys issued before the index existed.
  if (!match) {
    const records = await listApiKeys();
    const found = records.find((r) => r.hash === hash);
    if (found) {
      match = found;
      // Backfill index so next call is O(1).
      await setJson(`${HASH_IDX_PREFIX}${hash}`, match.id).catch(() => undefined);
    }
  }

  if (!match) return { ok: false, reason: "unknown" };
  if (match.revokedAt) return { ok: false, reason: "revoked", record: match };

  const tier = tierFor(match.tier);

  // Reset monthly counter if the window has rolled over.
  if (Date.now() >= Date.parse(match.usageResetAt)) {
    match.usageMonthly = 0;
    match.usageResetAt = monthBoundary();
  }
  if (tier.monthlyQuota !== null && match.usageMonthly >= tier.monthlyQuota) {
    return { ok: false, reason: "quota_exceeded", record: match, tier };
  }

  // Increment usage. Netlify Blobs has no atomic CAS, so quota is a soft
  // limit — concurrent requests arriving within the same blob round-trip
  // (~50 ms) may both pass. Strict enforcement requires a database with
  // atomic increment.
  const updated: ApiKeyRecord = {
    ...match,
    usageMonthly: match.usageMonthly + 1,
    lastUsedAt: new Date().toISOString(),
    _version: (match._version ?? 0) + 1,
  };
  await setJson(`${PREFIX}${match.id}`, updated);

  const remaining =
    tier.monthlyQuota === null ? null : tier.monthlyQuota - updated.usageMonthly;
  return { ok: true, record: updated, tier, remainingMonthly: remaining };
}

export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  // Query-string extraction intentionally removed: keys in URLs appear in
  // server logs, CDN access logs, browser history, and Referer headers.
  return null;
}

export function maskPlaintext(plaintext: string): string {
  if (plaintext.length <= 12) return plaintext;
  return `${plaintext.slice(0, 12)}…${plaintext.slice(-4)}`;
}
