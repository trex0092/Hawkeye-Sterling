// GET /api/audit/view
//
// Audit chain viewer endpoint — queries the HMAC-sealed append-only
// chain written by /api/audit/sign (Netlify Blobs at audit/entry/*).
// Required by HS-GOV-001 §12 (Audit Readiness) and FDL 10/2025 Art.24
// (10-year retention with regulator-on-demand inspection).
//
// Query params (all optional):
//   ?screening_id=<id>  — filter by entry.target
//   ?target=<id>        — alias of screening_id
//   ?action=<a>         — filter by entry.action (e.g. str, dispose)
//   ?actor=<role>       — filter by entry.actor.role
//   ?since=<ISO>        — only entries at >= since
//   ?until=<ISO>        — only entries at <= until
//   ?limit=<N>          — page size (default 100, max 500)
//   ?offset=<M>         — skip first M matching entries
//   ?format=json|csv    — response shape (default json)
//
// Response (json):
//   { ok, total, returned, entries: AuditEntry[], head: { sequence, hash } }
//
// Charter alignment: P9 (no opaque scoring — every audit row carries
// previousHash + signature so reviewers can trace seal integrity).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function entryMatches(
  e: AuditEntry,
  filters: {
    target: string | null;
    action: string | null;
    actor: string | null;
    since: number | null;
    until: number | null;
  },
): boolean {
  if (filters.target && e.target !== filters.target) return false;
  if (filters.action && e.action !== filters.action) return false;
  if (filters.actor && e.actor?.role !== filters.actor) return false;
  if (filters.since !== null) {
    const t = Date.parse(e.at);
    if (Number.isFinite(t) && t < filters.since) return false;
  }
  if (filters.until !== null) {
    const t = Date.parse(e.at);
    if (Number.isFinite(t) && t > filters.until) return false;
  }
  return true;
}

function csvEscape(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function entriesToCsv(entries: readonly AuditEntry[]): string {
  const header = [
    "sequence",
    "id",
    "at",
    "action",
    "target",
    "actor_role",
    "actor_name",
    "previousHash",
    "signature",
  ].join(",");
  const rows = entries.map((e) =>
    [
      e.sequence,
      e.id,
      e.at,
      e.action,
      e.target,
      e.actor?.role ?? "",
      e.actor?.name ?? "",
      e.previousHash,
      e.signature,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

async function handleGet(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const target =
    url.searchParams.get("screening_id") ?? url.searchParams.get("target");
  const action = url.searchParams.get("action");
  const actor = url.searchParams.get("actor");
  const since = parseTimestamp(url.searchParams.get("since"));
  const until = parseTimestamp(url.searchParams.get("until"));
  const limit = clampLimit(url.searchParams.get("limit"));
  const offsetRaw = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  const allKeys = await listKeys("audit/entry/");
  // Lexical sort = sequence order because keys are zero-padded.
  // Reverse for newest-first display.
  const sortedKeys = allKeys.sort().reverse();

  const filters = { target, action, actor, since, until };
  const matched: AuditEntry[] = [];
  let scanned = 0;

  // Stream-scan to avoid loading the whole chain when filtering narrows
  // results aggressively. Stop once we have offset+limit matches.
  for (const key of sortedKeys) {
    scanned++;
    const e = await getJson<AuditEntry>(key);
    if (!e) continue;
    if (!entryMatches(e, filters)) continue;
    matched.push(e);
    if (matched.length >= offset + limit) break;
  }

  const page = matched.slice(offset, offset + limit);
  const head = (await getJson<AuditHead>("audit/head.json")) ?? {
    sequence: 0,
    hash: "0".repeat(64),
  };

  if (format === "csv") {
    const csv = entriesToCsv(page);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit-trail-${Date.now()}.csv"`,
        ...gate.headers,
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      total: matched.length,
      returned: page.length,
      offset,
      limit,
      scanned,
      head,
      filter: {
        target: target ?? null,
        action: action ?? null,
        actor: actor ?? null,
        since: since !== null ? new Date(since).toISOString() : null,
        until: until !== null ? new Date(until).toISOString() : null,
      },
      entries: page,
    },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
