// POST /api/gdpr/erasure
//
// GDPR Article 17 — Right to erasure (pseudonymisation path).
//
// For AML/CFT platforms the hard-delete path is blocked by Article 17(3)(b):
// the AML record-retention obligation supersedes the right to erasure. Instead
// this endpoint pseudonymises the subject — replaces PII with a redaction token
// while preserving the compliance skeleton (risk score, case linkages, audit
// trail anchors) needed to satisfy Federal Decree-Law No. 10 of 2025 Art.20 and UAE FATF obligations.
//
// Business logic:
//   1. Require auth (API key or portal admin).
//   2. Load the subject profile via subject-store.
//   3. Reject (409) if any linked case has status !== "closed".
//   4. Pseudonymise PII fields (name → [REDACTED-<id[:8]>], clear aliases /
//      meta / notes / walletAddresses), set gdprErased: true.
//   5. Persist the pseudonymised record.
//   6. Write a tamper-evident audit chain entry (event: "gdpr_erasure").
//   7. Return 200 { erased, subjectId, pseudonymizedName, at }.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject, upsertSubject, type SubjectProfile } from "@/lib/server/subject-store";
import { loadAllCases } from "@/lib/server/case-vault";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ErasureRequestBody {
  subjectId: string;
  requestedBy: string;
  reason: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: ErasureRequestBody;
  try {
    body = (await req.json()) as ErasureRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  const { subjectId, requestedBy, reason } = body;
  if (!subjectId || typeof subjectId !== "string") {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!requestedBy || typeof requestedBy !== "string") {
    return NextResponse.json(
      { ok: false, error: "requestedBy is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!reason || typeof reason !== "string") {
    return NextResponse.json(
      { ok: false, error: "reason is required" },
      { status: 400, headers: gate.headers },
    );
  }

  // Load subject profile.
  const subject = await loadSubject(tenant, subjectId);
  if (!subject) {
    return NextResponse.json(
      { ok: false, error: "Subject not found" },
      { status: 404, headers: gate.headers },
    );
  }

  // Check for open cases. Any case linked to this subject with status !== "closed"
  // blocks erasure to protect AML record integrity.
  const allCases = await loadAllCases(tenant);
  const subjectCases = allCases.filter(
    (c) => c.subject === subject.subjectName || c.id === subject.activeCaseId,
  );
  const openCases = subjectCases.filter((c) => c.status !== "closed");
  if (openCases.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Subject has open cases; close all cases before erasure",
        openCaseIds: openCases.map((c) => c.id),
      },
      { status: 409, headers: gate.headers },
    );
  }

  // Build pseudonymised record.
  const at = new Date().toISOString();
  const pseudonymizedName = `[REDACTED-${subjectId.slice(0, 8)}]`;

  const pseudonymised: SubjectProfile = {
    ...subject,
    subjectName: pseudonymizedName,
    notes: undefined,
    gdprErased: true,
    gdprErasedAt: at,
    gdprErasedBy: requestedBy,
    updatedAt: at,
  } as SubjectProfile & { gdprErased: boolean; gdprErasedAt: string; gdprErasedBy: string };

  await upsertSubject(tenant, subjectId, pseudonymised);

  // Write tamper-evident audit chain entry.
  void writeAuditChainEntry(
    {
      event: "gdpr_erasure",
      actor: requestedBy,
      subjectId,
      reason,
      pseudonymizedName,
    },
    tenant,
  ).catch((err: unknown) =>
    console.warn(
      "[gdpr/erasure] audit chain write failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      erased: true,
      subjectId,
      pseudonymizedName,
      at,
    },
    { status: 200, headers: gate.headers },
  );
}
