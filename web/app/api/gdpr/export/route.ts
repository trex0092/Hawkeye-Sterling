// GET /api/gdpr/export?subjectId=<id>
//
// GDPR Article 20 — Right to data portability.
//
// Returns a structured JSON package containing the subject's compliance
// record and all associated cases. The response is served as a file
// attachment so the operator can forward it to the data subject or their
// legal representative.
//
// Auth: API key or portal admin required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject } from "@/lib/server/subject-store";
import { loadAllCases } from "@/lib/server/case-vault";
import { buildGdprExportPackage } from "@/lib/server/gdpr";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId")?.trim();
  if (!subjectId) {
    return NextResponse.json(
      { ok: false, error: "subjectId query param is required" },
      { status: 400, headers: gate.headers },
    );
  }

  // Load the subject profile.
  const subjectProfile = await loadSubject(tenant, subjectId);
  if (!subjectProfile) {
    return NextResponse.json(
      { ok: false, error: "Subject not found" },
      { status: 404, headers: gate.headers },
    );
  }

  // Load cases associated with this subject (by name or activeCaseId).
  const allCases = await loadAllCases(tenant);
  const subjectCases: CaseRecord[] = allCases.filter(
    (c) =>
      c.subject === subjectProfile.subjectName ||
      c.id === subjectProfile.activeCaseId,
  );

  // Build a Subject-shaped object from the SubjectProfile for the export
  // package. SubjectProfile is the compliance law standing; the export
  // should surface the fields that constitute "personal data" under GDPR.
  const subjectForExport = {
    id: subjectProfile.subjectId,
    name: subjectProfile.subjectName,
    meta: "",
    country: "",
    jurisdiction: "",
    badge: "",
    badgeTone: "dashed" as const,
    type: "Individual · Customer" as const,
    entityType: "individual" as const,
    riskScore: 0,
    status: "active" as const,
    cddPosture: subjectProfile.dueDiligence as "CDD" | "EDD" | "SDD",
    listCoverage: [] as import("@/lib/types").SanctionSource[],
    exposureAED: "",
    slaNotify: "",
    mostSerious: "",
    openedAgo: "",
    openedAt: subjectProfile.createdAt,
    notes: subjectProfile.notes,
    riskCategory: subjectProfile.currentRiskCategory,
  };

  const pkg = buildGdprExportPackage(subjectForExport, subjectCases);

  const filename = `gdpr-export-${subjectId}.json`;
  const responseHeaders: Record<string, string> = {
    ...gate.headers,
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  return new NextResponse(JSON.stringify(pkg, null, 2), {
    status: 200,
    headers: responseHeaders,
  });
}
