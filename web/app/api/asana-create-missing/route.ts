import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DEPRECATED — superseded by /api/asana-bootstrap-workspace (2026-06-10
// workspace rebuild, operator-approved 90-board topology).
//
// This endpoint used to create the legacy numbered boards (03 · Audit Log,
// 04 · Four-Eyes, …) on demand. That taxonomy was retired when the operator
// deleted the old project set; recreating legacy-named boards would pollute
// the canonical per-module workspace defined in
// web/lib/server/asana-workspace-map.ts. It now returns 410 Gone and points
// callers at the bootstrap endpoint, which is idempotent and covers all 90
// canonical boards.

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "asana-create-missing_deprecated_call", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  return NextResponse.json(
    {
      ok: false,
      error: "endpoint_retired",
      detail:
        "Superseded by POST /api/asana-bootstrap-workspace (modes: create, digest-tasks, export). " +
        "The canonical 90-board workspace is defined in web/lib/server/asana-workspace-map.ts.",
    },
    { status: 410, headers: gate.headers },
  );
}
