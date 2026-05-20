// GET  /api/rescreen-queue — list subjects pending re-screen
// POST /api/rescreen-queue — queue a subject for re-screen (e.g. after stale list refresh)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, setJson, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RescreenItem {
  subjectId:    string;
  subjectName:  string;
  reason:       string;
  queuedAt:     string;
  queuedBy:     string;
  completedAt?: string;
  status:       "pending" | "completed" | "failed";
}

function key(tenant: string, subjectId: string): string {
  const t = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  const s = subjectId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  return `hs-rescreen/${t}/${s}.json`;
}

function prefix(tenant: string): string {
  return `hs-rescreen/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const keys = await listKeys(prefix(tenant)).catch(() => [] as string[]);
  const items = await Promise.allSettled(keys.map((k) => getJson<RescreenItem>(k)));
  const queue = items
    .filter((r): r is PromiseFulfilledResult<RescreenItem> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  const pending   = queue.filter((i) => i.status === "pending").length;
  const completed = queue.filter((i) => i.status === "completed").length;

  return NextResponse.json({ ok: true, queue, pending, completed }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const { subjectId, subjectName, reason } = body;
  if (!subjectId || typeof subjectId !== "string") {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400 });
  }
  if (!subjectName || typeof subjectName !== "string") {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400 });
  }

  const item: RescreenItem = {
    subjectId: subjectId as string,
    subjectName: subjectName as string,
    reason: typeof reason === "string" ? reason.slice(0, 200) : "Stale list refresh",
    queuedAt: new Date().toISOString(),
    queuedBy: gate.keyId,
    status: "pending",
  };

  await setJson(key(tenant, subjectId as string), item);

  void writeAuditChainEntry({
    event: "rescreen.queued",
    actor: gate.keyId,
    subjectId: subjectId as string,
    subjectName: subjectName as string,
    reason: item.reason,
  }, tenant).catch(() => undefined);

  return NextResponse.json({ ok: true, item }, { status: 201, headers: gate.headers });
}
