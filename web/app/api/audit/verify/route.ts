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
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys } from "@/lib/server/store";
import {
  GENESIS_HASH,
  computeId,
  computeSignature as expectedSignature,
  getChainSecret,
  type AuditEntry,
  type VerificationFault,
  type SequenceGap,
} from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AuditHead {
  sequence: number;
  hash: string;
}

const DEFAULT_MAX = 5_000;

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
  // requireAuth: true — audit verification is a sensitive MLRO operation.
  // Without authentication, any caller could enumerate the audit chain.
  // Federal Decree-Law No. 10 of 2025 Art.24: audit records must only be accessible to authorised persons.
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  // Tenant isolation: derive tenantId from the authenticated key identity,
  // not from a caller-supplied query param. A query-param approach allows any
  // authenticated caller to read another tenant's audit chain (IDOR).
  // The email field of the API key record is the stable per-tenant identifier.
  const authenticatedTenantId = gate.record?.email ?? "default";
  const tenantId = (authenticatedTenantId.replace(/[^a-zA-Z0-9_@.-]/g, "_") || "default").slice(0, 64);

  // Use the same derived key as the sign route (getChainSecret derives
  // HMAC-SHA256(root, "hawkeye-audit-chain-v1:<tenantId>") to avoid using
  // the root secret directly and to isolate tenants from each other).
  const secret = getChainSecret(tenantId);
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

  const targetFilter =
    url.searchParams.get("screening_id") ?? url.searchParams.get("target");
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");
  // Date.parse returns NaN for invalid input, not null. Guard with isFinite so
  // invalid date strings don't silently produce NaN comparisons downstream.
  const sinceParsed = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const untilParsed = untilRaw ? Date.parse(untilRaw) : NaN;
  const since = Number.isFinite(sinceParsed) ? sinceParsed : null;
  const until = Number.isFinite(untilParsed) ? untilParsed : null;
  const maxRaw = Number.parseInt(url.searchParams.get("max") ?? "", 10);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX;

  // Namespace storage by tenant: "default" uses the legacy paths for backward
  // compat; all other tenants are isolated under audit/<tenantId>/.
  const entryPrefix = tenantId === "default" ? "audit/entry/" : `audit/${tenantId}/entry/`;
  const headKey = tenantId === "default" ? "audit/head.json" : `audit/${tenantId}/head.json`;

  let allKeys: string[];
  try {
    allKeys = (await listKeys(entryPrefix)).sort();
  } catch (err) {
    console.error("[audit/verify] listKeys failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Audit store temporarily unavailable — please retry" },
      { status: 503, headers: gate.headers },
    );
  }
  const brokenLinks: VerificationFault[] = [];
  const invalidIds: VerificationFault[] = [];
  const invalidSignatures: VerificationFault[] = [];
  const sequenceGaps: SequenceGap[] = [];

  let prevHash = GENESIS_HASH;
  let prevSequence = 0;
  let scanned = 0;
  let verified = 0;
  let earliestAt: string | null = null;
  let latestAt: string | null = null;

  for (const key of allKeys) {
    if (scanned >= max) break;
    const e = await getJson<AuditEntry>(key);
    if (!e) continue;
    scanned++;

    // Track date range across all scanned entries.
    if (e.at) {
      if (earliestAt === null || e.at < earliestAt) earliestAt = e.at;
      if (latestAt === null || e.at > latestAt) latestAt = e.at;
    }

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
    const recomputedId = computeId(e);
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

  const head = (await getJson<AuditHead>(headKey)) ?? {
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
      entryCount: scanned,
      dateRange: {
        earliest: earliestAt,
        latest: latestAt,
      },
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
