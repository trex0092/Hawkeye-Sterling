// GET /api/gdpr/export?subjectId=<id>[&format=csv]
//
// GDPR Article 20 — Right to data portability.
//
// Returns a structured JSON package (default) or a flat CSV (format=csv)
// containing the subject's compliance record and all associated cases. The
// response is served as a file attachment so the operator can forward it to
// the data subject or their legal representative.
//
// Query params:
//   subjectId (required) — the subject to export
//   format    (json|csv, default json) — output format
//
// Auth: API key or portal admin required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject } from "@/lib/server/subject-store";
import { loadAllCases } from "@/lib/server/case-vault";
import { buildGdprExportPackage } from "@/lib/server/gdpr";
import type { CaseRecord } from "@/lib/types";

/**
 * Sanitize a cell value for CSV output.
 * - Prefix formula-injection characters (=, +, -, @) with a single quote.
 * - Wrap in double-quotes and escape any embedded double-quotes.
 */
function escapeCsvCell(raw: string): string {
  // Guard against CSV injection (formula injection in spreadsheets).
  const sanitized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  // Wrap in quotes when the value contains commas, quotes, or newlines.
  if (sanitized.includes('"') || sanitized.includes(",") || sanitized.includes("\n")) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const startMs = Date.now();
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId")?.trim();
  const rawFormat = url.searchParams.get("format");
  const format: "json" | "csv" = rawFormat === "csv" ? "csv" : "json";
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

  // ── CSV export ────────────────────────────────────────────────────────────
  if (format === "csv") {
    // Emit a flat field/value CSV for the key personal-data fields.
    // Cases are summarised as a count; the full JSON export contains case detail.
    const rows: [string, string][] = [
      ["field", "value"],
      ["subjectId", subjectProfile.subjectId],
      ["name", subjectProfile.subjectName],
      ["createdAt", subjectProfile.createdAt ?? ""],
      ["updatedAt", subjectProfile.updatedAt ?? ""],
      ["riskScore", String(subjectForExport.riskScore)],
      ["riskCategory", subjectProfile.currentRiskCategory ?? ""],
      ["dueDiligence", subjectProfile.dueDiligence ?? ""],
      ["nextReviewDate", subjectProfile.nextReviewDate ?? ""],
      ["isPep", String(subjectProfile.isPep)],
      ["hasStrSarOnRecord", String(subjectProfile.hasStrSarOnRecord)],
      ["activeCaseId", subjectProfile.activeCaseId ?? ""],
      ["lastScreenedAt", subjectProfile.lastScreenedAt ?? ""],
      ["caseCount", String(subjectCases.length)],
      ["notes", subjectProfile.notes ?? ""],
      ["exportedAt", pkg.exportedAt],
    ];

    const csvContent = rows
      .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(","))
      .join("\n");

    const csvFilename = `gdpr-export-${subjectId}.csv`;
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        ...gate.headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
        "x-duration-ms": String(Date.now() - startMs),
      },
    });
  }

  // ── JSON export (default) ─────────────────────────────────────────────────
  const filename = `gdpr-export-${subjectId}.json`;
  const responseHeaders: Record<string, string> = {
    ...gate.headers,
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  return new NextResponse(
    JSON.stringify({ ...pkg, durationMs: Date.now() - startMs }, null, 2),
    {
      status: 200,
      headers: responseHeaders,
    },
  );
}
