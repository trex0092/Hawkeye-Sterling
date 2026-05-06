// GET /api/audit/verify
//
// Audit chain verifier — recomputes every entry's id (sha256 of the
// canonical payload) and signature (HMAC-SHA256 of previousHash || id
// || at, keyed by AUDIT_CHAIN_SECRET) and checks that previousHash
// links form a contiguous chain back to genesis. Required by
// HS-OPS-001 §3.1 / §A1 (audit chain integrity check) and HS-MC-001
// §9.1 (audit chain probe).
//
// Query params (all optional):
//   ?screening_id=<id>  — verify only entries with this target
//   ?target=<id>        — alias of screening_id
//   ?since=<ISO>        — verify entries at >= since
//   ?until=<ISO>        — verify entries at <= until
//   ?max=<N>            — cap number of entries verified (default 5000)
//
// Response:
//   {
//     ok, totalScanned, totalVerified,
//     brokenLinks: [{ sequence, expected, got }],
//     invalidIds: [{ sequence, expected, got }],
//     invalidSignatures: [{ sequence, expected, got }],
//     sequenceGaps: [{ expected, got }],
//     headConsistent: boolean,
//     head: { sequence, hash }
//   }
//
// Tamper-evidence: an attacker who edits any entry must also recompute
// every downstream signature; without AUDIT_CHAIN_SECRET that is
// computationally infeasible. This route makes that property auditable.

import { NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: { role: string; name?: string };
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

interface AuditHead {
  sequence: number;
  hash: string;
}

interface SequenceGap {
  expected: number;
  got: number;
}

interface VerificationFault {
  sequence: number;
  expected: string;
  got: string;
}

const GENESIS_HASH = "0".repeat(64);
const DEFAULT_MAX = 5_000;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalPayload(e: AuditEntry): string {
  return JSON.stringify({
    action: e.action,
    target: e.target,
    actor: e.actor,
    body: e.body ?? {},
    at: e.at,
  });
}

function expectedSignature(e: AuditEntry, secret: string): string {
  return createHmac("sha256", secret)
    .update(e.previousHash)
    .update(e.id)
    .update(e.at)
    .digest("hex");
}

function entryInWindow(
  e: AuditEntry,
  since: number | null,
  until: number | null,
): boolean {
  if (since === null && until === null) return true;
  const t = Date.parse(e.at);
  if (!Number.isFinite(t)) return true; // can't filter — include.
  if (since !== null && t < since) return false;
  if (until !== null && t > until) return false;
  return true;
}

async function handleGet(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const secret = process.env["AUDIT_CHAIN_SECRET"];
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AUDIT_CHAIN_SECRET is not configured. Audit chain verification requires the HMAC key. Set the env var (openssl rand -hex 64) and redeploy.",
      },
      { status: 503, headers: gate.headers },
    );
  }

  const url = new URL(req.url);
  const targetFilter =
    url.searchParams.get("screening_id") ?? url.searchParams.get("target");
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");
  const since = sinceRaw ? Date.parse(sinceRaw) : null;
  const until = untilRaw ? Date.parse(untilRaw) : null;
  const maxRaw = Number.parseInt(url.searchParams.get("max") ?? "", 10);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX;

  const allKeys = (await listKeys("audit/entry/")).sort();
  const brokenLinks: VerificationFault[] = [];
  const invalidIds: VerificationFault[] = [];
  const invalidSignatures: VerificationFault[] = [];
  const sequenceGaps: SequenceGap[] = [];

  let prevHash = GENESIS_HASH;
  let prevSequence = 0;
  let scanned = 0;
  let verified = 0;

  for (const key of allKeys) {
    if (scanned >= max) break;
    const e = await getJson<AuditEntry>(key);
    if (!e) continue;
    scanned++;

    // Sequence contiguity is a chain-wide check — applied even when
    // a target filter is in effect, because gaps anywhere break the
    // tamper-evidence guarantee for everyone.
    if (e.sequence !== prevSequence + 1) {
      sequenceGaps.push({ expected: prevSequence + 1, got: e.sequence });
    }
    prevSequence = e.sequence;

    // Link to previous entry (chain integrity).
    if (e.previousHash !== prevHash) {
      brokenLinks.push({
        sequence: e.sequence,
        expected: prevHash,
        got: e.previousHash,
      });
    }

    // Skip per-entry id/signature checks if a target filter rules
    // this entry out. We still update prevHash so downstream entries
    // chain correctly.
    if (targetFilter && e.target !== targetFilter) {
      prevHash = e.id;
      continue;
    }
    if (!entryInWindow(e, since, until)) {
      prevHash = e.id;
      continue;
    }

    // 1. id == sha256(canonicalPayload).
    const recomputedId = sha256Hex(canonicalPayload(e));
    if (recomputedId !== e.id) {
      invalidIds.push({
        sequence: e.sequence,
        expected: recomputedId,
        got: e.id,
      });
    }

    // 2. signature == HMAC(prev || id || at, secret).
    const recomputedSig = expectedSignature(e, secret);
    if (recomputedSig !== e.signature) {
      invalidSignatures.push({
        sequence: e.sequence,
        expected: recomputedSig,
        got: e.signature,
      });
    }

    if (recomputedId === e.id && recomputedSig === e.signature) verified++;
    prevHash = e.id;
  }

  const head = (await getJson<AuditHead>("audit/head.json")) ?? {
    sequence: 0,
    hash: GENESIS_HASH,
  };
  const headConsistent =
    head.sequence === prevSequence && head.hash === prevHash;

  const ok =
    brokenLinks.length === 0 &&
    invalidIds.length === 0 &&
    invalidSignatures.length === 0 &&
    sequenceGaps.length === 0 &&
    headConsistent;

  return NextResponse.json(
    {
      ok,
      totalScanned: scanned,
      totalVerified: verified,
      brokenLinks,
      invalidIds,
      invalidSignatures,
      sequenceGaps,
      headConsistent,
      head,
      filter: {
        target: targetFilter ?? null,
        since: since !== null ? new Date(since).toISOString() : null,
        until: until !== null ? new Date(until).toISOString() : null,
        max,
      },
    },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
