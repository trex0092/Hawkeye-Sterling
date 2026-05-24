import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { lookupSmelter, addManualSmelter } from "@/lib/server/rmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  try {
    const smelters = await lookupSmelter(tenantId, q);
    return NextResponse.json({ ok: true, smelters, total: smelters.length }, { headers: gate.headers });
  } catch (err) {
    console.error("[rmap] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load smelter database" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const required = ["facilityName", "country", "countryCode", "products", "rmapStatus", "cid"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { ok: false, error: `Missing required field: ${field}` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  try {
    const smelter = await addManualSmelter(tenantId, {
      cid: String(body["cid"]),
      facilityName: String(body["facilityName"]),
      country: String(body["country"]),
      countryCode: String(body["countryCode"]),
      products: body["products"] as ("gold" | "tin" | "tantalum" | "tungsten" | "cobalt")[],
      rmapStatus: body["rmapStatus"] as "conformant" | "active_placement" | "not_assessed" | "suspended",
      lastAuditDate: body["lastAuditDate"] as string | undefined,
      auditValidity: body["auditValidity"] as "1_year" | "3_year" | undefined,
    });
    return NextResponse.json({ ok: true, smelter }, { status: 201, headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 409, headers: gate.headers });
    }
    console.error("[rmap] POST failed:", msg);
    return NextResponse.json({ ok: false, error: "Failed to add smelter" }, { status: 500, headers: gate.headers });
  }
}
