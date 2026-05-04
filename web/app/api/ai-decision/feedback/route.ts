export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getJson, setJson } from "@/lib/server/store";
import type { AIDecision } from "../route";

const FEEDBACK_STORE_KEY = "ai-decision:feedback:v1";
const MAX_RECORDS = 50;

interface FeedbackRecord {
  id: string;
  timestamp: string;
  subjectProfile: {
    entityType: string;
    country: string;
    riskScore: number;
    sanctionsHits: number;
    hasPEP: boolean;
    exposure: string;
    severity: string;
  };
  aiDecision: AIDecision;
  confidence: number;
  outcome: "accepted" | "overridden";
  override?: AIDecision;
  notes?: string;
}

interface FeedbackBody {
  decisionId: string;
  subjectId: string;
  subjectProfile: FeedbackRecord["subjectProfile"];
  aiDecision: AIDecision;
  confidence: number;
  outcome: "accepted" | "overridden";
  override?: AIDecision;
  notes?: string;
}

export async function POST(req: Request) {
  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decisionId || !body.outcome) {
    return NextResponse.json({ ok: false, error: "decisionId and outcome are required" }, { status: 400 });
  }

  const record: FeedbackRecord = {
    id: body.decisionId,
    timestamp: new Date().toISOString(),
    subjectProfile: body.subjectProfile,
    aiDecision: body.aiDecision,
    confidence: body.confidence,
    outcome: body.outcome,
    override: body.override,
    notes: body.notes,
  };

  try {
    const existing = (await getJson<FeedbackRecord[]>(FEEDBACK_STORE_KEY)) ?? [];
    // Remove duplicate if re-submitting feedback for same decision
    const deduped = existing.filter((r) => r.id !== record.id);
    deduped.push(record);
    // Keep only the most recent MAX_RECORDS
    const trimmed = deduped.slice(-MAX_RECORDS);
    await setJson(FEEDBACK_STORE_KEY, trimmed);

    const accepted = trimmed.filter((r) => r.outcome === "accepted").length;
    const overridden = trimmed.filter((r) => r.outcome === "overridden").length;

    return NextResponse.json({
      ok: true,
      recorded: record.id,
      totalFeedback: trimmed.length,
      acceptanceRate: trimmed.length > 0 ? Math.round((accepted / trimmed.length) * 100) : null,
      overrideRate: trimmed.length > 0 ? Math.round((overridden / trimmed.length) * 100) : null,
    });
  } catch (err) {
    console.error("[ai-decision/feedback]", err);
    return NextResponse.json({
      ok: true,
      stored: false,
      recorded: record.id,
      totalFeedback: null,
      acceptanceRate: null,
      overrideRate: null,
      note: "feedback store unavailable — record not persisted",
    });
  }
}

export async function GET() {
  try {
    const records = (await getJson<FeedbackRecord[]>(FEEDBACK_STORE_KEY)) ?? [];
    const accepted = records.filter((r) => r.outcome === "accepted").length;
    const overridden = records.filter((r) => r.outcome === "overridden").length;
    return NextResponse.json({
      ok: true,
      total: records.length,
      accepted,
      overridden,
      acceptanceRate: records.length > 0 ? Math.round((accepted / records.length) * 100) : null,
      recentDecisions: records.slice(-5).reverse(),
    });
  } catch {
    return NextResponse.json({ ok: true, total: 0, accepted: 0, overridden: 0, acceptanceRate: null, recentDecisions: [] });
  }
}
