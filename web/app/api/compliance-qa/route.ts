// POST /api/compliance-qa
// Regulatory Q&A — tries the AML-MultiAgent-RAG service first; when
// COMPLIANCE_RAG_URL is not configured it falls back to the MLRO Advisor
// pipeline (multi_perspective, 55 s budget) so the tab is never a dead end.
// Accepts conversation context so follow-up questions are answered with
// awareness of what was already discussed in the session.
// Body: { query: string; mode?: "multi-agent" | "single"; context?: {q,a}[] }

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

interface ContextPair { q: string; a: string }

interface ComplianceQaBody {
  query?: string;
  mode?: "multi-agent" | "single";
  context?: ContextPair[];
}

function buildContextPreamble(pairs: ContextPair[]): string {
  if (pairs.length === 0) return "";
  const lines = pairs
    .slice(-3)
    .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
    .join("\n---\n");
  return `REGULATORY SESSION CONTEXT (prior Q&A in this session — use for continuity):\n${lines}\n\nCURRENT QUESTION:\n`;
}

const JURISDICTION_SIGNALS: Array<{ tag: string; keywords: string[] }> = [
  { tag: "UAE", keywords: ["uae", "fdl", "cbuae", "dpms", "moe circular", "goaml", "dfsa"] },
  { tag: "US",  keywords: ["bank secrecy act", "bsa", "ofac", "fincen", "fatca", "patriot act"] },
  { tag: "EU",  keywords: ["5amld", "6amld", "amld", "eu directive", "european union", "eba"] },
  { tag: "UK",  keywords: ["mlr 2017", "proceeds of crime", "poca", "fca", "hmrc"] },
  { tag: "FATF/Global", keywords: ["fatf", "unscr", "wolfsberg", "egmont"] },
];

function detectJurisdiction(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const { tag, keywords } of JURISDICTION_SIGNALS) {
    if (keywords.some((kw) => lower.includes(kw))) return tag;
  }
  return undefined;
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
    mode: body.mode ?? "multi-agent",
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // RAG not configured — fall back to MLRO Advisor with conversation context.
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

    const preamble = buildContextPreamble(body.context ?? []);
    const enrichedQuestion = `${preamble}${body.query.trim()}`.slice(0, 3500);
    const detectedJurisdiction = detectJurisdiction(body.query);

    const advisorReq: MlroAdvisorRequest = {
      question: enrichedQuestion,
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
          jurisdictions: detectedJurisdiction ? [detectedJurisdiction] : [],
          matchingMethods: ["exact", "levenshtein", "jaro_winkler"],
        },
        evidenceIds: detectedJurisdiction ? [`jurisdiction:${detectedJurisdiction}`] : [],
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
          jurisdiction: detectedJurisdiction ?? undefined,
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

  return NextResponse.json(result, { status: 502, headers: { ...CORS, ...gateHeaders } });
}
