// POST /api/regulatory/mas
//
// Generates MAS (Monetary Authority of Singapore) STR JSON format.
// MAS accepts structured JSON for Suspicious Transaction Reports.
//
// This is a connector stub — the generated JSON must be uploaded to the
// MAS STRO portal by the analyst. No direct submission API is used.
//
// Body: MasFilingBody (see below)
// Returns: application/json attachment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface MasFilingBody {
  caseId: string;
  subjectName: string;
  narrative: string;
  analystName: string;
  suspiciousActivity: string[];
}

function isValidBody(raw: unknown): raw is MasFilingBody {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["caseId"] === "string" && b["caseId"].length > 0 &&
    typeof b["subjectName"] === "string" && b["subjectName"].length > 0 &&
    typeof b["narrative"] === "string" && b["narrative"].length > 0 &&
    typeof b["analystName"] === "string" && b["analystName"].length > 0 &&
    Array.isArray(b["suspiciousActivity"]) &&
    (b["suspiciousActivity"] as unknown[]).every((s) => typeof s === "string")
  );
}

interface MasStrReport {
  reportType: "STR";
  reportingInstitution: string;
  reportDate: string;
  caseReference: string;
  analystName: string;
  subject: { name: string };
  suspiciousActivities: string[];
  narrative: string;
  generatedAt: string;
  notice: string;
}

function buildMasReport(body: MasFilingBody): MasStrReport {
  const now = new Date().toISOString();
  return {
    reportType: "STR",
    reportingInstitution: "Hawkeye Sterling",
    reportDate: now.slice(0, 10),
    caseReference: body.caseId,
    analystName: body.analystName,
    subject: {
      name: body.subjectName,
    },
    suspiciousActivities: body.suspiciousActivity,
    narrative: body.narrative,
    generatedAt: now,
    notice:
      "Connector stub — upload this file to the MAS STRO portal. Do not submit by email.",
  };
}

export async function POST(req: Request): Promise<NextResponse | Response> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Request body is not valid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!isValidBody(raw)) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_error",
        message:
          "Required fields: caseId, subjectName, narrative, analystName, suspiciousActivity (string[])",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const report = buildMasReport(raw);
  const jsonBody = JSON.stringify(report, null, 2);
  const filename = `MAS_STR_${raw.caseId}.json`;

  return new Response(jsonBody, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(Buffer.byteLength(jsonBody, "utf8")),
      "x-case-id": raw.caseId,
      "x-report-type": "STR",
      "x-jurisdiction": "SG",
      "cache-control": "no-store",
    },
  });
}
