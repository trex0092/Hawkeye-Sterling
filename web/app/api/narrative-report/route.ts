import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  generateNarrativeReport,
  type NarrativeReportRequest,
} from "../../../../dist/src/integrations/claudeAgent.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NarrativeStyle = "regulator" | "executive" | "investigator";

interface Body {
  style?: NarrativeStyle;
  caseReport: {
    identity: {
      caseId: string;
      subjectName: string;
      entityType?: string;
      jurisdiction?: string;
      openedAt?: string;
    };
    verdict?: {
      severity?: string;
      topScore?: number;
      riskTier?: string;
    };
    hits?: Array<{
      listId: string;
      candidateName: string;
      score: number;
      method: string;
    }>;
    pep?: { tier: string; type: string; salience: number } | null;
    adverseMediaGroups?: Array<{ group: string; label: string; count: number }>;
    typologies?: Array<{ id: string; name: string; family: string; weight: number }>;
    jurisdiction?: {
      iso2: string;
      name: string;
      cahra: boolean;
      regimes: string[];
    } | null;
    narrative?: string;
    [key: string]: unknown;
  };
  sourceData?: Array<{ filename: string; mimeType: string; content: string }>;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured on this server." },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (!body?.caseReport?.identity?.subjectName) {
    return NextResponse.json(
      { ok: false, error: "caseReport.identity.subjectName is required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body?.caseReport?.identity?.caseId) {
    return NextResponse.json(
      { ok: false, error: "caseReport.identity.caseId is required" },
      { status: 400, headers: gateHeaders },
    );
  }

  try {
    // body.caseReport is arbitrary client JSON; we pass it through to the
    // Claude agent which handles its own validation against the full schema.
    const req = {
      style: body.style ?? "regulator",
      caseReport: body.caseReport,
      sourceData: body.sourceData,
    } as unknown as NarrativeReportRequest;

    const result = await generateNarrativeReport(
      req,
      {
        apiKey,
        model: "claude-opus-4-7",
        timeoutMs: 60_000,
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "narrative generation failed" },
        { status: 503, headers: gateHeaders },
      );
    }

    return NextResponse.json(
      { ok: true, html: result.html, style: body.style ?? "regulator" },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[narrative-report] failed", err);
    return NextResponse.json(
      { ok: false, error: "narrative-report unavailable — check server logs" },
      { status: 503, headers: gateHeaders },
    );
  }
}
