// POST /api/regulatory/dfsa
//
// Generates DFSA (Dubai Financial Services Authority) STR XML format.
// Suspicious Transaction Reports for the DIFC jurisdiction.
//
// This is a connector stub — the generated XML must be uploaded to the
// DFSA reporting portal by the analyst. No direct submission API is used.
//
// Body: DfsaFilingBody (see below)
// Returns: application/xml attachment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface DfsaFilingBody {
  caseId: string;
  subjectName: string;
  narrative: string;
  analystName: string;
  riskLevel: "high" | "medium" | "low";
}

function isValidBody(raw: unknown): raw is DfsaFilingBody {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["caseId"] === "string" && b["caseId"].length > 0 &&
    typeof b["subjectName"] === "string" && b["subjectName"].length > 0 &&
    typeof b["narrative"] === "string" && b["narrative"].length > 0 &&
    typeof b["analystName"] === "string" && b["analystName"].length > 0 &&
    (b["riskLevel"] === "high" || b["riskLevel"] === "medium" || b["riskLevel"] === "low")
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDfsaXml(body: DfsaFilingBody): string {
  const reportDate = new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Hawkeye Sterling — DFSA STR Connector Stub
     caseId      : ${escapeXml(body.caseId)}
     generatedAt : ${generatedAt}
     NOTICE: Upload this file to the DFSA reporting portal. Do not submit by email. -->
<DFSA_STR xmlns="http://www.dfsa.ae/schema/str/1.0">
  <Header>
    <Institution>Hawkeye Sterling</Institution>
    <Date>${reportDate}</Date>
    <CaseReference>${escapeXml(body.caseId)}</CaseReference>
    <AnalystName>${escapeXml(body.analystName)}</AnalystName>
    <GeneratedAt>${generatedAt}</GeneratedAt>
  </Header>
  <Subject>
    <Name>${escapeXml(body.subjectName)}</Name>
    <RiskLevel>${escapeXml(body.riskLevel)}</RiskLevel>
  </Subject>
  <Narrative>${escapeXml(body.narrative)}</Narrative>
</DFSA_STR>`;
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
          "Required fields: caseId, subjectName, narrative, analystName, riskLevel (high|medium|low)",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const xml = buildDfsaXml(raw);
  const filename = `DFSA_STR_${raw.caseId}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(Buffer.byteLength(xml, "utf8")),
      "x-case-id": raw.caseId,
      "x-report-type": "STR",
      "x-jurisdiction": "AE",
      "cache-control": "no-store",
    },
  });
}
