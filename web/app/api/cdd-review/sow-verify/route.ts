import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SowSourceType =
  | "salary"
  | "business_income"
  | "investment"
  | "inheritance"
  | "property_sale"
  | "other";

interface SowRecord {
  id: string;
  subjectId: string;
  sourceType: SowSourceType;
  estimatedAmountAed: number;
  supportingDocumentDescription: string;
  verifiedBy: string;
  verifiedAt: string;
  sofVerified: boolean;
}

interface SowVerificationResponse {
  ok: boolean;
  sowVerified: boolean;
  sofVerified: boolean;
  records: SowRecord[];
  error?: string;
}

const VALID_SOURCE_TYPES: SowSourceType[] = [
  "salary",
  "business_income",
  "investment",
  "inheritance",
  "property_sale",
  "other",
];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

function recordsKey(tenant: string, subjectId: string): string {
  return `hs-sow-records/${safeId(tenant)}/${safeId(subjectId)}.json`;
}

function listPrefix(tenant: string): string {
  return `hs-sow-records/${safeId(tenant)}/`;
}

async function loadRecords(tenant: string, subjectId: string): Promise<SowRecord[]> {
  const data = await getJson<SowRecord[]>(recordsKey(tenant, subjectId));
  return data ?? [];
}

async function appendRecord(tenant: string, subjectId: string, record: SowRecord): Promise<SowRecord[]> {
  const existing = await loadRecords(tenant, subjectId);
  const updated = [...existing, record];
  await setJson(recordsKey(tenant, subjectId), updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Derive verification status from records
// ---------------------------------------------------------------------------

function deriveVerificationStatus(records: SowRecord[]): { sowVerified: boolean; sofVerified: boolean } {
  return {
    sowVerified: records.length > 0,
    sofVerified: records.some((r) => r.sofVerified === true),
  };
}

// ---------------------------------------------------------------------------
// GET handler — list SOW records for a subjectId
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 1 });
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId");

  if (!subjectId || typeof subjectId !== "string" || !subjectId.trim()) {
    return NextResponse.json(
      { ok: false, sowVerified: false, sofVerified: false, records: [], error: "subjectId query parameter is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const records = await loadRecords(tenant, subjectId.trim());
  const { sowVerified, sofVerified } = deriveVerificationStatus(records);

  const response: SowVerificationResponse = {
    ok: true,
    sowVerified,
    sofVerified,
    records,
  };

  return NextResponse.json(response, { headers: gate.headers });
}

// ---------------------------------------------------------------------------
// POST handler — create a new SOW record
// ---------------------------------------------------------------------------

interface PostBody {
  subjectId: string;
  sourceType: SowSourceType;
  estimatedAmountAed: number;
  supportingDocumentDescription: string;
  verifiedBy: string;
  sofVerified?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 3 });
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  // Validate required fields
  if (!body.subjectId || typeof body.subjectId !== "string" || !body.subjectId.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.sourceType || !VALID_SOURCE_TYPES.includes(body.sourceType)) {
    return NextResponse.json(
      { ok: false, error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  if (typeof body.estimatedAmountAed !== "number" || isNaN(body.estimatedAmountAed) || body.estimatedAmountAed < 0) {
    return NextResponse.json(
      { ok: false, error: "estimatedAmountAed must be a non-negative number" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.supportingDocumentDescription || typeof body.supportingDocumentDescription !== "string" || !body.supportingDocumentDescription.trim()) {
    return NextResponse.json(
      { ok: false, error: "supportingDocumentDescription is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.verifiedBy || typeof body.verifiedBy !== "string" || !body.verifiedBy.trim()) {
    return NextResponse.json(
      { ok: false, error: "verifiedBy is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const now = new Date().toISOString();
  const record: SowRecord = {
    id: `sow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subjectId: body.subjectId.trim(),
    sourceType: body.sourceType,
    estimatedAmountAed: body.estimatedAmountAed,
    supportingDocumentDescription: body.supportingDocumentDescription.trim(),
    verifiedBy: body.verifiedBy.trim(),
    verifiedAt: now,
    sofVerified: body.sofVerified === true,
  };

  const allRecords = await appendRecord(tenant, record.subjectId, record);
  const { sowVerified, sofVerified } = deriveVerificationStatus(allRecords);

  void writeAuditChainEntry(
    {
      event: "sow_verification.record_created",
      actor: gate.keyId,
      subjectId: record.subjectId,
      recordId: record.id,
      sourceType: record.sourceType,
      estimatedAmountAed: record.estimatedAmountAed,
      verifiedBy: record.verifiedBy,
      sofVerified: record.sofVerified ?? false,
      regulatoryBasis: "MOE Circular 6/2025 §4.2 · CBUAE Rulebook §6.4",
    },
    tenant,
  ).catch((err) =>
    console.warn(
      "[sow-verify] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const response: SowVerificationResponse & { record: SowRecord } = {
    ok: true,
    sowVerified,
    sofVerified,
    records: allRecords,
    record,
  };

  return NextResponse.json(response, { status: 201, headers: gate.headers });
}

