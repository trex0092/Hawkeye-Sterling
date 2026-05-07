import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  lastScreenedAt: string;
  verdict: string;
  riskScore: number;
  entityType: string;
}

const RESCREEN_INTERVALS: Record<string, number> = {
  HIGH: 90,      // 90 days
  MEDIUM: 180,   // 6 months
  LOW: 365,      // 1 year
  MINIMAL: 730,  // 2 years
};

const DECAY_RATES: Record<string, number> = {
  individual: 0.8,    // individuals decay faster — circumstances change
  corporate: 0.5,
  trust: 0.6,
  pep: 1.2,           // PEPs decay much faster
  high_net_worth: 0.9,
  default: 0.7,
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { lastScreenedAt, verdict, riskScore, entityType } = body;
  if (!lastScreenedAt || !verdict || riskScore === undefined || !entityType) {
    return NextResponse.json({ ok: false, error: "lastScreenedAt, verdict, riskScore, and entityType are required" }, { status: 400 });
  }

  const screenedDate = new Date(lastScreenedAt);
  const today = new Date();
  const daysSinceScreening = Math.max(0, Math.floor((today.getTime() - screenedDate.getTime()) / 86400000));

  // Determine risk band from score
  const riskBand = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : riskScore >= 20 ? "LOW" : "MINIMAL";
  const rescreenIntervalDays = RESCREEN_INTERVALS[riskBand] ?? 365;

  // Decay rate based on entity type
  const entityKey = entityType.toLowerCase().replace(/\s+/g, "_");
  const decayRate = DECAY_RATES[entityKey] ?? DECAY_RATES["default"];

  // Confidence decays exponentially: C = 100 * e^(-k * t/T)
  // where k = decayRate, t = days elapsed, T = rescreen interval
  const k = decayRate;
  const t = daysSinceScreening;
  const T = rescreenIntervalDays;
  const currentConfidence = Math.max(0, Math.round(100 * Math.exp(-k * t / T)));

  const daysUntilStale = Math.max(0, rescreenIntervalDays - daysSinceScreening);
  const rescreenDate = new Date(screenedDate);
  rescreenDate.setDate(rescreenDate.getDate() + rescreenIntervalDays);
  const recommendedRescreen = rescreenDate.toISOString().split("T")[0];

  const urgency = daysUntilStale === 0 ? "OVERDUE"
    : daysUntilStale <= 14 ? "CRITICAL"
    : daysUntilStale <= 30 ? "HIGH"
    : daysUntilStale <= 90 ? "MEDIUM" : "LOW";

  const decayRateLabel = decayRate >= 1.0 ? "RAPID" : decayRate >= 0.7 ? "MODERATE" : "SLOW";

  return NextResponse.json({
    ok: true,
    currentConfidence,
    decayRate: `${decayRateLabel} (${decayRate.toFixed(1)}x for ${entityType})`,
    recommendedRescreen,
    daysUntilStale,
    urgency,
  });
}
