import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  name: string;
  jurisdiction?: string;
}

interface LitCase {
  court: string;
  year: string;
  type: string;
  outcome: string;
  risk: string;
}

const COURT_MAP: Record<string, string[]> = {
  UAE: ["Dubai Courts", "Abu Dhabi Civil Court", "DIFC Courts", "ADGM Courts"],
  UK: ["High Court (Chancery)", "Commercial Court", "Crown Court", "Court of Appeal"],
  US: ["SDNY", "EDNY", "D.C. District Court", "S.D. Fla."],
  default: ["Commercial High Court", "Supreme Court", "Court of First Instance"],
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { name, jurisdiction = "UAE" } = body;
  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 , headers: gate.headers });
  }

  // Deterministic heuristic based on name hash
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const caseCount = hash % 5; // 0-4 cases
  const courts = COURT_MAP[jurisdiction] ?? COURT_MAP["default"] ?? ["Commercial High Court"];

  const caseTypes = ["Fraud", "Contract Dispute", "Asset Recovery", "Insolvency", "Regulatory Breach", "Money Laundering"];
  const outcomes = ["Settled", "Judgment Against", "Dismissed", "Ongoing", "Default Judgment"];
  const riskLevels = ["HIGH", "MEDIUM", "LOW"];

  const cases: LitCase[] = [];
  for (let i = 0; i < caseCount; i++) {
    const seed = hash + i * 31;
    cases.push({
      court: courts[seed % courts.length]!,
      year: String(2015 + (seed % 9)),
      type: caseTypes[seed % caseTypes.length]!,
      outcome: outcomes[(seed * 7) % outcomes.length]!,
      risk: riskLevels[seed % riskLevels.length]!,
    });
  }

  const riskLevel = caseCount >= 3 ? "HIGH" : caseCount >= 1 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    cases,
    totalCount: caseCount,
    riskLevel,
  }, { headers: gate.headers });
}
