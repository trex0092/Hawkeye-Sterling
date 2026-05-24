// POST /api/regulatory/fintrac
//
// Generates FINTRAC-format XML for Suspicious Transaction Reports (STR),
// Large Cash Transaction Reports (LCT), and Electronic Funds Transfer
// Reports (EFT) per the FINTRAC XML schema 1.0.
//
// This is a connector stub — the generated XML must be uploaded to the
// FINTRAC F2R portal by the analyst. No direct submission API is used.
//
// Body: FintracFilingBody (see below)
// Returns: application/xml attachment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface FintracFilingBody {
  caseId: string;
  subjectName: string;
  reportType: "STR" | "LCT" | "EFT";
  amount?: number;
  currency?: string;
  narrative: string;
  analystName: string;
}

function isValidBody(raw: unknown): raw is FintracFilingBody {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["caseId"] === "string" && b["caseId"].length > 0 &&
    typeof b["subjectName"] === "string" && b["subjectName"].length > 0 &&
    (b["reportType"] === "STR" || b["reportType"] === "LCT" || b["reportType"] === "EFT") &&
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

function rootTagFor(reportType: FintracFilingBody["reportType"]): string {
  switch (reportType) {
    case "STR": return "FINTRAC_STR";
    case "LCT": return "FINTRAC_LCT";
    case "EFT": return "FINTRAC_EFT";
  }
}

function xmlnsFor(reportType: FintracFilingBody["reportType"]): string {
  const slug = reportType.toLowerCase();
  return `http://www.fintrac-canafe.gc.ca/${slug}/1.0`;
}

function buildFintracXml(body: FintracFilingBody): string {
  const transactionDate = new Date().toISOString();
  const generatedAt = new Date().toISOString();
  const rootTag = rootTagFor(body.reportType);
  const xmlns = xmlnsFor(body.reportType);

  const amountBlock =
    body.amount !== undefined
      ? `
  <TransactionAmount>
    <Amount>${body.amount.toFixed(2)}</Amount>
    <Currency>${escapeXml(body.currency ?? "CAD")}</Currency>
  </TransactionAmount>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Hawkeye Sterling — FINTRAC ${body.reportType} Connector Stub
     caseId      : ${escapeXml(body.caseId)}
     generatedAt : ${generatedAt}
     NOTICE: Upload this file to FINTRAC F2R. Do not submit by email. -->
<${rootTag} xmlns="${xmlns}">
  <ReportingEntity>
    <Name>Hawkeye Sterling</Name>
    <CaseReference>${escapeXml(body.caseId)}</CaseReference>
    <AnalystName>${escapeXml(body.analystName)}</AnalystName>
  </ReportingEntity>
  <TransactionDate>${transactionDate}</TransactionDate>
  <Subject>
    <Name>${escapeXml(body.subjectName)}</Name>
  </Subject>${amountBlock}
  <Narrative>${escapeXml(body.narrative)}</Narrative>
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
          "Required fields: caseId, subjectName, reportType (STR|LCT|EFT), narrative, analystName",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const xml = buildFintracXml(raw);
  const filename = `FINTRAC_${raw.reportType}_${raw.caseId}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(Buffer.byteLength(xml, "utf8")),
      "x-case-id": raw.caseId,
      "x-report-type": raw.reportType,
      "x-jurisdiction": "CA",
      "cache-control": "no-store",
    },
  });
}
