// POST /api/regulatory/austrac
//
// Generates AUSTRAC-format XML for Suspicious Matter Reports (SMR) and
// Threshold Transaction Reports (TTR) per the AUSTRAC SMR XML schema v3.1.
//
// This is a connector stub — the generated XML must be uploaded to the
// AUSTRAC Online portal by the analyst. No direct submission API is used.
//
// Body: AustracFilingBody (see below)
// Returns: application/xml attachment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface AustracFilingBody {
  caseId: string;
  subjectName: string;
  reportType: "SMR" | "TTR";
  amount?: number;
  currency?: string;
  narrative: string;
  analystName: string;
}

function isValidBody(raw: unknown): raw is AustracFilingBody {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["caseId"] === "string" && b["caseId"].length > 0 &&
    typeof b["subjectName"] === "string" && b["subjectName"].length > 0 &&
    (b["reportType"] === "SMR" || b["reportType"] === "TTR") &&
    typeof b["narrative"] === "string" && b["narrative"].length > 0 &&
    typeof b["analystName"] === "string" && b["analystName"].length > 0
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

function buildAustracXml(body: AustracFilingBody): string {
  const reportDate = new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();
  const rootTag = body.reportType === "SMR" ? "AUSTRAC_SMR" : "AUSTRAC_TTR";
  const xmlns =
    body.reportType === "SMR"
      ? "http://www.austrac.gov.au/schema/smr/3.1"
      : "http://www.austrac.gov.au/schema/ttr/3.1";

  const amountBlock =
    body.amount !== undefined
      ? `
    <Transaction>
      <Amount>${body.amount.toFixed(2)}</Amount>
      <Currency>${escapeXml(body.currency ?? "AUD")}</Currency>
    </Transaction>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Hawkeye Sterling — AUSTRAC ${body.reportType} Connector Stub
     caseId      : ${escapeXml(body.caseId)}
     generatedAt : ${generatedAt}
     NOTICE: Upload this file to AUSTRAC Online. Do not submit by email. -->
<${rootTag} xmlns="${xmlns}">
  <ReportHeader>
    <ReportType>${body.reportType}</ReportType>
    <ReportingEntity>Hawkeye Sterling</ReportingEntity>
    <ReportDate>${reportDate}</ReportDate>
    <CaseReference>${escapeXml(body.caseId)}</CaseReference>
    <AnalystName>${escapeXml(body.analystName)}</AnalystName>
  </ReportHeader>
  <Subject>
    <Name>${escapeXml(body.subjectName)}</Name>
    <ReportNarrative>${escapeXml(body.narrative)}</ReportNarrative>
  </Subject>
  <Transactions>${amountBlock}
  </Transactions>
</${rootTag}>`;
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
          "Required fields: caseId, subjectName, reportType (SMR|TTR), narrative, analystName",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const xml = buildAustracXml(raw);
  const filename = `AUSTRAC_${raw.reportType}_${raw.caseId}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(Buffer.byteLength(xml, "utf8")),
      "x-case-id": raw.caseId,
      "x-report-type": raw.reportType,
      "x-jurisdiction": "AU",
      "cache-control": "no-store",
    },
  });
}
