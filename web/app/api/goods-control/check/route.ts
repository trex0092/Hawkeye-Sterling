// GET /api/goods-control/check?hsCode=XXXX[&origin=AE][&value=50000]
//
// ENHANCE 6: HS code lookup against controlled-goods lists.
// Returns TBML (trade-based money laundering) risk flag plus any matching
// controlled-goods entries from UAE CR 156/2025, EU Reg 2021/821, and US CCL.
//
// Query parameters:
//   hsCode  — mandatory, 4-10 digit HS code (partial prefix match supported)
//   origin  — optional ISO2 country of origin (used for CAHRA/jurisdiction risk)
//   value   — optional transaction value in AED (used for TBML threshold check)

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const HS_CODE_RE = /^\d{4,10}$/;

// TBML value threshold — transactions > this AED amount warrant enhanced scrutiny.
const TBML_THRESHOLD_AED = 100_000;

interface ControlledGoodsEntry {
  listId: string;
  hsCode: string;
  description: string;
  controlReason?: string;
  licenseRequired?: boolean;
}

interface CheckResult {
  ok: boolean;
  hsCode: string;
  origin?: string;
  valueAed?: number;
  tbmlRisk: "low" | "medium" | "high" | "critical";
  tbmlFlags: string[];
  matches: Array<{
    listId: string;
    listDisplayName: string;
    hsCode: string;
    description: string;
    controlReason?: string;
    licenseRequired?: boolean;
  }>;
  matchCount: number;
  controlledLists: string[];
  checkedAt: string;
}

const LIST_DISPLAY_NAMES: Record<string, string> = {
  uae_156_2025: "UAE Cabinet Resolution 156/2025 (Dual-Use)",
  eu_dual_use: "EU Dual-Use Regulation 2021/821",
  us_ccl: "US Commerce Control List (CCL/EAR)",
};

async function handleGet(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const hsCodeRaw = url.searchParams.get("hsCode")?.trim() ?? "";
  const origin = url.searchParams.get("origin")?.trim().toUpperCase().slice(0, 3) ?? undefined;
  const valueRaw = url.searchParams.get("value")?.trim();
  const valueAed = valueRaw ? parseFloat(valueRaw) : undefined;

  if (!hsCodeRaw || !HS_CODE_RE.test(hsCodeRaw)) {
    return NextResponse.json(
      { ok: false, error: "hsCode required — must be 4-10 digits (e.g. 8542, 8542310000)" },
      { status: 400 },
    );
  }

  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try { blobsMod = await import("@netlify/blobs"); } catch { /* not bound */ }

  const matches: CheckResult["matches"] = [];

  if (blobsMod) {
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
    const storeOpts = siteID && token
      ? { name: "hawkeye-goods-control", siteID, token, consistency: "strong" as const }
      : { name: "hawkeye-goods-control" };
    const store = blobsMod.getStore(storeOpts);

    for (const listId of ["uae_156_2025", "eu_dual_use", "us_ccl"]) {
      try {
        const entries = await store.get(`current/${listId}.json`, { type: "json" }).catch(() => null) as ControlledGoodsEntry[] | null;
        if (!Array.isArray(entries)) continue;
        const listMatches = entries.filter((e) =>
          e.hsCode && (
            e.hsCode.startsWith(hsCodeRaw) ||
            hsCodeRaw.startsWith(e.hsCode.slice(0, Math.min(e.hsCode.length, hsCodeRaw.length)))
          ),
        );
        for (const m of listMatches) {
          matches.push({
            listId,
            listDisplayName: LIST_DISPLAY_NAMES[listId] ?? listId,
            hsCode: m.hsCode,
            description: m.description,
            controlReason: m.controlReason,
            licenseRequired: m.licenseRequired,
          });
        }
      } catch {
        // Non-fatal — skip this list
      }
    }
  }

  // TBML risk assessment
  const tbmlFlags: string[] = [];
  if (matches.length > 0) tbmlFlags.push(`HS code ${hsCodeRaw} appears on ${matches.length} controlled-goods list(s)`);
  if (valueAed != null && valueAed > TBML_THRESHOLD_AED) tbmlFlags.push(`Transaction value AED ${valueAed.toLocaleString()} exceeds TBML threshold`);
  if (origin && ["IR", "KP", "SY", "BY"].includes(origin)) tbmlFlags.push(`Origin country ${origin} is subject to comprehensive sanctions`);

  const tbmlRisk: CheckResult["tbmlRisk"] =
    tbmlFlags.length === 0 ? "low"
    : matches.length > 0 && tbmlFlags.length >= 2 ? "critical"
    : matches.length > 0 ? "high"
    : "medium";

  const result: CheckResult = {
    ok: true,
    hsCode: hsCodeRaw,
    ...(origin ? { origin } : {}),
    ...(valueAed != null && !isNaN(valueAed) ? { valueAed } : {}),
    tbmlRisk,
    tbmlFlags,
    matches,
    matchCount: matches.length,
    controlledLists: [...new Set(matches.map((m) => m.listId))],
    checkedAt: new Date().toISOString(),
  };

  if (matches.length > 0 || tbmlRisk !== "low") {
    void writeAuditChainEntry(
      {
        event: "goods_control.hs_check",
        actor: ctx.apiKey.id,
        hsCode: hsCodeRaw,
        origin,
        tbmlRisk,
        matchCount: matches.length,
        controlledLists: result.controlledLists,
      },
      ctx.tenantId,
    ).catch((err: unknown) =>
      console.warn("[goods-control/check] audit write failed:", err instanceof Error ? err.message : String(err)),
    );
  }

  return NextResponse.json(result);
}

export const GET = withGuard(handleGet);
