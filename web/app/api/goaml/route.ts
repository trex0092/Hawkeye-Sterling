import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
// Pull the compiled brain + integrations from dist — the other screening
// routes do the same to keep cold-start below the 10s Netlify Function cap.
import { serialiseGoamlXml } from "../../../../dist/src/integrations/goaml-xml.js";
import type {
  GoAmlEnvelope,
  GoAmlPerson,
  GoAmlEntity,
  GoAmlReportCode,
} from "../../../../dist/src/brain/goaml-shapes.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/goaml
// Body: {
//   reportCode: "STR" | "SAR" | "FFR" | "PNMR" | "CTR" | "AIF" | "EFT" | "HRC" | "RFI"
//   subject: { name, entityType, jurisdiction?, dob?, aliases?, idNumber?, caseId? }
//   narrative: string
//   amountAed?: number
//   counterparty?: string
// }
// Returns application/xml — a goAML envelope ready for FIU upload.
//
// Config via env:
//   GOAML_RENTITY_ID        — Reporting entity goAML ID (required for
//                             real submissions; falls back to a placeholder)
//   GOAML_RENTITY_BRANCH    — optional branch code
//   GOAML_MLRO_FULL_NAME    — MLRO full name
//   GOAML_MLRO_EMAIL        — MLRO email
//   GOAML_MLRO_PHONE        — MLRO phone

interface Body {
  reportCode: GoAmlReportCode;
  subject: {
    name: string;
    entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
    jurisdiction?: string;
    dob?: string;
    aliases?: string[];
    idNumber?: string;
    caseId?: string;
  };
  narrative: string;
  amountAed?: number;
  counterparty?: string;
  reportingEntity?: string;
}

const VALID_REPORT_CODES = new Set<GoAmlReportCode>([
  "STR", "SAR", "FFR", "PNMR", "CTR", "AIF", "EFT", "HRC", "RFI",
]);

function safeFilenameSegment(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

function splitFullName(full: string): { first: string; last: string; middle?: string } {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: full, last: full };
  if (tokens.length === 1) return { first: tokens[0]!, last: tokens[0]! };
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  const middle = tokens.length > 2 ? tokens.slice(1, -1).join(" ") : undefined;
  return middle ? { first, last, middle } : { first, last };
}

async function handleGoaml(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!body?.subject?.name || !body?.reportCode || !body?.narrative) {
    return NextResponse.json(
      { ok: false, error: "subject.name, reportCode and narrative are required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!VALID_REPORT_CODES.has(body.reportCode)) {
    return NextResponse.json(
      {
        ok: false,
        error: `reportCode must be one of ${Array.from(VALID_REPORT_CODES).join(", ")}`,
      },
      { status: 400, headers: gateHeaders },
    );
  }

  const now = new Date();
  const iso = now.toISOString();
  const reportRef = `HWK-${body.reportCode}-${
    now.getUTCFullYear()
  }${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${
    body.subject.caseId ?? safeFilenameSegment(body.subject.name).slice(0, 16)
  }`;

  const involvedPersons: GoAmlPerson[] = [];
  const involvedEntities: GoAmlEntity[] = [];

  if (body.subject.entityType === "individual") {
    const n = splitFullName(body.subject.name);
    const person: GoAmlPerson = {
      firstName: n.first,
      ...(n.middle ? { middleName: n.middle } : {}),
      lastName: n.last,
      ...(body.subject.dob ? { dateOfBirth: body.subject.dob } : {}),
      ...(body.subject.jurisdiction ? { nationality1: body.subject.jurisdiction } : {}),
      ...(body.subject.idNumber
        ? {
            identification: [
              {
                type: "national_id",
                number: body.subject.idNumber,
                ...(body.subject.jurisdiction
                  ? { issueCountryIso2: body.subject.jurisdiction }
                  : {}),
              },
            ],
          }
        : {}),
    };
    involvedPersons.push(person);
  } else {
    const entity: GoAmlEntity = {
      legalName: body.subject.name,
      incorporationCountryIso2: body.subject.jurisdiction ?? "AE",
      addresses: [],
      ...(body.subject.idNumber ? { registrationNumber: body.subject.idNumber } : {}),
    };
    involvedEntities.push(entity);
  }

  const envelope: GoAmlEnvelope = {
    reportCode: body.reportCode,
    rentityId: process.env["GOAML_RENTITY_ID"] ?? "PENDING_FIU_ASSIGNMENT",
    ...(process.env["GOAML_RENTITY_BRANCH"]
      ? { rentityBranch: process.env["GOAML_RENTITY_BRANCH"] }
      : {}),
    reportingPerson: {
      fullName: process.env["GOAML_MLRO_FULL_NAME"] ?? "Luisa Fernanda",
      occupation: "MLRO",
      email: process.env["GOAML_MLRO_EMAIL"] ?? "mlro@fine-gold.ae",
      phoneNumber: process.env["GOAML_MLRO_PHONE"] ?? "+971-000-000-0000",
    },
    submissionCode: "E",
    currencyCodeLocal: "AED",
    reason: body.narrative.slice(0, 4000),
    ...(involvedPersons.length > 0 ? { involvedPersons } : {}),
    ...(involvedEntities.length > 0 ? { involvedEntities } : {}),
    ...(body.amountAed && body.amountAed > 0
      ? {
          transactions: [
            {
              transactionNumber: `${reportRef}-TXN-1`,
              date: iso,
              amountLocal: body.amountAed,
              currency: "AED",
              type: "cash",
              ...(body.counterparty ? { counterpartyName: body.counterparty } : {}),
            },
          ],
        }
      : {}),
    internalReference: reportRef,
    generatedAt: iso,
    // The brain seals every envelope with the charter-integrity hash so
    // regulators can verify the filing was produced by a known build.
    // We use a deterministic placeholder here; the real submission path
    // (src/enterprise/goaml-submission.ts) recomputes it before upload.
    charterIntegrityHash: "sha256:hawkeye-sterling:pending-submission",
  };

  let xml: string;
  try {
    xml = serialiseGoamlXml(envelope);
  } catch (err) {
    console.error("goaml serialise failed", err);
    return NextResponse.json(
      { ok: false, error: "goaml serialise failed" },
      { status: 500, headers: gateHeaders },
    );
  }

  const filename = `goaml-${body.reportCode.toLowerCase()}-${safeFilenameSegment(reportRef)}.xml`;
  return new Response(xml, {
    status: 200,
    headers: {
      ...gateHeaders,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export const POST = handleGoaml;
