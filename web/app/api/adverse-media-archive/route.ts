// POST /api/adverse-media-archive  — store an adverse-media verdict to the
//                                    per-subject historical archive.
// GET  /api/adverse-media-archive?subject=<name>&limit=<n>  — retrieve the
//                                    last N verdicts for a subject so periodic
//                                    re-screening can compare against a baseline.
//
// G6: Blob-backed historical adverse media archive.
//
// Storage layout (Netlify Blobs, store: "adverse-media-archive"):
//   {tenant}/{subject-slug}/index.json   — ordered list of record keys (newest-first)
//   {tenant}/{subject-slug}/{iso8601}.json — individual verdict snapshot
//
// Retention: 12 months rolling; records older than 365 days are pruned on write.
// Archive cap: 100 records per subject (prevents unbounded blob fan-out).

import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STORE_NAME = "adverse-media-archive";
const MAX_RECORDS = 100;
const RETENTION_DAYS = 365;

function subjectSlug(subject: string): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function indexKey(tenant: string, slug: string): string {
  return `${tenant}/${slug}/index.json`;
}

function recordKey(tenant: string, slug: string, iso: string): string {
  return `${tenant}/${slug}/${iso}.json`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject")?.trim();
  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject required" }, { status: 400, headers: gate.headers });
  }
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 50);

  const tenant = tenantIdFromGate(gate);
  const slug = subjectSlug(subject);

  try {
    const store = getStore({ name: STORE_NAME });
    const index = await store.get(indexKey(tenant, slug), { type: "json" }) as string[] | null;
    if (!index || index.length === 0) {
      return NextResponse.json({ ok: true, subject, records: [], total: 0 }, { headers: gate.headers });
    }

    const keys = index.slice(0, limit);
    const records = await Promise.all(
      keys.map((k) => store.get(k, { type: "json" }).catch(() => null)),
    );
    return NextResponse.json(
      { ok: true, subject, records: records.filter(Boolean), total: index.length },
      { headers: gate.headers },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "archive unavailable" },
      { status: 503, headers: gate.headers },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { subject?: string; verdict?: unknown };
  try {
    body = (await req.json()) as { subject?: string; verdict?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const subject = (body.subject ?? "").toString().trim();
  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject required" }, { status: 400, headers: gate.headers });
  }
  if (!body.verdict) {
    return NextResponse.json({ ok: false, error: "verdict required" }, { status: 400, headers: gate.headers });
  }

  const tenant = tenantIdFromGate(gate);
  const slug = subjectSlug(subject);
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const rkey = recordKey(tenant, slug, iso);
  const ikey = indexKey(tenant, slug);

  try {
    const store = getStore({ name: STORE_NAME });

    // Load existing index.
    const existing = (await store.get(ikey, { type: "json" }).catch(() => null)) as string[] | null;
    let index: string[] = existing ?? [];

    // Prune records older than 365 days.
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    index = index.filter((k) => {
      const m = k.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/);
      const captured = m?.[1];
      if (!captured) return true;
      const ts = captured.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z');
      return new Date(ts).getTime() > cutoff;
    });

    // Cap at MAX_RECORDS (oldest dropped first — the end of the array).
    while (index.length >= MAX_RECORDS) index.pop();

    // Store snapshot and updated index.
    await store.setJSON(rkey, { subject, archivedAt: new Date().toISOString(), verdict: body.verdict });
    index.unshift(rkey);
    await store.setJSON(ikey, index);

    void writeAuditChainEntry(
      { event: "adverse_media.archived", actor: gate.keyId, meta: { subjectId: slug, totalArchived: index.length } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      { ok: true, subject, archivedAt: iso, totalArchived: index.length },
      { status: 201, headers: gate.headers },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "archive write failed" },
      { status: 503, headers: gate.headers },
    );
  }
}
