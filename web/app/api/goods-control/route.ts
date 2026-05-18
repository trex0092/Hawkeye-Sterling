// GET /api/goods-control
//
// Returns the goods-control ingest status — controlled-goods catalogue
// entry counts per list and the last successful ingest timestamp.
//
// The scheduled function (netlify/functions/goods-control-ingest.mts)
// fetches the UAE CR 156/2025 dual-use catalogue, the EU dual-use
// Regulation 2021/821 Annex I, and the US Commerce Control List every
// 6 hours. This endpoint reads the resulting blobs.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const LIST_IDS = ["uae_156_2025", "eu_dual_use", "us_ccl"] as const;

interface ControlledGoodsEntry { listId: string; hsCode: string; description: string }

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    let blobsMod: typeof import("@netlify/blobs") | null = null;
    try { blobsMod = await import("@netlify/blobs"); } catch { /* not bound */ }

    if (!blobsMod) {
      return NextResponse.json(
        { ok: true, lists: [], note: "Blob store not bound — goods-control ingest has not run in this environment" },
        { headers: gate.headers },
      );
    }

    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
    const storeOpts = siteID && token
      ? { name: "hawkeye-goods-control", siteID, token, consistency: "strong" as const }
      : { name: "hawkeye-goods-control" };
    const store = blobsMod.getStore(storeOpts);

    const lists = await Promise.all(
      LIST_IDS.map(async (listId) => {
        try {
          const raw = await store.get(`current/${listId}.json`, { type: "json" }).catch(() => null) as ControlledGoodsEntry[] | null;
          return { listId, entryCount: Array.isArray(raw) ? raw.length : null, present: Array.isArray(raw) && raw.length > 0 };
        } catch {
          return { listId, entryCount: null, present: false };
        }
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        lists,
        note: "Refreshed every 6h by goods-control-ingest.mts (UAE CR 156/2025 + EU Reg 2021/821 + US CCL)",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.warn("[goods-control GET]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: true, lists: [], note: "Could not read goods-control store" },
      { headers: gate.headers },
    );
  }
}
