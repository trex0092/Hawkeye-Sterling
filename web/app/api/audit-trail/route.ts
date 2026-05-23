// GET /api/audit-trail
//
// Reads the tamper-evident FNV-1a audit chain from Netlify Blobs and
// returns paginated entries. Written by the audit-chain-probe scheduled
// function (netlify/functions/audit-chain-probe.mts) which runs hourly
// and verifies the chain hashes.
//
// Blob store: "hawkeye-audit-chain"
//   chain.json            → ChainEntry[] (the full chain, append-only)
//   tamper-detected.json  → written by probe when tamper is found
//
// Query params:
//   page      (default 1)    — 1-indexed page number
//   pageSize  (default 50)   — entries per page, max 200
//   verified  (default false) — when "true", include computed-hash status per entry
//
// Response:
//   { ok, totalEntries, page, pageSize, entries, tamperMarker? }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { verifyRegulatorToken } from "@/lib/server/regulator-jwt";
import { filterAuditEntries, type AuditTrailFilter } from "@/lib/server/audit-trail-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

interface TamperMarker {
  detectedAt: string;
  tamperedAt: number[];
  brokenLinkAt: number[];
  totalEntries: number;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeEntryHash(prevHash: string | undefined, payload: unknown, at: string, seq: number): string {
  return fnv1a(`${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`);
}

interface BlobStoreI {
  get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
}

async function loadAuditStore(): Promise<BlobStoreI | null> {
  try {
    const { getStore } = await import("@netlify/blobs") as unknown as {
      getStore: (_opts: { name: string; siteID?: string; token?: string; consistency?: string }) => BlobStoreI;
    };
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    return siteID && token
      ? getStore({ name: "hawkeye-audit-chain", siteID, token, consistency: "strong" })
      : getStore({ name: "hawkeye-audit-chain" });
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return max !== undefined ? Math.min(v, max) : v;
}

async function handleGet(req: Request, responseHeaders: Record<string, string> = {}): Promise<NextResponse> {
  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 50, 200);
  const includeVerified = url.searchParams.get("verified") === "true";

  // J-08 — date-based + subject + event-type filtering. Applied AFTER the
  // chain is loaded but BEFORE pagination so page/pageSize remain meaningful
  // against the filtered result set. Empty filter is a no-op (returns the
  // full chain) so existing callers continue to work unchanged.
  const filter: AuditTrailFilter = {
    fromDate: url.searchParams.get("fromDate"),
    toDate: url.searchParams.get("toDate"),
    subjectId: url.searchParams.get("subjectId"),
    subjectName: url.searchParams.get("subjectName"),
    eventType: url.searchParams.get("eventType"),
  };

  const store = await loadAuditStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Blob store unavailable — check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN" },
      { status: 503, headers: responseHeaders },
    );
  }

  let chain: ChainEntry[] = [];
  try {
    const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
    if (!raw) {
      return NextResponse.json({
        ok: true,
        totalEntries: 0,
        page,
        pageSize,
        entries: [],
        message: "Audit chain is empty — no entries recorded yet",
      }, { headers: responseHeaders });
    }
    if (!Array.isArray(raw)) {
      return NextResponse.json({ ok: false, error: "chain.json is not an array" }, { status: 500, headers: responseHeaders });
    }
    chain = raw;
  } catch (err) {
    console.error("[audit-trail] chain read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "audit chain temporarily unavailable" },
      { status: 500, headers: responseHeaders },
    );
  }

  // Newest entries first.
  const sorted = [...chain].reverse();
  // J-08 — apply optional filters (date range, subject, event type) before
  // paginating. `totalEntries` in the response reflects the filtered count.
  const filtered = filterAuditEntries(sorted, filter);
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const page_entries = filtered.slice(start, start + pageSize);

  // Optionally annotate each entry with HMAC verification status.
  type EntryWithVerification = ChainEntry & { hashValid?: boolean };
  let annotated: EntryWithVerification[] = page_entries;
  if (includeVerified) {
    // Build a seq→entry map for prevHash lookup (from original order).
    const bySeq = new Map(chain.map((e) => [e.seq, e]));
    annotated = page_entries.map((e) => {
      const prev = typeof e.prevHash === "string" ? bySeq.get(e.seq - 1) : undefined;
      const expected = computeEntryHash(
        prev?.entryHash ?? e.prevHash,
        e.payload,
        e.at,
        e.seq,
      );
      return { ...e, hashValid: expected === e.entryHash };
    });
  }

  // Attach tamper marker if present.
  let tamperMarker: TamperMarker | null = null;
  try {
    const tm = await store.get("tamper-detected.json", { type: "json" }) as TamperMarker | null;
    if (tm) tamperMarker = tm;
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    totalEntries: total,
    page,
    pageSize,
    entries: annotated,
    ...(tamperMarker ? { tamperMarker } : {}),
  }, { headers: responseHeaders });
}

export const GET = async (req: Request) => {
  // Regulator read-only path: accept Ed25519-signed regulator JWT.
  // A tenant-scoped token grants read access to the audit trail.
  // Scope check: audit trail is tenant-wide; case-only scoped tokens are denied
  // to prevent cross-case data leakage via audit timeline correlation.
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (rawToken && !rawToken.startsWith("hks_live_")) {
    const regResult = await verifyRegulatorToken(rawToken);
    if (regResult.ok) {
      const regClaims = regResult.claims;
      const hasTenantScope = regClaims.scope.some((s) => s.startsWith("tenant:"));
      if (!hasTenantScope) {
        return NextResponse.json(
          { ok: false, error: "scope_denied", hint: "Audit trail requires a tenant-scoped regulator token." },
          { status: 403 },
        );
      }
      // Token valid and has tenant scope — allow read.
      return handleGet(req);
    }
  }

  return enforce(req as Parameters<typeof enforce>[0]).then((gate) => {
    if (!gate.ok) return gate.response as unknown as NextResponse;
    return handleGet(req, gate.headers);
  });
};
