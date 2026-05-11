export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export interface CtrStructuringResult {
  structuringDetected: boolean;
  structuringRisk: "critical" | "high" | "medium" | "low" | "none";
  ctrRequired: boolean;
  ctrCount: number;
  ctrThresholdAed: number;
  smurfingPattern: boolean;
  patternDescription: string;
  totalValueAed: number;
  periodDays: number;
  averageTransactionAed: number;
  thresholdProximityPct: number;
  transactions: Array<{
    amount: number;
    date?: string;
    type?: string;
    proximityToCtrPct: number;
    flag: boolean;
  }>;
  structuringBands: Array<{ band: string; count: number; totalAed: number }>;
  recommendedAction: "file_ctr_and_str" | "file_str" | "file_ctr" | "escalate_mlro" | "monitor" | "clear";
  actionRationale: string;
  ctrDeadline?: string;
  strBasis?: string;
  regulatoryBasis: string;
}

function parseCash(raw: string): number[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => parseFloat(s.replace(/[^0-9.]/g, "")))
    .filter((n) => !isNaN(n) && n > 0);
}

const CTR_THRESHOLD = 55000;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    amounts: string;
    currency?: string;
    periodDays?: number;
    transactionDates?: string;
    transactionTypes?: string;
    subjectName?: string;
    accountRef?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.amounts?.trim()) return NextResponse.json({ ok: false, error: "amounts required" }, { status: 400 });

  const amounts = parseCash(body.amounts);
  if (amounts.length === 0) return NextResponse.json({ ok: false, error: "No valid amounts parsed" }, { status: 400 });

  const periodDays = body.periodDays ?? 30;
  const totalValueAed = amounts.reduce((s, a) => s + a, 0);
  const averageTransactionAed = totalValueAed / amounts.length;
  const ctrRequiredTxns = amounts.filter((a) => a >= CTR_THRESHOLD);
  const ctrCount = ctrRequiredTxns.length;
  const ctrRequired = ctrCount > 0;

  const nearThreshold = amounts.filter((a) => a >= CTR_THRESHOLD * 0.8 && a < CTR_THRESHOLD);
  const smurfingPattern = nearThreshold.length >= 2 && nearThreshold.length / amounts.length >= 0.4;

  const maxProximity = Math.max(...amounts.map((a) => (a < CTR_THRESHOLD ? (a / CTR_THRESHOLD) * 100 : 0)));

  const transactions = amounts.map((amount, i) => ({
    amount,
    date: undefined as string | undefined,
    type: undefined as string | undefined,
    proximityToCtrPct: amount < CTR_THRESHOLD ? Math.round((amount / CTR_THRESHOLD) * 100) : 100,
    flag: amount >= CTR_THRESHOLD * 0.8 || amount >= CTR_THRESHOLD,
  }));

  const bands = [
    { band: `AED 0–${(CTR_THRESHOLD * 0.5).toLocaleString()}`, min: 0, max: CTR_THRESHOLD * 0.5 },
    { band: `AED ${(CTR_THRESHOLD * 0.5).toLocaleString()}–${(CTR_THRESHOLD * 0.79).toLocaleString()}`, min: CTR_THRESHOLD * 0.5, max: CTR_THRESHOLD * 0.79 },
    { band: `AED ${(CTR_THRESHOLD * 0.8).toLocaleString()}–${(CTR_THRESHOLD - 1).toLocaleString()} (sub-threshold zone)`, min: CTR_THRESHOLD * 0.8, max: CTR_THRESHOLD - 1 },
    { band: `AED ${CTR_THRESHOLD.toLocaleString()}+ (CTR required)`, min: CTR_THRESHOLD, max: Infinity },
  ];
  const structuringBands = bands.map(({ band, min, max }) => {
    const inBand = amounts.filter((a) => a >= min && a <= max);
    return { band, count: inBand.length, totalAed: inBand.reduce((s, a) => s + a, 0) };
  });

  let structuringRisk: CtrStructuringResult["structuringRisk"] = "none";
  if (smurfingPattern && nearThreshold.length >= 4) structuringRisk = "critical";
  else if (smurfingPattern && nearThreshold.length >= 2) structuringRisk = "high";
  else if (nearThreshold.length === 1) structuringRisk = "medium";
  else if (maxProximity >= 60) structuringRisk = "low";

  const structuringDetected = structuringRisk === "critical" || structuringRisk === "high";

  let recommendedAction: CtrStructuringResult["recommendedAction"] = "clear";
  if (ctrRequired && structuringDetected) recommendedAction = "file_ctr_and_str";
  else if (structuringDetected) recommendedAction = "file_str";
  else if (ctrRequired) recommendedAction = "file_ctr";
  else if (structuringRisk === "medium") recommendedAction = "escalate_mlro";
  else if (structuringRisk === "low") recommendedAction = "monitor";

  const patternDescription = structuringDetected
    ? `${nearThreshold.length} of ${amounts.length} transactions fall in the AED ${Math.round(CTR_THRESHOLD * 0.8).toLocaleString()}–${(CTR_THRESHOLD - 1).toLocaleString()} sub-threshold zone (${Math.round((nearThreshold.length / amounts.length) * 100)}% of volume), consistent with deliberate avoidance of the AED 55,000 CTR obligation under UAE FDL 10/2025 Art.17.`
    : ctrRequired
    ? `${ctrCount} transaction(s) meet or exceed the AED 55,000 CTR threshold requiring mandatory reporting.`
    : `No structuring pattern detected. Transactions spread across normal distribution bands.`;

  const actionRationale = recommendedAction === "file_ctr_and_str"
    ? `CTR filing required for ${ctrCount} transaction(s) at/above AED 55,000 (FDL 10/2025 Art.17). Separately, structuring pattern constitutes reasonable grounds for STR suspicion under FDL 10/2025 Art.26 — structuring is a predicate ML offence under Federal Law 4/2002.`
    : recommendedAction === "file_str"
    ? `Structuring pattern meets the suspicion threshold for STR filing under FDL 10/2025 Art.26. No threshold applies. Structuring (smurfing) is a predicate ML offence (Federal Law 4/2002 Art.2). File STR within 2 business days of MLRO determination.`
    : recommendedAction === "file_ctr"
    ? `${ctrCount} transaction(s) at/above AED 55,000 require mandatory CTR filing under FDL 10/2025 Art.17. No structuring pattern detected.`
    : recommendedAction === "escalate_mlro"
    ? `Borderline proximity to threshold warrants MLRO review to determine whether a suspicious pattern can be established. Monitor for further sub-threshold deposits.`
    : "Transaction pattern does not meet STR or CTR filing thresholds at this stage.";

  const result: CtrStructuringResult = {
    structuringDetected,
    structuringRisk,
    ctrRequired,
    ctrCount,
    ctrThresholdAed: CTR_THRESHOLD,
    smurfingPattern,
    patternDescription,
    totalValueAed,
    periodDays,
    averageTransactionAed: Math.round(averageTransactionAed),
    thresholdProximityPct: Math.round(maxProximity),
    transactions,
    structuringBands,
    recommendedAction,
    actionRationale,
    ...(ctrRequired && { ctrDeadline: "Same business day or next business day (FDL 10/2025 Art.17)" }),
    ...(structuringDetected && { strBasis: "UAE FDL 10/2025 Art.26; Federal Law 4/2002 Art.2 (structuring as ML predicate); FATF R.20" }),
    regulatoryBasis: "UAE FDL 10/2025 Art.17 (CTR ≥ AED 55,000); Art.26 (STR — no threshold); Federal Law 4/2002 Art.2 (ML predicates including structuring); FATF R.20; CBUAE Anti-Money Laundering Guidelines 2021",
  };

  return NextResponse.json({ ok: true, ...result });
}
