// GET  /api/risk-appetite  — returns current risk appetite config for the tenant
// PUT  /api/risk-appetite  — updates config (validates thresholds + weights)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  getRiskAppetite,
  saveRiskAppetite,
  type RiskAppetiteConfig,
} from "@/lib/server/risk-appetite";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  try {
    const config = await getRiskAppetite(tenant);
    return NextResponse.json({ ok: true, config }, { headers: gate.headers });
  } catch (err) {
    console.error("[risk-appetite] getRiskAppetite failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to load risk appetite config" }, { status: 500, headers: gate.headers });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Extract + validate thresholds
  const thresholds = body["thresholds"] as Record<string, unknown> | undefined;
  if (!thresholds || typeof thresholds !== "object") {
    return NextResponse.json(
      { ok: false, error: "thresholds object required" },
      { status: 400, headers: gate.headers },
    );
  }

  const autoApprove    = Number(thresholds["autoApprove"]);
  const reviewRequired = Number(thresholds["reviewRequired"]);
  const autoEscalate   = Number(thresholds["autoEscalate"]);

  if (!isFinite(autoApprove) || !isFinite(reviewRequired) || !isFinite(autoEscalate)) {
    return NextResponse.json(
      { ok: false, error: "thresholds.autoApprove, reviewRequired, autoEscalate must be numbers" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!(autoApprove < reviewRequired && reviewRequired < autoEscalate)) {
    return NextResponse.json(
      { ok: false, error: "thresholds must be strictly ascending: autoApprove < reviewRequired < autoEscalate" },
      { status: 400, headers: gate.headers },
    );
  }

  // Extract + validate weights
  const adverseMediaWeight = Number(body["adverseMediaWeight"]);
  const sanctionsWeight    = Number(body["sanctionsWeight"]);
  const pepWeight          = Number(body["pepWeight"]);

  if (!isFinite(adverseMediaWeight) || !isFinite(sanctionsWeight) || !isFinite(pepWeight)) {
    return NextResponse.json(
      { ok: false, error: "adverseMediaWeight, sanctionsWeight, pepWeight must be numbers" },
      { status: 400, headers: gate.headers },
    );
  }
  if (adverseMediaWeight < 0 || adverseMediaWeight > 1 ||
      sanctionsWeight < 0    || sanctionsWeight > 1    ||
      pepWeight < 0          || pepWeight > 1) {
    return NextResponse.json(
      { ok: false, error: "weights must be between 0 and 1" },
      { status: 400, headers: gate.headers },
    );
  }
  if (adverseMediaWeight + sanctionsWeight + pepWeight > 1.0 + 1e-9) {
    return NextResponse.json(
      { ok: false, error: "adverseMediaWeight + sanctionsWeight + pepWeight must sum to ≤ 1.0" },
      { status: 400, headers: gate.headers },
    );
  }

  // Extract + validate customer segments
  const segsRaw = body["customerSegments"] as Record<string, unknown> | undefined;
  if (!segsRaw || typeof segsRaw !== "object") {
    return NextResponse.json(
      { ok: false, error: "customerSegments object required" },
      { status: 400, headers: gate.headers },
    );
  }

  function extractMultiplier(key: string): number | null {
    const seg = segsRaw![key] as Record<string, unknown> | undefined;
    if (!seg || typeof seg !== "object") return null;
    const m = Number(seg["multiplier"]);
    return isFinite(m) && m >= 0 ? m : null;
  }

  const retailM    = extractMultiplier("retail");
  const corporateM = extractMultiplier("corporate");
  const pepM       = extractMultiplier("pep");
  const highRiskM  = extractMultiplier("highRisk");

  if (retailM === null || corporateM === null || pepM === null || highRiskM === null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "customerSegments.{retail,corporate,pep,highRisk}.multiplier must each be a non-negative number",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const updatedBy =
    typeof body["updatedBy"] === "string" && body["updatedBy"].trim()
      ? body["updatedBy"].trim()
      : gate.keyId;

  const config: RiskAppetiteConfig = {
    tenantId: tenant,
    updatedAt: new Date().toISOString(),
    updatedBy,
    thresholds: { autoApprove, reviewRequired, autoEscalate },
    customerSegments: {
      retail:    { multiplier: retailM },
      corporate: { multiplier: corporateM },
      pep:       { multiplier: pepM },
      highRisk:  { multiplier: highRiskM },
    },
    adverseMediaWeight,
    sanctionsWeight,
    pepWeight,
  };

  try {
    await saveRiskAppetite(config);
  } catch (err) {
    console.error("[risk-appetite] saveRiskAppetite failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to save risk appetite config" }, { status: 500, headers: gate.headers });
  }

  void writeAuditChainEntry(
    { event: "risk_appetite.updated", actor: gate.keyId, meta: { updatedBy: config.updatedBy } },
    tenant,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, config }, { headers: gate.headers });
}
