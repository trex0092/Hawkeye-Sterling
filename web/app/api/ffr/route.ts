// POST/GET /api/ffr
//
// I4: Funds Freeze Report (FFR) — UAE regulatory filing endpoint.
// Handles FFR incidents and asset freezes under:
//   - Cabinet Resolution 74/2020 Art.4 (24-hour asset freeze obligation)
//   - UAE FDL No.10/2025 Art.26 (freeze reporting to CBUAE/FIU)
//   - MoE Circular 08/AML/2021 §6 (DPMS-specific freeze obligations)
//
// Project 06 in Asana handles FFR Incidents and Asset Freezes.
//
// Body (POST):
//   {
//     caseId: string;
//     subjectName: string;
//     freezeAmount?: number;
//     freezeCurrency?: string;
//     assetDescription: string;
//     triggerList: string;          // e.g. "uae_eocn", "un_consolidated"
//     triggerReference: string;     // designation reference
//     frozenAt: string;             // ISO timestamp of freeze
//     reportingOfficer: string;
//     rationale: string;
//     immediateFreeze?: boolean;    // true = within 24h of EOCN designation
//   }
//
// GET: list all open FFR records for the tenant

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, setJson, listKeys as _listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface FFRRecord {
  id: string;
  caseId: string;
  subjectName: string;
  freezeAmount?: number;
  freezeCurrency?: string;
  assetDescription: string;
  triggerList: string;
  triggerReference: string;
  frozenAt: string;
  reportedAt: string;
  reportingOfficer: string;
  rationale: string;
  immediateFreeze: boolean;
  status: "draft" | "submitted" | "acknowledged" | "released";
  slaDeadline: string;  // 24h from frozenAt per Cabinet Resolution 74/2020 Art.4
  slaStatus: "within" | "breached";
  regulatoryAnchor: string;
  tenant: string;
}

function ffrKey(tenant: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
  return `ffr/${tenant}/${safe}.json`;
}

function ffrIndexKey(tenant: string): string {
  return `ffr/${tenant}/_index.json`;
}

function computeSlaStatus(frozenAt: string): { slaDeadline: string; slaStatus: "within" | "breached" } {
  const frozen = Date.parse(frozenAt);
  if (isNaN(frozen)) {
    const now = Date.now();
    return { slaDeadline: new Date(now + 24 * 60 * 60 * 1000).toISOString(), slaStatus: "within" };
  }
  const deadline = new Date(frozen + 24 * 60 * 60 * 1000).toISOString();
  const slaStatus: "within" | "breached" = Date.now() <= frozen + 24 * 60 * 60 * 1000 ? "within" : "breached";
  return { slaDeadline: deadline, slaStatus };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Partial<FFRRecord>;
  try {
    body = (await req.json()) as Partial<FFRRecord>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  if (!body.subjectName?.trim()) return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400, headers: gate.headers });
  if (!body.assetDescription?.trim()) return NextResponse.json({ ok: false, error: "assetDescription is required" }, { status: 400, headers: gate.headers });
  if (!body.triggerList?.trim()) return NextResponse.json({ ok: false, error: "triggerList is required" }, { status: 400, headers: gate.headers });

  const frozenAt = body.frozenAt ?? new Date().toISOString();
  const { slaDeadline, slaStatus } = computeSlaStatus(frozenAt);
  const id = `FFR-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  const record: FFRRecord = {
    id,
    caseId: body.caseId ?? id,
    subjectName: sanitizeField(body.subjectName ?? ""),
    freezeAmount: body.freezeAmount,
    freezeCurrency: body.freezeCurrency ?? "AED",
    assetDescription: sanitizeField(body.assetDescription ?? ""),
    triggerList: body.triggerList ?? "",
    triggerReference: body.triggerReference ?? "",
    frozenAt,
    reportedAt: new Date().toISOString(),
    reportingOfficer: sanitizeField(body.reportingOfficer ?? gate.keyId),
    rationale: sanitizeField(body.rationale ?? ""),
    immediateFreeze: body.immediateFreeze ?? false,
    status: "draft",
    slaDeadline,
    slaStatus,
    regulatoryAnchor: "Cabinet Resolution 74/2020 Art.4 — 24-hour mandatory asset freeze. UAE FDL No.10/2025 Art.26 — freeze reporting to FIU.",
    tenant,
  };

  try {
    await setJson(ffrKey(tenant, id), record);

    // Update index
    const idx = (await getJson<string[]>(ffrIndexKey(tenant))) ?? [];
    idx.unshift(id);
    await setJson(ffrIndexKey(tenant), idx.slice(0, 500));

    void writeAuditChainEntry({
      event: "ffr.created",
      actor: gate.keyId,
      ffrId: id,
      caseId: record.caseId,
      subjectName: record.subjectName,
      triggerList: record.triggerList,
      slaStatus,
      immediateFreeze: record.immediateFreeze,
    }, tenant).catch(() => undefined);

    const httpStatus = slaStatus === "breached" ? 207 : 201;
    return NextResponse.json(
      {
        ok: true,
        id,
        record,
        slaWarning: slaStatus === "breached"
          ? "URGENT: SLA BREACHED — 24-hour freeze reporting window has passed. File immediately with FIU. Cabinet Resolution 74/2020 Art.4."
          : slaStatus === "within"
          ? `SLA within window — must be submitted to FIU by ${slaDeadline}`
          : undefined,
      },
      { status: httpStatus, headers: gate.headers },
    );
  } catch (err) {
    console.error("[ffr] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to create freeze report" }, { status: 500, headers: gate.headers });
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  try {
    const idx = (await getJson<string[]>(ffrIndexKey(tenant))) ?? [];
    const records = (await Promise.all(idx.slice(0, 100).map((id) => getJson<FFRRecord>(ffrKey(tenant, id)))))
      .filter((r): r is FFRRecord => r !== null);

    const filtered = (status ? records.filter((r) => r.status === status) : records)
      .map((r) => ({ ...r, ...computeSlaStatus(r.frozenAt) }));
    const breached = filtered.filter((r) => r.slaStatus === "breached");

    return NextResponse.json(
      {
        ok: true,
        tenant,
        total: filtered.length,
        breachedSla: breached.length,
        records: filtered,
        regulatoryNote: "Cabinet Resolution 74/2020 Art.4 requires asset freeze reports within 24 hours of designation.",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[ffr] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load freeze reports" }, { status: 500, headers: gate.headers });
  }
}
