export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditEvent } from "@/lib/audit";

interface OverrideBody {
  aiModule: string;
  aiRecommendation: string;
  humanDecision: "approved" | "overridden" | "escalated_further";
  humanReason: string;
  subjectRef?: string;
  operator?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: OverrideBody;
  try {
    body = (await req.json()) as OverrideBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { aiModule, aiRecommendation, humanDecision, humanReason, operator } = body;

  if (!aiModule || typeof aiModule !== "string") {
    return NextResponse.json({ ok: false, error: "aiModule is required" }, { status: 400 });
  }
  if (!aiRecommendation || typeof aiRecommendation !== "string") {
    return NextResponse.json({ ok: false, error: "aiRecommendation is required" }, { status: 400 });
  }
  if (!humanDecision || !["approved", "overridden", "escalated_further"].includes(humanDecision)) {
    return NextResponse.json({ ok: false, error: "humanDecision must be approved | overridden | escalated_further" }, { status: 400 });
  }
  if (!humanReason || typeof humanReason !== "string") {
    return NextResponse.json({ ok: false, error: "humanReason is required" }, { status: 400 });
  }

  const actor = operator ?? gate.keyId ?? "mlro";

  // Log 1: high-level human override event
  writeAuditEvent(actor, "ai.human-override", aiModule);

  // Log 2: full detail with recommendation excerpt
  writeAuditEvent(actor, `ai.${humanDecision}`, `${aiModule}: ${aiRecommendation.slice(0, 100)}`);

  return NextResponse.json({ ok: true, logged: true, at: new Date().toISOString() });
}
