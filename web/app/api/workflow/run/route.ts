// POST /api/workflow/run
//
// Loads a subject from Blobs, runs evaluateWorkflowRules for the given
// trigger, and returns the per-rule match results.
//
// Body: { subjectId: string, trigger: WorkflowRule["trigger"] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  evaluateWorkflowRules,
  loadSubjectForWorkflow,
  type WorkflowRule,
} from "@/lib/server/workflow-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_TRIGGERS: WorkflowRule["trigger"][] = [
  "screening_completed",
  "subject_created",
  "risk_score_changed",
  "manual",
];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const b = body as Record<string, unknown>;
  const subjectId = typeof b["subjectId"] === "string" ? b["subjectId"].trim() : "";
  const trigger = b["trigger"] as WorkflowRule["trigger"] | undefined;

  if (!subjectId) {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return NextResponse.json(
      { ok: false, error: `trigger must be one of: ${VALID_TRIGGERS.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  const tenant = tenantIdFromGate(gate);
  const subject = await loadSubjectForWorkflow(subjectId, tenant);
  if (!subject) {
    return NextResponse.json(
      { ok: false, error: `Subject not found: ${subjectId}` },
      { status: 404, headers: gate.headers },
    );
  }

  const results = await evaluateWorkflowRules(subject, trigger);
  const matched = results.filter((r) => r.matched).length;

  return NextResponse.json(
    {
      ok: true,
      subjectId,
      trigger,
      results,
      summary: {
        total: results.length,
        matched,
        skipped: results.length - matched,
      },
    },
    { headers: gate.headers },
  );
}
