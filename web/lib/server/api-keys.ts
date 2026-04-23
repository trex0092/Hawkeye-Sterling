// Hawkeye Sterling — API key issuance + validation.
//
// Keys are sha-256 hashed before being stored in Netlify Blobs so a
// compromised blob store cannot yield usable keys. The plaintext is
// returned exactly once at issuance time.

import { createHash, randomBytes } from "node:crypto";
import { del, getJson, listKeys, setJson } from "./store";
import { tierFor, type TierDefinition, type TierId } from "@/lib/data/tiers";

const PREFIX = "keys/";
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
  };
  await setJson(`${PREFIX}${id}`, record);
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
  const records = await listApiKeys();
  const match = records.find((r) => r.hash === hash);
  if (!match) return { ok: false, reason: "unknown" };
  if (match.revokedAt) return { ok: false, reason: "revoked", record: match };

  const tier = tierFor(match.tier);

  if (Date.now() >= Date.parse(match.usageResetAt)) {
    match.usageMonthly = 0;
    match.usageResetAt = monthBoundary();
  }
  if (tier.monthlyQuota !== null && match.usageMonthly >= tier.monthlyQuota) {
    return { ok: false, reason: "quota_exceeded", record: match, tier };
  }

  match.usageMonthly += 1;
  match.lastUsedAt = new Date().toISOString();
  await setJson(`${PREFIX}${match.id}`, match);

  const remaining =
    tier.monthlyQuota === null ? null : tier.monthlyQuota - match.usageMonthly;
  return { ok: true, record: match, tier, remainingMonthly: remaining };
}

export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  const url = new URL(req.url);
  const q = url.searchParams.get("api_key");
  return q?.trim() ?? null;
}

export function maskPlaintext(plaintext: string): string {
  if (plaintext.length <= 12) return plaintext;
  return `${plaintext.slice(0, 12)}…${plaintext.slice(-4)}`;
}
