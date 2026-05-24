// PATCH  /api/approvals/[id]  — update a record
// DELETE /api/approvals/[id]  — delete a record

import { NextResponse } from "next/server";
import { getJson, setJson } from "@/lib/server/store";
import { enforce } from "@/lib/server/enforce";
import type { ApprovalRecord } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_KEY = "approvals/records.json";

async function loadRecords(): Promise<ApprovalRecord[]> {
  const data = await getJson<{ records: ApprovalRecord[] }>(STORE_KEY);
  return data?.records ?? [];
}

async function saveRecords(records: ApprovalRecord[]): Promise<void> {
  await setJson(STORE_KEY, { records });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const records = await loadRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const existing = records[idx]!;
  const approvalDate =
    "approvalDate" in body ? (body["approvalDate"] as string | null) : existing.approvalDate;
  const underProcess =
    "underProcess" in body ? body["underProcess"] === true : !approvalDate;

  const updated: ApprovalRecord = {
    ...existing,
    entityName:
      typeof body["entityName"] === "string" ? body["entityName"].trim() : existing.entityName,
    country:
      typeof body["country"] === "string" ? body["country"].trim() : existing.country,
    approvalDate,
    underProcess,
    riskScore: (["low", "medium", "high"].includes(body["riskScore"] as string)
      ? body["riskScore"]
      : existing.riskScore) as ApprovalRecord["riskScore"],
    countryDestinations: Array.isArray(body["countryDestinations"])
      ? (body["countryDestinations"] as string[])
      : existing.countryDestinations,
    updatedAt: new Date().toISOString(),
  };

  records[idx] = updated;
  await saveRecords(records);

  return NextResponse.json({ ok: true, record: updated }, { headers: gate.headers });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const records = await loadRecords();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  await saveRecords(filtered);
  return NextResponse.json({ ok: true }, { headers: gate.headers });
}
