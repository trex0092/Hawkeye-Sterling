// GET  /api/tfs-alerts   → { ok, alerts } from Netlify Blobs
// POST /api/tfs-alerts   → merge client state with server, return merged

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import type { TFSAlert } from "@/lib/data/tfs-alert-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

const STORE_KEY = "hawkeye-tfs-alerts/v1.json";

async function loadServerAlerts(): Promise<TFSAlert[]> {
  try {
    const raw = await getJson<{ alerts: TFSAlert[] }>(STORE_KEY);
    return raw?.alerts ?? [];
  } catch (err) {
    console.warn("[tfs-alerts] failed to load server alerts — returning empty:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

function mergeAlerts(server: TFSAlert[], client: TFSAlert[]): TFSAlert[] {
  const map = new Map<string, TFSAlert>();
  for (const a of server) map.set(a.id, a);
  for (const a of client) {
    const existing = map.get(a.id);
    if (!existing) {
      map.set(a.id, a);
    } else {
      // Client wins when it has a newer action timestamp
      const clientActioned = a.dateActioned ?? "";
      const serverActioned = existing.dateActioned ?? "";
      if (clientActioned > serverActioned) {
        map.set(a.id, a);
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime(),
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const alerts = await loadServerAlerts();
  return NextResponse.json({ ok: true, alerts }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  try {
    const body = (await req.json()) as { alerts?: TFSAlert[] };
    const clientAlerts = Array.isArray(body.alerts) ? body.alerts : [];
    const serverAlerts = await loadServerAlerts();
    const merged = mergeAlerts(serverAlerts, clientAlerts);
    await setJson(STORE_KEY, { alerts: merged });

    const tenant = tenantIdFromGate(gate);
    void writeAuditChainEntry(
      { event: "tfs_alerts.merged", actor: gate.keyId, meta: { count: merged.length } },
      tenant,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, alerts: merged }, { headers: gate.headers });
  } catch (err) {
    console.error("[tfs-alerts] POST failed:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500, headers: gate.headers });
  }
}
