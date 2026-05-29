export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface Transaction {
  date: string;
  amount: number;
  currency: string;
  type: string;
  counterparty?: string;
  country?: string;
}

interface ExpectedProfile {
  avgMonthlyVolume?: number;
  primaryCountries?: string[];
  primaryTransactionTypes?: string[];
  avgTransactionSize?: number;
}

interface BehaviorAnalyticsRequest {
  customerId: string;
  analysisWindow: "7d" | "30d" | "90d" | "365d";
  transactionSeries: Transaction[];
  expectedBehaviorProfile?: ExpectedProfile;
}

interface BehaviorAnomaly {
  flag: string;
  score: number;
  description: string;
  occurrenceCount: number;
}

export async function POST(req: Request) {
  const gate = await enforce(req, { cost: 8 });
  if (!gate.ok) return gate.response;

  let body: BehaviorAnalyticsRequest;
  try {
    body = (await req.json()) as BehaviorAnalyticsRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const { customerId, transactionSeries = [], expectedBehaviorProfile } = body;

  if (!customerId) {
    return NextResponse.json({ ok: false, error: "customerId is required" }, { status: 400, headers: gate.headers });
  }

  const anomalies: BehaviorAnomaly[] = [];
  let riskScore = 0;

  const txCount = transactionSeries.length;

  // a. Profile deviation
  if (expectedBehaviorProfile && txCount > 0) {
    const totalVolume = transactionSeries.reduce((s, t) => s + t.amount, 0);
    const avgSize = txCount > 0 ? totalVolume / txCount : 0;

    if (expectedBehaviorProfile.avgMonthlyVolume && totalVolume > expectedBehaviorProfile.avgMonthlyVolume * 3) {
      const add = Math.min(20, 20);
      riskScore += add;
      anomalies.push({ flag: "profile_deviation_volume", score: add, description: "Transaction volume 3× above expected monthly profile", occurrenceCount: 1 });
    }
    if (expectedBehaviorProfile.avgTransactionSize && avgSize > expectedBehaviorProfile.avgTransactionSize * 3) {
      const add = 20;
      riskScore += add;
      anomalies.push({ flag: "profile_deviation_size", score: add, description: "Average transaction size 3× above expected", occurrenceCount: 1 });
    }
  }

  // b. Time-of-day clustering: >70% of transactions between 00:00-05:00
  if (txCount >= 5) {
    const nightCount = transactionSeries.filter((t) => {
      const h = new Date(t.date).getUTCHours();
      return h >= 0 && h < 5;
    }).length;
    if (nightCount / txCount > 0.7) {
      riskScore += 15;
      anomalies.push({ flag: "unusual_hour_clustering", score: 15, description: "Over 70% of transactions occur between 00:00–05:00 UTC", occurrenceCount: nightCount });
    }
  }

  // c. New counterparty surge: >60% new counterparties
  if (txCount >= 5) {
    const counterparties = transactionSeries.map((t) => t.counterparty).filter(Boolean);
    const unique = new Set(counterparties);
    if (unique.size / txCount > 0.6) {
      riskScore += 20;
      anomalies.push({ flag: "new_counterparty_surge", score: 20, description: "Over 60% of transactions involve unique counterparties not seen before", occurrenceCount: unique.size });
    }
  }

  // d. Transaction size clustering: narrow bands suggest programmatic sizing
  if (txCount >= 10) {
    const amounts = transactionSeries.map((t) => Math.round(t.amount / 100) * 100);
    const freq = new Map<number, number>();
    for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1);
    const maxFreq = Math.max(...Array.from(freq.values()));
    if (maxFreq / txCount > 0.4) {
      riskScore += 20;
      anomalies.push({ flag: "programmatic_sizing", score: 20, description: "Over 40% of transactions cluster around identical round amounts", occurrenceCount: maxFreq });
    }
  }

  // e. Round-trip detection: net balance change < 5% of total volume
  if (txCount > 10) {
    const totalVolume = transactionSeries.reduce((s, t) => s + t.amount, 0);
    const netChange = Math.abs(transactionSeries.reduce((s, t) => {
      return t.type === "credit" ? s + t.amount : s - t.amount;
    }, 0));
    if (totalVolume > 0 && netChange / totalVolume < 0.05) {
      riskScore += 35;
      anomalies.push({ flag: "round_trip_indicator", score: 35, description: "Net balance change is less than 5% of total transaction volume — funds cycling detected", occurrenceCount: 1 });
    }
  }

  // f. Weekend/holiday concentration: >80% on weekends
  if (txCount >= 5) {
    const weekendCount = transactionSeries.filter((t) => {
      const day = new Date(t.date).getUTCDay();
      return day === 0 || day === 6;
    }).length;
    if (weekendCount / txCount > 0.8) {
      riskScore += 15;
      anomalies.push({ flag: "off_hours_pattern", score: 15, description: "Over 80% of transactions concentrated on weekends", occurrenceCount: weekendCount });
    }
  }

  riskScore = Math.min(100, riskScore);
  const riskLevel = riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";

  const recommendation =
    riskLevel === "critical" ? "Immediate investigation required — freeze pending review" :
    riskLevel === "high" ? "Enhanced monitoring — escalate to MLRO" :
    riskLevel === "medium" ? "Flag for periodic review — increased transaction monitoring" :
    "Standard monitoring";

  // Identify peak risk period
  const sortedByDate = [...transactionSeries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const peakRiskPeriod = sortedByDate[0]?.date ? `Most recent activity: ${sortedByDate[0].date}` : "No transactions analysed";

  return NextResponse.json({
    ok: true,
    customerId,
    riskScore,
    riskLevel,
    behavioralAnomalies: anomalies,
    peakRiskPeriod,
    peerGroupComparison: txCount === 0 ? "No transactions to compare" : `${txCount} transactions analysed across ${body.analysisWindow} window`,
    recommendation,
  }, { headers: gate.headers });
}
