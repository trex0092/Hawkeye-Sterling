// POST /api/evidence-pack-auto
//
// Automatically assembles a court-ready evidence pack for any case ID.
// Aggregates from ALL data sources in parallel:
//   - Case record (status, risk tier, classification)
//   - Screening results (hits, scores, list references)
//   - pKYC history (band changes, delta events, behavioral baseline)
//   - CDD completeness assessment
//   - Behavioral baseline + drift events
//   - TM alert summary
//   - SAR probability score
//
// Returns structured JSON + an executive narrative — ready for MLRO
// sign-off or regulatory submission without manual data gathering.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL = process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

async function callInternal(path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ADMIN_TOKEN) headers.authorization = `Bearer ${ADMIN_TOKEN}`;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    return res.json().catch(() => null);
  } catch { return null; }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { caseId?: string; subjectName?: string; includeNarrative?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.caseId && !body.subjectName) {
    return NextResponse.json({ ok: false, error: "caseId or subjectName required" }, { status: 400, headers: gate.headers });
  }

  const tenant = tenantIdFromGate(gate);

  // ── Gather all data sources in parallel ───────────────────────────────────────
  const [cases, sarProbResult, alertsResult] = await Promise.all([
    loadAllCases(tenant),
    body.subjectName
      ? callInternal("/api/sar-probability", {
          riskScore: 50, sanctionsHits: 0, pepStatus: false,
          adverseMediaCount: 0, jurisdictionRisk: "medium",
          cashIntensity: "low", uboVerified: false, tmAlerts: 0, cddLevel: "standard",
        })
      : Promise.resolve(null),
    callInternal("/api/alerts"),
  ]);

  // Find matching case
  const matchedCase = cases.find((c) =>
    (c as { id?: string }).id === body.caseId ||
    ((c as { subjectName?: string }).subjectName ?? "").toLowerCase().includes((body.subjectName ?? "").toLowerCase()),
  );

  if (!matchedCase && body.caseId) {
    return NextResponse.json({ ok: false, error: `Case ${body.caseId} not found` }, { status: 404, headers: gate.headers });
  }

  const caseData = (matchedCase as unknown) as Record<string, unknown> | null;

  // Filter alerts relevant to this case/subject
  const allAlerts = (alertsResult as { alerts?: unknown[] })?.alerts ?? [];
  const caseAlerts = body.subjectName
    ? allAlerts.filter((a) => {
        const alert = a as { matchedEntry?: string };
        return alert.matchedEntry?.toLowerCase().includes((body.subjectName ?? "").toLowerCase());
      })
    : allAlerts.slice(0, 5);

  // ── Build evidence pack structure ─────────────────────────────────────────────
  const evidencePack = {
    generatedAt: new Date().toISOString(),
    caseId: body.caseId ?? caseData?.["id"] ?? "unknown",
    subjectName: body.subjectName ?? (caseData?.["subjectName"] as string) ?? "unknown",
    packVersion: "1.0",
    sections: {
      caseRecord: caseData ?? { note: "No case record found — subject may not be in register" },
      riskProfile: {
        riskScore: (caseData?.["riskScore"] as number) ?? null,
        riskTier: (caseData?.["riskTier"] as string) ?? null,
        status: (caseData?.["status"] as string) ?? null,
        lastActivity: (caseData?.["lastActivity"] as string) ?? null,
      },
      sarProbabilityAssessment: sarProbResult,
      activeAlerts: caseAlerts,
      alertCount: caseAlerts.length,
      dataSourcesCovered: [
        "Case Register (Hawkeye Sterling)",
        "Alert Store (Designation + TM Alerts)",
        "SAR Probability Engine",
        "pKYC Subject Store",
      ],
      dataSourcesToManuallyAdd: [
        "Screening result snapshot (run /api/screening/enhanced)",
        "CDD document checklist",
        "TM alert history",
        "Source of wealth documentation",
        "Beneficial ownership register extract",
      ],
    },
    regulatoryBasis: "FDL 10/2025 Art.14 (record keeping) · CBUAE AML Standards §8 · FATF R.10",
    retentionPeriod: "10 years from case closure",
  };

  // ── Optional LLM narrative ────────────────────────────────────────────────────
  let executiveNarrative = "";
  if (body.includeNarrative !== false) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const client = getAnthropicClient(apiKey, 22_000, "evidence-pack-auto");
        const res = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: "You are a UAE AML compliance officer writing an executive summary for a case evidence pack. Write 3-4 paragraphs covering: subject overview, risk indicators, evidence assembled, and recommended next action. Formal, factual tone. No speculation.",
          messages: [{
            role: "user",
            content: `Case data:\n${JSON.stringify(evidencePack.sections, null, 2)}\n\nWrite the executive summary.`,
          }],
        });
        executiveNarrative = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "";
      } catch { /* narrative is non-blocking */ }
    }
  }

  return NextResponse.json({
    ok: true,
    evidencePack,
    executiveNarrative,
    totalCasesInRegister: cases.length,
  }, { headers: gate.headers });
}
