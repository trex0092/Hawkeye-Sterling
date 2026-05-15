// POST /api/structuring-predict
//
// Analyses a 30-day transaction history to predict structuring activity
// BEFORE the CTR/threshold-reporting threshold is formally triggered.
//
// Detection methods:
//   1. Smurfing detection — multiple sub-threshold transactions summing to >threshold
//   2. Velocity analysis — abnormal transaction frequency in rolling windows
//   3. Round-number clustering — suspicious preference for round amounts
//   4. Threshold proximity — amounts just below reporting limits
//   5. Counterparty diversification — spreading same total across multiple parties
//   6. FATF Typology R.3 / UAE CTR threshold (AED 55,000 / USD 15,000)
//
// Returns: structuring probability, detected patterns, FATF typology matches,
// and evidence-grade indicators ready for SAR filing.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Transaction {
  date: string;          // ISO date string
  amount: number;        // in local currency
  currency: string;
  type: "cash_in" | "cash_out" | "wire_in" | "wire_out" | "gold_purchase" | "gold_sale" | "other";
  counterparty?: string;
  reference?: string;
  channel?: "branch" | "atm" | "online" | "agent";
}

interface StructuringRequest {
  transactions: Transaction[];
  subjectName?: string;
  baseCurrency?: string;   // default AED
  reportingThreshold?: number; // default 55000 AED (UAE CTR threshold)
  jurisdictionRisk?: "low" | "medium" | "high" | "critical";
}

const DEFAULT_THRESHOLD_AED = 55_000;
const DEFAULT_THRESHOLD_USD = 15_000;
const ROUND_NUMBER_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

function analyzeStructuring(txns: Transaction[], threshold: number): {
  structuringScore: number;
  patterns: Array<{ pattern: string; severity: "high" | "medium" | "low"; evidence: string; transactions: string[] }>;
  totalVolume: number;
  txnCount: number;
  averageAmount: number;
  smurfingGroups: Array<{ window: string; transactions: Transaction[]; total: number; percentOfThreshold: number }>;
} {
  const patterns: Array<{ pattern: string; severity: "high" | "medium" | "low"; evidence: string; transactions: string[] }> = [];
  let structuringScore = 0;

  // Sort by date
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  const totalVolume = sorted.reduce((s, t) => s + t.amount, 0);
  const averageAmount = txns.length > 0 ? totalVolume / txns.length : 0;

  // 1. Threshold proximity — amounts just below reporting limit
  const proximityTxns = sorted.filter((t) => t.amount >= threshold * 0.85 && t.amount < threshold);
  if (proximityTxns.length >= 2) {
    structuringScore += 25;
    patterns.push({
      pattern: "threshold_proximity",
      severity: "high",
      evidence: `${proximityTxns.length} transactions between ${Math.round(threshold * 0.85).toLocaleString()} and ${(threshold - 1).toLocaleString()} — just below reporting threshold`,
      transactions: proximityTxns.map((t) => `${t.date}: ${t.amount.toLocaleString()} ${t.currency}`),
    });
  } else if (proximityTxns.length === 1) {
    structuringScore += 10;
    patterns.push({
      pattern: "threshold_proximity",
      severity: "medium",
      evidence: "1 transaction just below reporting threshold",
      transactions: proximityTxns.map((t) => `${t.date}: ${t.amount.toLocaleString()} ${t.currency}`),
    });
  }

  // 2. Smurfing — rolling 7-day window exceeds threshold via multiple small txns
  const smurfingGroups: Array<{ window: string; transactions: Transaction[]; total: number; percentOfThreshold: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i]?.date;
    if (!windowStart) continue;
    const windowEnd = new Date(new Date(windowStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
    const windowTxns = sorted.filter((t) => t.date >= windowStart && t.date <= windowEnd && t.amount < threshold);
    const windowTotal = windowTxns.reduce((s, t) => s + t.amount, 0);
    if (windowTotal >= threshold && windowTxns.length >= 3) {
      const existing = smurfingGroups.find((g) => g.window === windowStart);
      if (!existing) {
        smurfingGroups.push({
          window: `${windowStart} to ${windowEnd}`,
          transactions: windowTxns,
          total: windowTotal,
          percentOfThreshold: Math.round((windowTotal / threshold) * 100),
        });
      }
    }
  }
  if (smurfingGroups.length >= 2) {
    structuringScore += 35;
    patterns.push({
      pattern: "smurfing_detected",
      severity: "high",
      evidence: `${smurfingGroups.length} rolling 7-day windows where multiple sub-threshold transactions aggregate to >${(threshold).toLocaleString()} — classic smurfing pattern`,
      transactions: smurfingGroups.flatMap((g) => g.transactions.map((t) => `${t.date}: ${t.amount.toLocaleString()}`)),
    });
  } else if (smurfingGroups.length === 1) {
    structuringScore += 20;
    patterns.push({
      pattern: "smurfing_suspected",
      severity: "medium",
      evidence: "1 rolling 7-day window with sub-threshold transactions aggregating above reporting limit",
      transactions: (smurfingGroups[0]?.transactions ?? []).map((t) => `${t.date}: ${t.amount.toLocaleString()}`),
    });
  }

  // 3. Round-number clustering
  const roundTxns = sorted.filter((t) => ROUND_NUMBER_AMOUNTS.some((r) => t.amount === r || t.amount % r === 0 && t.amount >= 5000));
  if (roundTxns.length >= 3 && roundTxns.length / sorted.length >= 0.5) {
    structuringScore += 15;
    patterns.push({
      pattern: "round_number_preference",
      severity: "medium",
      evidence: `${roundTxns.length}/${sorted.length} transactions (${Math.round(roundTxns.length / sorted.length * 100)}%) are suspiciously round amounts`,
      transactions: roundTxns.slice(0, 5).map((t) => `${t.date}: ${t.amount.toLocaleString()}`),
    });
  }

  // 4. High velocity — more than 10 cash transactions in 30 days
  const cashTxns = sorted.filter((t) => t.type === "cash_in" || t.type === "cash_out");
  if (cashTxns.length >= 15) {
    structuringScore += 20;
    patterns.push({
      pattern: "high_cash_velocity",
      severity: "high",
      evidence: `${cashTxns.length} cash transactions in 30-day window — abnormally high frequency`,
      transactions: cashTxns.slice(0, 3).map((t) => `${t.date}: ${t.type} ${t.amount.toLocaleString()}`),
    });
  } else if (cashTxns.length >= 8) {
    structuringScore += 10;
    patterns.push({
      pattern: "elevated_cash_frequency",
      severity: "medium",
      evidence: `${cashTxns.length} cash transactions in 30-day window`,
      transactions: cashTxns.slice(0, 3).map((t) => `${t.date}: ${t.type} ${t.amount.toLocaleString()}`),
    });
  }

  // 5. Counterparty diversification — same total distributed across many parties
  const counterpartyTotals: Record<string, number> = {};
  for (const t of sorted) {
    const cp = t.counterparty ?? "unknown";
    counterpartyTotals[cp] = (counterpartyTotals[cp] ?? 0) + t.amount;
  }
  const uniqueCounterparties = Object.keys(counterpartyTotals).length;
  if (uniqueCounterparties >= 5 && totalVolume >= threshold) {
    structuringScore += 15;
    patterns.push({
      pattern: "counterparty_diversification",
      severity: "medium",
      evidence: `${uniqueCounterparties} different counterparties used — potential fragmentation to avoid single-counterparty reporting triggers`,
      transactions: [],
    });
  }

  return {
    structuringScore: Math.min(100, structuringScore),
    patterns,
    totalVolume,
    txnCount: sorted.length,
    averageAmount: Math.round(averageAmount),
    smurfingGroups,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: StructuringRequest;
  try { body = await req.json() as StructuringRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
    return NextResponse.json({ ok: false, error: "transactions array required (min 1 transaction)" }, { status: 400, headers: gate.headers });
  }

  const threshold = body.reportingThreshold ?? DEFAULT_THRESHOLD_AED;
  const analysis = analyzeStructuring(body.transactions, threshold);

  const recommendation = analysis.structuringScore >= 70 ? "file_str"
    : analysis.structuringScore >= 50 ? "escalate_to_mlro"
    : analysis.structuringScore >= 30 ? "enhanced_monitoring"
    : "continue_monitoring";

  const ctrObligation = analysis.totalVolume >= threshold
    ? `CTR obligation likely triggered — total volume ${analysis.totalVolume.toLocaleString()} exceeds AED ${threshold.toLocaleString()} threshold`
    : null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || analysis.structuringScore < 20) {
    return NextResponse.json({
      ok: true,
      subjectName: body.subjectName ?? "unknown",
      structuringProbability: analysis.structuringScore,
      recommendation,
      ctrObligation,
      detectedPatterns: analysis.patterns,
      smurfingGroups: analysis.smurfingGroups,
      statistics: {
        totalVolume: analysis.totalVolume,
        txnCount: analysis.txnCount,
        averageAmount: analysis.averageAmount,
        reportingThreshold: threshold,
      },
      fatfTypologies: analysis.structuringScore >= 50 ? ["FATF R.3 — Structuring / Smurfing", "UAE CTR threshold manipulation"] : [],
      aiEnriched: false,
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 18_000, "structuring-predict");
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: "You are a UAE AML transaction monitoring specialist. Given structuring analysis results, write a 2-3 paragraph SAR-ready narrative and list FATF typology matches. Return JSON: { \"sarNarrative\": \"<text>\", \"fatfTypologies\": [\"<typology>\"], \"additionalPatterns\": [\"<pattern>\"], \"confidence\": \"high|medium|low\" }",
    messages: [{
      role: "user",
      content: `Subject: ${body.subjectName ?? "unknown"}\nStructuring Score: ${analysis.structuringScore}/100\nPatterns: ${JSON.stringify(analysis.patterns)}\nTotal Volume: ${analysis.totalVolume.toLocaleString()} ${body.baseCurrency ?? "AED"}\nTransaction Count: ${analysis.txnCount}\nReporting Threshold: ${threshold.toLocaleString()}\n\nWrite SAR narrative and classify typologies.`,
    }],
  });

  const raw = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "{}";
  let narrative: { sarNarrative?: string; fatfTypologies?: string[]; additionalPatterns?: string[]; confidence?: string } = {};
  try { narrative = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* best effort */ }

  return NextResponse.json({
    ok: true,
    subjectName: body.subjectName ?? "unknown",
    structuringProbability: analysis.structuringScore,
    recommendation,
    ctrObligation,
    detectedPatterns: analysis.patterns,
    smurfingGroups: analysis.smurfingGroups,
    statistics: {
      totalVolume: analysis.totalVolume,
      txnCount: analysis.txnCount,
      averageAmount: analysis.averageAmount,
      reportingThreshold: threshold,
    },
    fatfTypologies: narrative.fatfTypologies ?? [],
    additionalPatterns: narrative.additionalPatterns ?? [],
    sarNarrative: narrative.sarNarrative ?? "",
    confidence: narrative.confidence ?? "medium",
    aiEnriched: true,
    analyzedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
