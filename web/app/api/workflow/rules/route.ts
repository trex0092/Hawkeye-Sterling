// GET  /api/workflow/rules — list all workflow rules
// POST /api/workflow/rules — create a new workflow rule

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { randomUUID } from "node:crypto";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadWorkflowRules,
  saveWorkflowRules,
  validateRule,
  type WorkflowRule,
} from "@/lib/server/workflow-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const rules = await loadWorkflowRules();
  return NextResponse.json({ ok: true, rules, total: rules.length }, { headers: gate.headers });
}

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

  const validation = validateRule(body);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, errors: validation.errors },
      { status: 422, headers: gate.headers },
    );
  }

  const rules = await loadWorkflowRules();
  const now = new Date().toISOString();

  const newRule: WorkflowRule = {
    ...validation.rule,
    id: randomUUID(),
    createdAt: now,
    runCount: 0,
  };

  rules.push(newRule);
  await saveWorkflowRules(rules);

  void writeAuditChainEntry(
    { event: "workflow.rule.created", actor: gate.keyId, meta: { id: newRule.id, name: newRule.name } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, rule: newRule },
    { status: 201, headers: gate.headers },
  );
}
