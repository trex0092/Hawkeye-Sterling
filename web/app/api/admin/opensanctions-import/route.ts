// POST /api/admin/opensanctions-import
//
// Uploads the OpenSanctions consolidated dataset JSON to the
// `hawkeye-opensanctions` Netlify Blobs key. The web/lib/intelligence/
// openSanctions.ts adapter reads from this key on first lookup per warm
// Lambda. This route is the operator-facing entrypoint for refreshing
// the corpus.
//
// Why an admin upload route instead of bundling the JSON: the dataset
// is ~47 MB. Bundling exceeded Netlify's Lambda compressed-size limit
// and broke the deploy (see PR #509 / #510 history). Storing in Blobs
// keeps the bundle small and decouples data refresh from code deploys.
//
// Auth: Bearer ADMIN_TOKEN.
//
// Request body: the consolidated JSON array (output of
// `scripts/refresh-opensanctions.cjs`). Content-Type: application/json.
// Max body size: ~80 MB (Netlify default Lambda payload limit).
//
// Response on success:
//   { ok: true, count, sizeBytes, sample: { id, name, schema } }

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_NAME = "hawkeye-opensanctions";
const BLOB_KEY = "sanctions.json";

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(got);
  const ab = new Uint8Array(a.length);
  ab.set(b.slice(0, a.length));
  return timingSafeEqual(a, ab);
}

interface OpenSanctionsRecord {
  id?: string;
  schema?: string;
  name?: string;
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

  // Stream the body to text first so we can validate before parsing all 47 MB.
  let text: string;
  try {
    text = await req.text();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `failed to read request body: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }
  if (!text || text.length < 100) {
    return NextResponse.json(
      { ok: false, error: "request body too small — expected the full OpenSanctions JSON array" },
      { status: 400 },
    );
  }

  let records: OpenSanctionsRecord[];
  try {
    records = JSON.parse(text) as OpenSanctionsRecord[];
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `body is not valid JSON: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "body must be a non-empty JSON array of OpenSanctions records" },
      { status: 400 },
    );
  }
  // Sanity: first record should have id + name + schema.
  const first = records[0];
  if (!first || typeof first.id !== "string" || typeof first.name !== "string" || typeof first.schema !== "string") {
    return NextResponse.json(
      { ok: false, error: "records must have { id, schema, name } at minimum — first record fails validation" },
      { status: 400 },
    );
  }

  let mod: typeof import("@netlify/blobs");
  try {
    mod = await import("@netlify/blobs");
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `@netlify/blobs unavailable — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const opts: { name: string; siteID?: string; token?: string; consistency: "strong" } = {
    name: STORE_NAME,
    consistency: "strong",
  };
  if (siteID) opts.siteID = siteID;
  if (token) opts.token = token;

  try {
    const store = mod.getStore(opts);
    // Write the validated text (already JSON-parsed once for validation).
    await store.set(BLOB_KEY, text);
    return NextResponse.json({
      ok: true,
      count: records.length,
      sizeBytes: text.length,
      sample: { id: first.id, name: first.name, schema: first.schema },
      hint: "Adapter will pick up the new dataset on next cold-start or after evicting the per-Lambda cache (typically <15 min idle).",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Blobs write failed — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }
}
