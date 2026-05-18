// GET /api/admin/lseg-status — LSEG World-Check credential health check.
//
// Reports whether the LSEG credentials are configured and whether the
// CFS bulk-data index has been built, WITHOUT exposing key values.
// Use /api/admin/import-cfs to build the index from CFS files.
//
// Auth: Bearer ADMIN_TOKEN.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface BlobStoreShape {
  get: (key: string, opts?: { type?: string }) => Promise<unknown>;
}
interface BlobsModuleShape {
  getStore: (opts: { name: string; siteID?: string; token?: string; consistency?: string }) => BlobStoreShape;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Check credential presence — never expose values.
  const apiKeySet = Boolean(process.env["LSEG_WORLDCHECK_API_KEY"]);
  const apiSecretSet = Boolean(process.env["LSEG_WORLDCHECK_API_SECRET"]);
  const appKeySet = Boolean(process.env["LSEG_APP_KEY"]);
  const usernameSet = Boolean(process.env["LSEG_USERNAME"]);
  const fullyConfigured = apiKeySet && apiSecretSet;

  // Read CFS index manifest from Netlify Blobs.
  let cfsIndexed = 0;
  let cfsBuiltAt: string | undefined;
  let cfsEntities = 0;
  try {
    const blobsMod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    const storeOpts: { name: string; siteID?: string; token?: string; consistency: string } = {
      name: "hawkeye-lseg-pep-index",
      consistency: "strong",
    };
    if (siteID) storeOpts.siteID = siteID;
    if (token) storeOpts.token = token;
    const store = blobsMod.getStore(storeOpts);
    const manifest = (await store.get("manifest.json", { type: "json" })) as {
      entitiesIndexed?: number;
      builtAt?: string;
      filesProcessed?: number;
    } | null;
    if (manifest) {
      cfsIndexed = manifest.filesProcessed ?? 0;
      cfsEntities = manifest.entitiesIndexed ?? 0;
      cfsBuiltAt = manifest.builtAt;
    }
  } catch {
    // Blobs unreachable or index not yet built — fall through.
  }

  const liveApiStatus = fullyConfigured
    ? "configured — live ~5M-record World-Check PEP/sanctions feed active"
    : apiKeySet
      ? "partial — LSEG_WORLDCHECK_API_SECRET missing"
      : "unconfigured — set LSEG_WORLDCHECK_API_KEY and LSEG_WORLDCHECK_API_SECRET";

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    lsegWorldCheck: {
      credentials: {
        apiKeyConfigured: apiKeySet,
        apiSecretConfigured: apiSecretSet,
        appKeyConfigured: appKeySet,
        usernameConfigured: usernameSet,
        fullyConfigured,
      },
      liveApi: {
        status: liveApiStatus,
        note: "Key values are never returned by this endpoint.",
      },
      cfsIndex: {
        built: cfsEntities > 0,
        entitiesIndexed: cfsEntities,
        filesProcessed: cfsIndexed,
        ...(cfsBuiltAt ? { builtAt: cfsBuiltAt } : {}),
        note: cfsEntities === 0
          ? "CFS index not built — run POST /api/admin/import-cfs to index LSEG CFS bulk files."
          : `CFS index contains ${cfsEntities.toLocaleString("en-US")} entities from ${cfsIndexed} files.`,
      },
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, OPTIONS" },
  });
}
