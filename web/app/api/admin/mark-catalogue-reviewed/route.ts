// POST /api/admin/mark-catalogue-reviewed
//
// MLRO-facing self-service action: marks the brain catalogue as reviewed
// today, clearing the "over 30 days ago" warning on /api/status. Writes
// the timestamp to a Blob so the action persists across deploys without
// requiring an env-var change. /api/status reads this Blob first and
// falls back to the BRAIN_REVIEWED_AT env var when the Blob is absent.
//
// Auth: Bearer ADMIN_TOKEN. Optional `?reviewer=<name>&note=<text>` query
// params are persisted to the Blob alongside the timestamp for audit.
// Optional `?date=YYYY-MM-DD` to backdate (e.g. when recording a review
// that happened earlier today before this endpoint existed).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => {
    setJSON: (key: string, value: unknown) => Promise<void>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
}

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("crypto");
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(got);
  const ab = new Uint8Array(a.length);
  ab.set(b.slice(0, a.length));
  return timingSafeEqual(a, ab);
}

function credentials(): { siteID?: string; token?: string } {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const requestedDate = url.searchParams.get("date") ?? "";
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);
  const date = isValidDate ? requestedDate : today;
  const reviewer = url.searchParams.get("reviewer")?.slice(0, 200) ?? "anonymous";
  const note = url.searchParams.get("note")?.slice(0, 1_000) ?? "";

  let mod: BlobsModuleShape;
  try {
    mod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `@netlify/blobs unavailable — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  const creds = credentials();
  const store = mod.getStore({
    name: "hawkeye-brain-governance",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });

  const entry = {
    reviewedAt: date,
    reviewer,
    note,
    recordedAt: new Date().toISOString(),
    recordedBy: "POST /api/admin/mark-catalogue-reviewed",
  };
  try {
    await store.setJSON("catalogue-reviewed-at.json", entry);
    // Also append an audit-log entry so we have history, not just the latest.
    const ts = entry.recordedAt.replace(/[:.]/g, "-");
    await store.setJSON(`catalogue-review-history/${ts}.json`, entry);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `blob write failed — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...entry,
    hint: "/api/status will now report reviewedAt = " + date + " — the 30-day-stale warning clears immediately.",
  });
}
