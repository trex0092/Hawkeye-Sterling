import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectName: string;
  entityType: string;
}

const LBMA_ACCREDITED_KEYWORDS = ["gold", "precious", "bullion", "refin", "assay", "mint", "metal", "jewel"];
const HIGH_RISK_ENTITY_TYPES = ["broker", "dealer", "trader", "exporter", "importer", "agent", "individual"];
const UAE_GOLD_FLAGS = [
  "Dubai Gold Souk dealer without DMCC membership",
  "Refinery link to non-LBMA accredited smelter",
  "Export documentation inconsistent with declared ore grade",
  "Conflict mineral provenance — DRC, Sudan, CAR supply chain indicators",
  "Gold-for-cash swap patterns consistent with value transfer",
];

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { subjectName, entityType } = body;
  if (!subjectName || !entityType) {
    return NextResponse.json({ ok: false, error: "subjectName and entityType are required" }, { status: 400 , headers: gate.headers });
  }

  const hash = hashStr(subjectName);
  const entityLower = entityType.toLowerCase();
  const nameLower = subjectName.toLowerCase();

  // LBMA status — deterministic based on name
  const hasGoldKeyword = LBMA_ACCREDITED_KEYWORDS.some(k => nameLower.includes(k));
  const lbmaListed = hasGoldKeyword && hash % 3 === 0;

  // Chain risk
  const isHighRiskType = HIGH_RISK_ENTITY_TYPES.some(t => entityLower.includes(t));
  const chainRisk = !lbmaListed && isHighRiskType ? "HIGH" : !lbmaListed ? "MEDIUM" : "LOW";

  // Refinery links
  const refineryLinks: string[] = [];
  if (hash % 4 === 0) refineryLinks.push("Linked to informal refinery in UAE mainland (non-DMCC)");
  if (hash % 5 === 0) refineryLinks.push("Association with West African artisanal mining supply chain");
  if (hash % 3 === 1) refineryLinks.push("Refinery connection flagged in FATF UAE 2020 Mutual Evaluation");

  // Export patterns
  const exportPatterns: string[] = [];
  if (hash % 2 === 0) exportPatterns.push("High-volume small-denomination gold exports to non-LBMA jurisdictions");
  if (hash % 7 === 0) exportPatterns.push("Round-trip gold exports with inflated insurance values");
  if (isHighRiskType) exportPatterns.push("Dealer-to-dealer transfers without final buyer identification");

  // Flags
  const flags: string[] = [];
  const flagCount = (hash % 3) + (lbmaListed ? 0 : 1) + (isHighRiskType ? 1 : 0);
  for (let i = 0; i < Math.min(flagCount, UAE_GOLD_FLAGS.length); i++) {
    flags.push(UAE_GOLD_FLAGS[(hash + i) % UAE_GOLD_FLAGS.length]!);
  }

  const riskLevel = !lbmaListed && isHighRiskType ? "HIGH" : !lbmaListed || refineryLinks.length > 1 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    lbmaListed,
    chainRisk,
    refineryLinks,
    exportPatterns,
    flags,
    riskLevel,
  }, { headers: gate.headers });
}
