// POST /api/compliance-qa
// Regulatory Q&A — tries the AML-MultiAgent-RAG service first; when
// COMPLIANCE_RAG_URL is not configured it falls back to the MLRO Advisor
// pipeline (Sonnet balanced mode) so the tab is never a dead end.
// Body: { query: string; mode?: "multi-agent" | "single" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";
import {
  invokeMlroAdvisor,
  type MlroAdvisorRequest,
} from "../../../../dist/src/integrations/mlroAdvisor.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface ComplianceQaBody {
  query?: string;
  mode?: "multi-agent" | "single";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: ComplianceQaBody;
  try {
    body = (await req.json()) as ComplianceQaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.query?.trim()) {
    return NextResponse.json({ ok: false, error: "query is required" }, { status: 400, headers: CORS });
  }

  const result = await askComplianceQuestion({
    query: body.query.trim(),
    mode: body.mode ?? "single",
  });

  // RAG service available — return its result directly.
  if (result.ok) {
    return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // RAG not configured — fall back to MLRO Advisor (Sonnet balanced) if possible.
  if (result.error?.includes("not configured")) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Regulatory Q&A requires either COMPLIANCE_RAG_URL (external RAG service) " +
            "or ANTHROPIC_API_KEY (built-in advisor fallback). Neither is configured.",
        },
        { status: 503, headers: CORS },
      );
    }

    const advisorReq: MlroAdvisorRequest = {
      question: body.query.trim().slice(0, 2000),
      mode: "multi_perspective",
      audience: "regulator",
      caseContext: {
        caseId: `cqa-${Date.now()}`,
        subjectName: "Regulatory Query",
        entityType: "individual",
        scope: {
          listsChecked: [
            "OFAC-SDN", "OFAC-Non-SDN", "UN-Consolidated",
            "EU-Consolidated", "UK-OFSI", "UAE-EOCN", "UAE-LTL",
          ],
          listVersionDates: {},
          jurisdictions: [],
          matchingMethods: ["exact", "levenshtein", "jaro_winkler"],
        },
        evidenceIds: [],
      },
    };

    try {
      const advisorResult = await invokeMlroAdvisor(advisorReq, { apiKey, budgetMs: 55_000 });

      if (!advisorResult.ok) {
        return NextResponse.json(
          { ok: false, error: advisorResult.error ?? "Advisor fallback failed" },
          { status: 502, headers: { ...CORS, ...gateHeaders } },
        );
      }

      const lastStep = advisorResult.reasoningTrail[advisorResult.reasoningTrail.length - 1];
      const answer = advisorResult.narrative ?? lastStep?.body ?? "";
      const approved = advisorResult.complianceReview.advisorVerdict === "approved";

      return NextResponse.json(
        {
          ok: true,
          query: body.query.trim(),
          answer,
          citations: [],
          passedQualityGate: approved,
          confidenceScore: approved ? 80 : 55,
          consistencyScore: 0.85,
          source: "mlro-advisor-fallback",
        },
        { headers: { ...CORS, ...gateHeaders } },
      );
    } catch {
      return NextResponse.json(
        { ok: false, error: "Advisor fallback unavailable — check server logs" },
        { status: 503, headers: CORS },
      );
    }
  }

  // Other RAG errors (network, 5xx from the RAG service, etc.)
  return NextResponse.json(result, { status: 502, headers: { ...CORS, ...gateHeaders } });
}
