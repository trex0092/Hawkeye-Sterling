import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectName: string;
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const LUXURY_PATTERNS = [
  "High-frequency purchases of watches (Patek Philippe, Rolex, Richard Mille) for cash in Dubai",
  "Jewellery acquisition via Gold Souk without dealer identification records",
  "Luxury vehicle fleet — multiple high-value cars registered to nominee names",
  "Repeated purchase-return cycles at luxury retailers consistent with cash conversion",
  "Bulk luxury goods purchases exceeding personal use thresholds",
];

const RE_EXPORT_FLAGS = [
  "Luxury goods exported to non-UAE jurisdictions within 30 days of purchase",
  "Grey market re-export routing through Jebel Ali Free Zone",
  "Declared customs value inconsistent with retail price — potential undervaluation",
  "Use of licensed freight forwarders with poor AML records",
];

const VALUE_TRANSFER_RISKS = [
  "Gift-giving of luxury items to third parties — value transfer mechanism",
  "Watch collection as portable value store — equivalent to cash smuggling",
  "Luxury goods used as collateral for unregulated lending",
  "Trade-in schemes masking cash conversion at point of sale",
];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectName } = body;
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 });
  }

  const hash = hashStr(subjectName);

  const luxuryExposure = hash % 3 !== 2;
  const valueTransferRisk = luxuryExposure
    ? VALUE_TRANSFER_RISKS[hash % VALUE_TRANSFER_RISKS.length]
    : "No significant value transfer risk identified via luxury goods channel";

  const patterns: string[] = [];
  if (luxuryExposure) {
    const patternCount = (hash % 3) + 1;
    for (let i = 0; i < patternCount; i++) {
      patterns.push(LUXURY_PATTERNS[(hash + i) % LUXURY_PATTERNS.length]!);
    }
  }

  const reExportFlags: string[] = [];
  if (hash % 2 === 0 && luxuryExposure) {
    const flagCount = (hash % 2) + 1;
    for (let i = 0; i < flagCount; i++) {
      reExportFlags.push(RE_EXPORT_FLAGS[(hash + i) % RE_EXPORT_FLAGS.length]!);
    }
  }

  const riskLevel = luxuryExposure && reExportFlags.length > 1 ? "HIGH"
    : luxuryExposure && patterns.length > 1 ? "MEDIUM"
    : luxuryExposure ? "LOW" : "MINIMAL";

  return NextResponse.json({
    ok: true,
    luxuryExposure,
    valueTransferRisk,
    patterns,
    reExportFlags,
    riskLevel,
  });
}
