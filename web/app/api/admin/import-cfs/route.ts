// POST /api/admin/import-cfs
//
// Parses every file currently in the hawkeye-lseg-cfs Blob store
// (downloaded by netlify/functions/lseg-cfs-poll.mts every 6 h) using
// the generic LSEG CFS parser, and writes the normalised entities into
// a queryable index at `hawkeye-lseg-pep-index` keyed by primary name.
//
// Use case: closes the deferred "consume LSEG CFS bulk data" workstream.
// After this runs the brain (or any consumer) can look up a name across
// the LSEG-supplied PEP / sanctions / adverse data without each consumer
// re-parsing raw bulk files.
//
// Auth: Bearer ADMIN_TOKEN.
//
// Idempotent: re-running rebuilds the index. Returns parse statistics
// per file so operators see which subscriptions/packages produce useful
// data and which return empty payloads.

import { NextResponse } from "next/server";
import { parseCfsPayload } from "@/lib/lseg/cfs-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => {
    list: (opts?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
    setJSON: (key: string, value: unknown) => Promise<void>;
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
  const cfsStore = mod.getStore({
    name: "hawkeye-lseg-cfs",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  const indexStore = mod.getStore({
    name: "hawkeye-lseg-pep-index",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });

  // Parser is statically imported above — Next.js handles bundling.

  // List all files written by lseg-cfs-poll.
  let fileKeys: string[] = [];
  try {
    const listing = await cfsStore.list({ prefix: "files/" });
    fileKeys = (listing.blobs ?? []).map((b) => b.key);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `cfs store list failed — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  if (fileKeys.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      indexed: 0,
      hint: "No CFS files in store. Run /.netlify/functions/lseg-cfs-poll first (cron fires every 6 h) or check your CFS subscription entitles bulk packages.",
    });
  }

  // Parse each file in parallel (bounded by 4 concurrent).
  interface PerFile {
    key: string;
    format: string;
    entityCount: number;
    error?: string;
  }
  interface IndexedEntity {
    id: string;
    primaryName: string;
    aliases: string[];
    categories: string[];
    sourceFile: string;
  }
  const perFile: PerFile[] = [];
  const allEntities = new Map<string, IndexedEntity>();

  const CONCURRENCY = 4;
  for (let i = 0; i < fileKeys.length; i += CONCURRENCY) {
    const batch = fileKeys.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (key) => {
      try {
        const payload = await cfsStore.get(key, { type: "text" }) as string | null;
        if (!payload) {
          perFile.push({ key, format: "unknown", entityCount: 0, error: "empty payload" });
          return;
        }
        const parsed = parseCfsPayload(payload, key);
        const entry: PerFile = { key, format: parsed.format, entityCount: parsed.entities.length };
        if (parsed.error) entry.error = parsed.error;
        perFile.push(entry);
        for (const e of parsed.entities) {
          const k = e.primaryName.toLowerCase();
          if (!allEntities.has(k)) {
            allEntities.set(k, {
              id: e.id,
              primaryName: e.primaryName,
              aliases: e.aliases,
              categories: e.categories,
              sourceFile: key,
            });
          }
        }
      } catch (err) {
        perFile.push({
          key,
          format: "unknown",
          entityCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));
  }

  // Write the consolidated index. One blob per first-letter bucket so a
  // lookup doesn't require loading all entities into memory at query time.
  // Index manifest: list of buckets + total count + per-file summary.
  const byBucket = new Map<string, IndexedEntity[]>();
  for (const e of allEntities.values()) {
    const firstChar = e.primaryName.charAt(0).toLowerCase();
    const bucket = /[a-z]/.test(firstChar) ? firstChar : "_";
    const list = byBucket.get(bucket);
    if (list) {
      list.push(e);
    } else {
      byBucket.set(bucket, [e]);
    }
  }
  try {
    for (const [bucket, entries] of byBucket) {
      await indexStore.setJSON(`bucket/${bucket}.json`, entries);
    }
    await indexStore.setJSON("manifest.json", {
      builtAt: new Date().toISOString(),
      filesProcessed: perFile.length,
      entitiesIndexed: allEntities.size,
      buckets: Array.from(byBucket.keys()).sort(),
      perFile,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        filesProcessed: perFile.length,
        entitiesParsed: allEntities.size,
        error: `index write failed — ${err instanceof Error ? err.message : String(err)}`,
        perFile,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    filesProcessed: perFile.length,
    entitiesIndexed: allEntities.size,
    buckets: Array.from(byBucket.keys()).sort(),
    perFile,
    hint:
      allEntities.size === 0
        ? "Files parsed but no entities extracted — formats may differ from the assumed JSON/XML/CSV layouts. Inspect perFile[].format and perFile[].error to identify schemas the parser doesn't yet handle."
        : "Index written to hawkeye-lseg-pep-index Blob store. Consumers should look up by first-letter bucket key.",
  });
}
