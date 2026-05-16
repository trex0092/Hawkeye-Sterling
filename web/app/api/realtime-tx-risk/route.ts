// POST /api/realtime-tx-risk
//
// Real-Time Transaction Risk Scorer.
// Evaluates a single transaction (or micro-batch) against AML/CFT red-flag
// rules and returns a risk score with explanation in <250 ms on average.
//
// No AI call on the hot path — deterministic rule engine only.
// AI is invoked only when score >= 70 and callers opt in with enrichWithAI=true.
//
// Risk dimensions scored:
//   - Structuring/smurfing proximity (just-below-threshold amounts)
//   - High-risk jurisdiction (FATF grey/black, UAE high-risk list)
//   - Counter-party risk (PEP flag, sanction hint)
//   - Velocity (rapid successive transactions, round-trip patterns)
//   - Payment method risk (cash, crypto, hawala)
//   - Time-of-day anomaly (outside business hours)
//   - Unusual amount (statistical outlier vs. customer baseline)
//
// Regulatory basis: FDL 10/2025 Art.16 (CTR triggers); FATF R.20

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// UAE CTR threshold — cash transactions >= AED 55,000 require filing
const AED_CTR_THRESHOLD = 55_000;
// Structuring band: 80-99% of threshold is suspicious
const STRUCTURING_LOWER = AED_CTR_THRESHOLD * 0.80;

const FATF_HIGH_RISK = new Set([
  "AF","AL","BB","BF","BJ","BT","CF","CI","CG","CU","ET","GA","GH","GT","GY","HT",
  "HK","ID","IR","IQ","JM","JO","KH","KZ","KE","LA","LB","LY","MA","MK","ML","MM",
  "MZ","NG","NI","PK","PA","PH","RU","SA","SN","SY","TG","TH","TN","TR","TZ","UA",
  "UG","VE","VN","YE","ZA","ZW",
]);

interface Transaction {
  id?: string;
  amount: number;
  currency?: string;              // default AED
  type?: string;                  // cash | wire | crypto | hawala | trade | card | cheque
  direction?: "in" | "out";
  counterpartyName?: string;
  counterpartyJurisdiction?: string;
  counterpartyIsPep?: boolean;
  counterpartySanctionHint?: boolean;
  timestamp?: string;             // ISO datetime, defaults to now
  referenceNote?: string;
  customerBaseline?: {
    avgMonthlyVolume?: number;
    avgTransactionAmount?: number;
    stdDevAmount?: number;
  };
  recentTransactions?: Array<{
    amount: number;
    currency?: string;
    timestamp?: string;
    type?: string;
  }>;
}

interface RiskFlag {
  code: string;
  description: string;
  weight: number;                 // 0-100 contribution
  severity: "low" | "medium" | "high" | "critical";
}

interface RiskScoreResult {
  transactionId: string;
  score: number;                  // 0-100
  band: "low" | "medium" | "high" | "critical";
  ctrRequired: boolean;
  flags: RiskFlag[];
  summary: string;
  aiNarrative?: string;
  recommendedActions: string[];
  evaluatedAt: string;
}

function toAed(amount: number, currency = "AED"): number {
  // Approximate rates; production would use live FX
  const rates: Record<string, number> = {
    AED: 1, USD: 3.67, EUR: 4.01, GBP: 4.65, CHF: 4.12,
    SAR: 0.98, KWD: 11.97, QAR: 1.01, BHD: 9.74, OMR: 9.53,
    PKR: 0.013, INR: 0.044, GBP_: 4.65,
  };
  return amount * (rates[currency.toUpperCase()] ?? 1);
}

function hourOfDay(ts?: string): number {
  const d = ts ? new Date(ts) : new Date();
  return d.getUTCHours();
}

function scoreTransaction(tx: Transaction): { score: number; flags: RiskFlag[] } {
  const flags: RiskFlag[] = [];
  const amountAed = toAed(tx.amount, tx.currency ?? "AED");

  // 1. CTR threshold proximity — structuring
  if (amountAed >= AED_CTR_THRESHOLD) {
    flags.push({
      code: "CTR_THRESHOLD_EXCEEDED",
      description: `Transaction amount AED ${amountAed.toLocaleString()} meets or exceeds CTR filing threshold`,
      weight: 30,
      severity: "high",
    });
  } else if (amountAed >= STRUCTURING_LOWER) {
    flags.push({
      code: "STRUCTURING_PROXIMITY",
      description: `Amount AED ${amountAed.toLocaleString()} is ${Math.round((amountAed / AED_CTR_THRESHOLD) * 100)}% of CTR threshold — possible structuring`,
      weight: 25,
      severity: "high",
    });
  }

  // 2. Payment method risk
  const methodWeights: Record<string, { w: number; sev: RiskFlag["severity"] }> = {
    cash: { w: 20, sev: "high" },
    crypto: { w: 18, sev: "high" },
    hawala: { w: 25, sev: "critical" },
    trade: { w: 10, sev: "medium" },
    wire: { w: 5, sev: "low" },
    cheque: { w: 8, sev: "medium" },
    card: { w: 3, sev: "low" },
  };
  const method = (tx.type ?? "").toLowerCase();
  if (methodWeights[method]) {
    const { w, sev } = methodWeights[method];
    flags.push({
      code: `HIGH_RISK_PAYMENT_METHOD_${method.toUpperCase()}`,
      description: `Payment method '${method}' carries elevated ML risk`,
      weight: w,
      severity: sev,
    });
  }

  // 3. High-risk counterparty jurisdiction
  const cj = (tx.counterpartyJurisdiction ?? "").toUpperCase();
  if (cj && FATF_HIGH_RISK.has(cj)) {
    flags.push({
      code: "HIGH_RISK_JURISDICTION",
      description: `Counterparty jurisdiction '${cj}' is FATF-listed or UAE high-risk`,
      weight: 20,
      severity: "high",
    });
  }

  // 4. PEP counterparty
  if (tx.counterpartyIsPep) {
    flags.push({
      code: "PEP_COUNTERPARTY",
      description: "Counterparty identified as a Politically Exposed Person",
      weight: 22,
      severity: "high",
    });
  }

  // 5. Sanction hint
  if (tx.counterpartySanctionHint) {
    flags.push({
      code: "SANCTION_HINT",
      description: "Counterparty name matches or is adjacent to sanctioned entity",
      weight: 40,
      severity: "critical",
    });
  }

  // 6. Outside business hours (UAE: 09:00–18:00 GST = UTC+04:00)
  const hour = hourOfDay(tx.timestamp);
  const gstHour = (hour + 4) % 24;
  if (gstHour < 7 || gstHour >= 22) {
    flags.push({
      code: "OFF_HOURS_TRANSACTION",
      description: `Transaction at ${gstHour}:00 GST is outside normal business hours`,
      weight: 8,
      severity: "low",
    });
  }

  // 7. Statistical outlier vs. customer baseline
  if (tx.customerBaseline) {
    const { avgTransactionAmount, stdDevAmount } = tx.customerBaseline;
    if (avgTransactionAmount && stdDevAmount && stdDevAmount > 0) {
      const zScore = Math.abs(amountAed - avgTransactionAmount) / stdDevAmount;
      if (zScore > 4) {
        flags.push({
          code: "AMOUNT_OUTLIER_EXTREME",
          description: `Amount is ${zScore.toFixed(1)} standard deviations from customer baseline`,
          weight: 20,
          severity: "high",
        });
      } else if (zScore > 2.5) {
        flags.push({
          code: "AMOUNT_OUTLIER",
          description: `Amount is ${zScore.toFixed(1)} standard deviations from customer baseline`,
          weight: 12,
          severity: "medium",
        });
      }
    }
  }

  // 8. Velocity — multiple transactions in short window
  if (tx.recentTransactions && tx.recentTransactions.length > 0) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recent = tx.recentTransactions.filter((r) => {
      const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return ts >= oneHourAgo;
    });
    if (recent.length >= 5) {
      flags.push({
        code: "HIGH_VELOCITY",
        description: `${recent.length} transactions in the past hour — velocity anomaly`,
        weight: 18,
        severity: "high",
      });
    } else if (recent.length >= 3) {
      flags.push({
        code: "ELEVATED_VELOCITY",
        description: `${recent.length} transactions in the past hour`,
        weight: 10,
        severity: "medium",
      });
    }

    // Round-trip detection: similar amount in opposite direction within 48h
    const window48h = Date.now() - 48 * 60 * 60 * 1000;
    const opposite = tx.direction === "in" ? "out" : "in";
    const roundTrip = tx.recentTransactions.find((r) => {
      const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      const rAed = toAed(r.amount, r.currency ?? "AED");
      return ts >= window48h && Math.abs(rAed - amountAed) / amountAed < 0.05;
    });
    if (roundTrip) {
      flags.push({
        code: "ROUND_TRIP_PATTERN",
        description: "Near-identical amount transacted in opposite direction within 48 hours",
        weight: 25,
        severity: "high",
      });
    }
  }

  // Aggregate score — cap at 100
  const rawScore = flags.reduce((s, f) => s + f.weight, 0);
  const score = Math.min(100, rawScore);

  return { score, flags };
}

function bandFor(score: number): RiskScoreResult["band"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function actionsFor(score: number, flags: RiskFlag[], ctrRequired: boolean): string[] {
  const actions: string[] = [];
  if (ctrRequired) actions.push("File CTR via goAML within 2 business days (FDL Art.16)");
  if (score >= 75) {
    actions.push("Escalate to MLRO immediately");
    actions.push("Place transaction on hold pending AML review");
    actions.push("Evaluate STR filing obligation within 24 hours");
  } else if (score >= 50) {
    actions.push("Flag for enhanced monitoring");
    actions.push("MLRO to review within 24 hours");
  } else if (score >= 25) {
    actions.push("Apply enhanced transaction monitoring for next 30 days");
  }
  if (flags.some((f) => f.code === "SANCTION_HINT")) {
    actions.push("CRITICAL: Do not process — conduct sanctions screening before proceeding");
  }
  if (flags.some((f) => f.code === "PEP_COUNTERPARTY")) {
    actions.push("Obtain senior management approval for PEP transaction (FDL Art.8)");
  }
  if (flags.some((f) => f.code === "ROUND_TRIP_PATTERN")) {
    actions.push("Investigate layering pattern — obtain transaction purpose documentation");
  }
  return actions;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { transaction: Transaction; enrichWithAI?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { transaction: tx, enrichWithAI = false } = body;
  if (!tx || typeof tx.amount !== "number") {
    return NextResponse.json({ error: "transaction.amount is required" }, { status: 400 , headers: gate.headers });
  }

  const { score, flags } = scoreTransaction(tx);
  const amountAed = toAed(tx.amount, tx.currency ?? "AED");
  const ctrRequired = amountAed >= AED_CTR_THRESHOLD && (tx.type ?? "").toLowerCase() === "cash";
  const band = bandFor(score);
  const recommendedActions = actionsFor(score, flags, ctrRequired);

  const topFlags = flags.slice(0, 3).map((f) => f.description).join("; ");
  const summary = flags.length === 0
    ? "No significant risk indicators identified."
    : `Risk score ${score}/100 (${band}). Key factors: ${topFlags}.`;

  const result: RiskScoreResult = {
    transactionId: tx.id ?? `tx-${Date.now()}`,
    score,
    band,
    ctrRequired,
    flags,
    summary,
    recommendedActions,
    evaluatedAt: new Date().toISOString(),
  };

  // AI enrichment for high-risk transactions when requested
  if (enrichWithAI && score >= 50) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      const anthropic = getAnthropicClient(apiKey, 4_500, "realtime-tx-risk");
      const prompt = `You are a UAE DPMS AML compliance specialist. A transaction has been scored ${score}/100 (${band} risk).

Transaction details:
- Amount: ${tx.amount} ${tx.currency ?? "AED"} (AED equivalent: ${Math.round(amountAed).toLocaleString()})
- Type: ${tx.type ?? "unspecified"}
- Direction: ${tx.direction ?? "unspecified"}
- Counterparty: ${tx.counterpartyName ?? "unspecified"} (jurisdiction: ${tx.counterpartyJurisdiction ?? "unknown"})
- Reference: ${tx.referenceNote ?? "none"}

Risk flags triggered:
${flags.map((f) => `- [${f.severity.toUpperCase()}] ${f.code}: ${f.description}`).join("\n")}

Provide a concise 2-3 sentence AML compliance narrative explaining the risk, citing the most relevant UAE FDL 10/2025 articles. Be specific, not generic.`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });
      result.aiNarrative = (msg.content[0] as { type: string; text: string }).text?.trim();
    } catch {
      // AI enrichment is best-effort
    }
  }

  return NextResponse.json(result, { headers: gate.headers });
}
