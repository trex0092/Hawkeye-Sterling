// POST /api/workflow/test
//
// Dry-run: evaluates a single rule against a subject without applying
// actions or updating run stats. Returns per-condition results for UI
// debugging.
//
// Body: { ruleId: string, subjectId: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadWorkflowRules,
  loadSubjectForWorkflow,
  dryRunRule,
} from "@/lib/server/workflow-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

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
  const ruleId = typeof b["ruleId"] === "string" ? b["ruleId"].trim() : "";
  const subjectId = typeof b["subjectId"] === "string" ? b["subjectId"].trim() : "";

  if (!ruleId) {
    return NextResponse.json(
      { ok: false, error: "ruleId is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!subjectId) {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const rules = await loadWorkflowRules();
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    return NextResponse.json(
      { ok: false, error: `Rule not found: ${ruleId}` },
      { status: 404, headers: gate.headers },
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

  const { matched, conditionResults } = dryRunRule(subject, rule);

  return NextResponse.json(
    {
      ok: true,
      ruleId,
      ruleName: rule.name,
      subjectId,
      matched,
      conditionResults,
    },
    { headers: gate.headers },
  );
}
