// GET /api/lseg/cfs-files
//
// Operator-facing inventory of the LSEG CFS bulk data already downloaded
// by `netlify/functions/lseg-cfs-poll.mts` and persisted to the
// `hawkeye-lseg-cfs` Netlify Blob store. Lists buckets, filesets, files,
// and per-bucket checkpoints — without exposing the file contents
// themselves (those can be large; this endpoint is for "what do we have?"
// not "give me the data").
//
// Use case: the lseg-cfs-poll function runs every 6 h and downloads
// entitled bulk files, but no downstream code consumes them yet (the
// "wire LSEG CFS into a queryable PEP/sanctions index" item on the
// deferred list). This endpoint is the first step — it surfaces what's
// in the store so we know which CFS packages your subscription holds and
// can design the consumer accordingly.
//
// Auth: same `enforce` gate as the rest of the operator surface.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

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
    list: (opts?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string; size?: number }> }>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
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

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let mod: BlobsModuleShape;
  try {
    mod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `@netlify/blobs unavailable — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 503, headers: gate.headers },
    );
  }

  const creds = credentials();
  const store = mod.getStore({
    name: "hawkeye-lseg-cfs",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });

  // Inventory the four key prefixes the poll function writes to:
  //   checkpoint/<bucket>            — ISO timestamp of last successful poll
  //   filesets/<bucket>/<id>.json    — raw fileset metadata
  //   files/<bucket>/<fileId>.dat    — raw file content (size only, no body)
  //   news/latest.json               — news headlines snapshot
  //   alerts/latest.json             — corporate alerts snapshot
  let checkpoints: Array<{ bucket: string; lastPolled: string | null }> = [];
  let filesets: Array<{ bucket: string; id: string; size?: number }> = [];
  let files: Array<{ bucket: string; fileId: string; size?: number }> = [];
  let newsPresent = false;
  let alertsPresent = false;

  try {
    const checkpointList = await store.list({ prefix: "checkpoint/" });
    checkpoints = await Promise.all(
      (checkpointList.blobs ?? []).map(async (b) => {
        const bucket = b.key.replace(/^checkpoint\//, "");
        const v = (await store.get(b.key, { type: "text" }).catch(() => null)) as string | null;
        return { bucket, lastPolled: v ?? null };
      }),
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `checkpoint list failed — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 503, headers: gate.headers },
    );
  }

  try {
    const filesetList = await store.list({ prefix: "filesets/" });
    filesets = (filesetList.blobs ?? []).slice(0, 100).map((b) => {
      const parts = b.key.replace(/^filesets\//, "").split("/");
      const out: { bucket: string; id: string; size?: number } = {
        bucket: parts[0] ?? "",
        id: parts.slice(1).join("/").replace(/\.json$/, ""),
      };
      if (typeof b.size === "number") out.size = b.size;
      return out;
    });
  } catch { /* non-fatal */ }

  try {
    const fileList = await store.list({ prefix: "files/" });
    files = (fileList.blobs ?? []).slice(0, 100).map((b) => {
      const parts = b.key.replace(/^files\//, "").split("/");
      const out: { bucket: string; fileId: string; size?: number } = {
        bucket: parts[0] ?? "",
        fileId: parts.slice(1).join("/").replace(/\.dat$/, ""),
      };
      if (typeof b.size === "number") out.size = b.size;
      return out;
    });
  } catch { /* non-fatal */ }

  try {
    const news = await store.get("news/latest.json", { type: "text" });
    newsPresent = news !== null && typeof news === "string" && news.length > 0;
  } catch { /* non-fatal */ }

  try {
    const alerts = await store.get("alerts/latest.json", { type: "text" });
    alertsPresent = alerts !== null && typeof alerts === "string" && alerts.length > 0;
  } catch { /* non-fatal */ }

  const buckets = Array.from(new Set([
    ...checkpoints.map((c) => c.bucket),
    ...filesets.map((f) => f.bucket),
    ...files.map((f) => f.bucket),
  ])).sort();

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        bucketCount: buckets.length,
        checkpointCount: checkpoints.length,
        filesetCount: filesets.length,
        fileCount: files.length,
        newsPresent,
        alertsPresent,
      },
      buckets,
      checkpoints,
      filesets,
      files,
      hint:
        buckets.length === 0
          ? "Empty store. lseg-cfs-poll has not produced any data yet — either the OAuth2 credentials are wrong, the CFS subscription has no entitled packages, or the function has not fired against the current credentials."
          : "Use the bucket names to design downstream consumers. Each bucket corresponds to one LSEG CFS package your subscription entitles.",
    },
    { headers: gate.headers },
  );
}
