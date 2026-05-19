export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditEvent } from "@/lib/audit";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

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
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  const { aiModule, aiRecommendation, humanDecision, humanReason, operator } = body;

  if (!aiModule || typeof aiModule !== "string") {
    return NextResponse.json({ ok: false, error: "aiModule is required" }, { status: 400 , headers: gate.headers });
  }
  if (!aiRecommendation || typeof aiRecommendation !== "string") {
    return NextResponse.json({ ok: false, error: "aiRecommendation is required" }, { status: 400 , headers: gate.headers });
  }
  if (!humanDecision || !["approved", "overridden", "escalated_further"].includes(humanDecision)) {
    return NextResponse.json({ ok: false, error: "humanDecision must be approved | overridden | escalated_further" }, { status: 400 , headers: gate.headers });
  }
  if (!humanReason || typeof humanReason !== "string") {
    return NextResponse.json({ ok: false, error: "humanReason is required" }, { status: 400 , headers: gate.headers });
  }

  const actor = operator ?? gate.keyId ?? "mlro";
  const tenant = tenantIdFromGate(gate);

  // Client-side audit trail (informational).
  writeAuditEvent(actor, "ai.human-override", aiModule);
  writeAuditEvent(actor, `ai.${humanDecision}`, `${aiModule}: ${aiRecommendation.slice(0, 100)}`);

  // Server-side tamper-evident chain (FDL 10/2025 Art.24 — regulators require
  // verifiable record of human overrides of AI compliance decisions).
  await writeAuditChainEntry(
    {
      event: "ai.human-override",
      actor,
      aiModule,
      humanDecision,
      humanReason: humanReason.slice(0, 500),
      aiRecommendation: aiRecommendation.slice(0, 200),
      subjectRef: body.subjectRef,
    },
    tenant,
  ).catch((err) =>
    console.warn("[ai-override] server audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({ ok: true, logged: true, at: new Date().toISOString() }, { headers: gate.headers });
}
