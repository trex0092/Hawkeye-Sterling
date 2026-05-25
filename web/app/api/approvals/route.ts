// GET  /api/approvals  — list all approval records
// POST /api/approvals  — create a new approval record

import { NextResponse } from "next/server";
import { getJson, setJson } from "@/lib/server/store";
import { enforce } from "@/lib/server/enforce";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_KEY = "approvals/records.json";

export interface ApprovalRecord {
  id: string;
  entityName: string;
  country: string;
  approvalDate: string | null;    // ISO date string or null
  underProcess: boolean;
  riskScore: "low" | "medium" | "high";
  countryDestinations: string[];
  createdAt: string;
  updatedAt: string;
}

async function loadRecords(): Promise<ApprovalRecord[]> {
  const data = await getJson<{ records: ApprovalRecord[] }>(STORE_KEY);
  return data?.records ?? [];
}

async function saveRecords(records: ApprovalRecord[]): Promise<void> {
  await setJson(STORE_KEY, { records });
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const records = await loadRecords();
  return NextResponse.json({ ok: true, records }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const entityName = (body["entityName"] as string | undefined)?.trim();
  const country = (body["country"] as string | undefined)?.trim();
  const riskScore = body["riskScore"] as string | undefined;
  const countryDestinations = body["countryDestinations"];
  const approvalDate = body["approvalDate"] as string | null | undefined;
  const underProcess = body["underProcess"] === true || !approvalDate;

  if (!entityName) {
    return NextResponse.json({ ok: false, error: "entityName is required" }, { status: 400 });
  }
  if (!country) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400 });
  }
  if (!riskScore || !["low", "medium", "high"].includes(riskScore)) {
    return NextResponse.json({ ok: false, error: "riskScore must be low, medium, or high" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const record: ApprovalRecord = {
    id: randomUUID(),
    entityName,
    country,
    approvalDate: approvalDate ?? null,
    underProcess,
    riskScore: riskScore as ApprovalRecord["riskScore"],
    countryDestinations: Array.isArray(countryDestinations)
      ? (countryDestinations as string[]).filter((d) => typeof d === "string")
      : [],
    createdAt: now,
    updatedAt: now,
  };

  const records = await loadRecords();
  records.unshift(record);
  await saveRecords(records);

  return NextResponse.json({ ok: true, record }, { status: 201, headers: gate.headers });
}
