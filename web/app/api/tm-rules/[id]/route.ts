// GET   /api/tm-rules/[id] — load a single TM rule change
// PATCH /api/tm-rules/[id] — update a TM rule change
//
// Regulatory basis: CBUAE AML/CFT Guidelines §7

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadTmRuleChange,
  updateTmRuleChange,
  type TmRuleChangePatch,
} from "@/lib/server/tm-rules";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const tenantId = tenantIdFromGate(gate);
  const record = await loadTmRuleChange(tenantId, id);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "TM rule change not found" },
      { status: 404, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: TmRuleChangePatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  let record;
  try {
    record = await updateTmRuleChange(tenantId, id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "TM rule change not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "tm_rule.updated", actor: gate.keyId, meta: { id } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}
