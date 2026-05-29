// POST /api/regulatory/fincen-sar
//
// Generates a FinCEN SAR (Suspicious Activity Report) in FinCEN BSA
// e-filing XML format (Form 111 structure).
//
// This is a connector stub — the generated XML must be uploaded to the
// FinCEN BSA E-Filing System by the MLRO. No direct submission API is
// used.
//
// Body: FinCenSarBody (see below)
// Returns: application/xml attachment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

interface FilingInstitution {
  name: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface Subject {
  name: string;
  dob?: string;
  ssn?: string;
  address?: string;
  idType?: string;
  idNumber?: string;
}

interface SuspiciousActivity {
  type: string;        // "structuring" | "money_laundering" | "other"
  amount: number;      // USD
  startDate: string;   // ISO
  endDate: string;     // ISO
  description: string;
}

interface FinCenSarBody {
  filingInstitution: FilingInstitution;
  subject: Subject;
  activity: SuspiciousActivity;
  narrative: string;
  filedBy: string;
}

function isFilingInstitution(v: unknown): v is FilingInstitution {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["name"] === "string" && o["name"].length > 0 &&
    typeof o["ein"] === "string" && o["ein"].length > 0 &&
    typeof o["address"] === "string" && o["address"].length > 0 &&
    typeof o["city"] === "string" && o["city"].length > 0 &&
    typeof o["state"] === "string" && o["state"].length > 0 &&
    typeof o["zip"] === "string" && o["zip"].length > 0
  );
}

function isSubject(v: unknown): v is Subject {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o["name"] === "string" && o["name"].length > 0;
}

function isActivity(v: unknown): v is SuspiciousActivity {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["type"] === "string" && o["type"].length > 0 &&
    typeof o["amount"] === "number" && o["amount"] >= 0 &&
    typeof o["startDate"] === "string" && o["startDate"].length > 0 &&
    typeof o["endDate"] === "string" && o["endDate"].length > 0 &&
    typeof o["description"] === "string" && o["description"].length > 0
  );
}

function isValidBody(raw: unknown): raw is FinCenSarBody {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    isFilingInstitution(b["filingInstitution"]) &&
    isSubject(b["subject"]) &&
    isActivity(b["activity"]) &&
    typeof b["narrative"] === "string" && b["narrative"].length > 0 &&
    typeof b["filedBy"] === "string" && b["filedBy"].length > 0
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

function activityTypeCode(type: string): string {
  switch (type.toLowerCase()) {
    case "structuring": return "A";
    case "money_laundering": return "B";
    default: return "Z"; // other
  }
}

function buildFinCenSarXml(body: FinCenSarBody): string {
  const generatedAt = new Date().toISOString();
  const reportDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const inst = body.filingInstitution;
  const subj = body.subject;
  const act = body.activity;

  // Truncate narrative to 4000 chars per FinCEN spec.
  const narrativeTrunc = body.narrative.slice(0, 4000);

  const subjectOptional = [
    subj.dob ? `      <BirthDate>${escapeXml(subj.dob)}</BirthDate>` : "",
    subj.ssn ? `      <TIN>${escapeXml(subj.ssn)}</TIN>` : "",
    subj.address ? `      <Address>${escapeXml(subj.address)}</Address>` : "",
    subj.idType
      ? `      <Identification>
        <IDType>${escapeXml(subj.idType)}</IDType>
        <IDNumber>${escapeXml(subj.idNumber ?? "")}</IDNumber>
      </Identification>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Hawkeye Sterling — FinCEN SAR Form 111 Connector Stub
     generatedAt : ${generatedAt}
     NOTICE: Upload this file to FinCEN BSA E-Filing System.
             Do not transmit by email. -->
<FinCEN_BSA_FILING xmlns="FinCEN/SAR/2.0" formTypeCode="111">
  <Activity>
    <ActivityAssociation>
      <CorrectsAmendsPriorReportIndicator>N</CorrectsAmendsPriorReportIndicator>
    </ActivityAssociation>
    <FilingInstitution>
      <OrganizationName>${escapeXml(inst.name)}</OrganizationName>
      <EIN>${escapeXml(inst.ein)}</EIN>
      <Address>
        <RawAddress>${escapeXml(inst.address)}</RawAddress>
        <City>${escapeXml(inst.city)}</City>
        <State>${escapeXml(inst.state)}</State>
        <ZipCode>${escapeXml(inst.zip)}</ZipCode>
        <Country>US</Country>
      </Address>
      <FilingDateText>${reportDate}</FilingDateText>
      <ContactName>${escapeXml(body.filedBy)}</ContactName>
    </FilingInstitution>
    <SubjectInformation>
      <PartyName>
        <RawPartyFullName>${escapeXml(subj.name)}</RawPartyFullName>
      </PartyName>
${subjectOptional}
    </SubjectInformation>
    <SuspiciousActivity>
      <ActivityTypeCode>${activityTypeCode(act.type)}</ActivityTypeCode>
      <ActivityTypeDescription>${escapeXml(act.type)}</ActivityTypeDescription>
      <CumulativeAmount>${act.amount.toFixed(2)}</CumulativeAmount>
      <StartDateText>${escapeXml(act.startDate)}</StartDateText>
      <EndDateText>${escapeXml(act.endDate)}</EndDateText>
      <ActivityDescription>${escapeXml(act.description)}</ActivityDescription>
    </SuspiciousActivity>
    <ActivityNarrative>
      <NarrativeText>${escapeXml(narrativeTrunc)}</NarrativeText>
    </ActivityNarrative>
  </Activity>
</FinCEN_BSA_FILING>`;
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
          "Required: filingInstitution{name,ein,address,city,state,zip}, subject{name}, " +
          "activity{type,amount,startDate,endDate,description}, narrative, filedBy",
      },
      { status: 400, headers: gate.headers },
    );
  }

  const xml = buildFinCenSarXml(raw);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `fincen-sar-${dateStamp}.xml`;

  // Audit log — fire-and-forget, non-blocking.
  void writeAuditChainEntry({
    event: "fincen_sar.generated",
    actor: raw.filedBy,
    subject: raw.subject.name,
    activityType: raw.activity.type,
    amount: raw.activity.amount,
  }).catch((err: unknown) => {
    console.error("[fincen-sar] audit write failed:", err instanceof Error ? err.message : String(err));
  });

  return new Response(xml, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(Buffer.byteLength(xml, "utf8")),
      "x-jurisdiction": "US",
      "x-form-type": "FinCEN-SAR-111",
      "cache-control": "no-store",
    },
  });
}
