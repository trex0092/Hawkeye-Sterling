// GET    /api/workflow/rules/[id] — fetch a single rule
// PATCH  /api/workflow/rules/[id] — update a rule (partial)
// DELETE /api/workflow/rules/[id] — delete a rule

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadWorkflowRules,
  saveWorkflowRules,
  validateRule,
} from "@/lib/server/workflow-engine";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const rules = await loadWorkflowRules();
  const rule = rules.find((r) => r.id === id);
  if (!rule) {
    return NextResponse.json(
      { ok: false, error: "Rule not found" },
      { status: 404, headers: gate.headers },
    );
  }
  return NextResponse.json({ ok: true, rule }, { headers: gate.headers });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const { id } = await params;
  const rules = await loadWorkflowRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) {
    return NextResponse.json(
      { ok: false, error: "Rule not found" },
      { status: 404, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Merge patch onto existing rule before validating the full merged shape
  const existing = rules[idx]!;
  const merged = { ...existing, ...(body as Record<string, unknown>) };

  const validation = validateRule(merged);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, errors: validation.errors },
      { status: 422, headers: gate.headers },
    );
  }

  const updated = {
    ...existing,
    ...validation.rule,
  };
  rules[idx] = updated;
  await saveWorkflowRules(rules);

  void writeAuditChainEntry(
    { event: "workflow_rule.updated", actor: gate.keyId, meta: { id } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, rule: updated }, { headers: gate.headers });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const { id } = await params;
  const rules = await loadWorkflowRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) {
    return NextResponse.json(
      { ok: false, error: "Rule not found" },
      { status: 404, headers: gate.headers },
    );
  }

  const [deleted] = rules.splice(idx, 1);
  await saveWorkflowRules(rules);

  void writeAuditChainEntry(
    { event: "workflow_rule.deleted", actor: gate.keyId, meta: { id } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, deleted }, { headers: gate.headers });
}
