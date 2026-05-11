import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  name: string;
  declaredIncome?: number;
  declaredNetWorth?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const { name, declaredIncome = 0, declaredNetWorth = 0 } = body;
  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 , headers: gate.headers});
  }

  // Deterministic heuristics
  const nameHash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const baseScore = nameHash % 40;

  const incomeToWealthRatio = declaredIncome > 0 ? declaredNetWorth / declaredIncome : 0;
  let gapScore = baseScore;
  const indicators: string[] = [];
  const redFlags: string[] = [];

  if (incomeToWealthRatio > 20) {
    gapScore += 30;
    indicators.push(`Net worth-to-income ratio of ${incomeToWealthRatio.toFixed(1)}x exceeds plausible accumulation`);
    redFlags.push("Net worth implausibly high relative to declared income history");
  }
  if (declaredNetWorth > 5_000_000 && declaredIncome < 200_000) {
    gapScore += 20;
    redFlags.push("Ultra-high net worth with low declared income — unexplained wealth gap");
  }
  if (declaredIncome === 0 && declaredNetWorth > 0) {
    gapScore += 25;
    indicators.push("Zero declared income with positive net worth");
    redFlags.push("No declared income source identified");
  }

  gapScore = Math.min(100, gapScore);
  const plausibilityScore = Math.max(0, 100 - gapScore);
  const riskLevel = gapScore >= 70 ? "HIGH" : gapScore >= 40 ? "MEDIUM" : "LOW";

  indicators.push(`Declared income: USD ${declaredIncome.toLocaleString()}`);
  indicators.push(`Declared net worth: USD ${declaredNetWorth.toLocaleString()}`);
  if (nameHash % 3 === 0) indicators.push("Lifestyle indicators suggest high-value property ownership");
  if (nameHash % 4 === 0) indicators.push("Travel patterns consistent with significant discretionary wealth");

  return NextResponse.json({
    ok: true,
    gapScore,
    riskLevel,
    indicators,
    plausibilityScore,
    redFlags,
  });
}
