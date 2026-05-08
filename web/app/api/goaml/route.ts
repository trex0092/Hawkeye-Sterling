import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getEntity } from "@/lib/config/entities";
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
export const maxDuration = 30;

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
  amount?: number;
  currency?: string;
  counterparty?: string;
  reportingEntity?: string;
  /** Slug of the reporting entity from HAWKEYE_ENTITIES. When omitted,
   *  resolves to HAWKEYE_DEFAULT_ENTITY_ID, then to the first entity. */
  entityId?: string;
  /** Optional screening provenance — when present, the goAML envelope
   *  carries an XML-comment header tying this filing to the specific
   *  screening disposition that produced it (run id + dual SHA-256 +
   *  optional HMAC signature). Lets a regulator verify the goAML XML
   *  and the .txt / PDF / JSON sidecar all came from the same brain
   *  run. Omitting it falls back to today's behaviour (charter hash
   *  placeholder; no provenance comment). */
  screeningProvenance?: {
    runId?: string;
    payloadSha256?: string;
    reportSha256?: string;
    signature?: string;
    signingKeyFp?: string;
    engineVersion?: string;
    schemaVersion?: string;
    buildSha?: string;
    generatedAt?: string;
  };
}

const VALID_REPORT_CODES = new Set<GoAmlReportCode>([
  "STR", "SAR", "FFR", "PNMR", "CTR", "AIF", "EFT", "HRC", "RFI",
]);

// Compute the charter-integrity hash for a goAML envelope.
// Uses HMAC-SHA256(key=GOAML_SIGNING_SECRET, data=reportRef+narrative+timestamp)
// when a signing secret is configured; falls back to plain SHA-256.
// This gives regulators a cryptographic tie between the envelope and the
// Hawkeye Sterling build that generated it.
async function computeCharterHash(
  reportRef: string,
  narrative: string,
  generatedAt: string,
): Promise<string> {
  try {
    const enc = new TextEncoder();
    const payload = enc.encode(`${reportRef}|${generatedAt}|${narrative.slice(0, 512)}`);
    const signingSecret = process.env["GOAML_SIGNING_SECRET"];
    if (signingSecret) {
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(signingSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, payload);
      const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return `sha256:hmac:${hex}`;
    }
    const hash = await crypto.subtle.digest("SHA-256", payload);
    const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  } catch {
    // crypto.subtle unavailable (non-HTTPS context or older runtime) — use ref-based fallback.
    return `sha256:ref:${reportRef}`;
  }
}

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

  // Resolve which legal entity is filing this STR. When entityId is set
  // in the body, we use that; otherwise the default entity from
  // HAWKEYE_DEFAULT_ENTITY_ID. Falls back to single-entity legacy
  // GOAML_RENTITY_ID when HAWKEYE_ENTITIES is unset.
  const reportingEntity = getEntity(body.entityId);

  const mlroName = process.env["GOAML_MLRO_FULL_NAME"] ?? "Luisa Fernanda";
  const mlroEmail = process.env["GOAML_MLRO_EMAIL"] ?? "mlro@fine-gold.ae";
  const mlroPhone = process.env["GOAML_MLRO_PHONE"] ?? "+971-000-000-0000";
  const usingPlaceholderMlro = !process.env["GOAML_MLRO_FULL_NAME"] || !process.env["GOAML_MLRO_EMAIL"];

  const envelope: GoAmlEnvelope = {
    reportCode: body.reportCode,
    rentityId: reportingEntity.goamlRentityId,
    ...(reportingEntity.goamlBranch
      ? { rentityBranch: reportingEntity.goamlBranch }
      : {}),
    reportingPerson: {
      fullName: mlroName,
      occupation: "MLRO",
      email: mlroEmail,
      phoneNumber: mlroPhone,
    },
    submissionCode: "E",
    currencyCodeLocal: "AED",
    reason: body.narrative.slice(0, 4000),
    ...(involvedPersons.length > 0 ? { involvedPersons } : {}),
    ...(involvedEntities.length > 0 ? { involvedEntities } : {}),
    ...(((body.amount ?? body.amountAed) ?? 0) > 0
      ? {
          transactions: [
            {
              transactionNumber: `${reportRef}-TXN-1`,
              date: iso,
              amountLocal: (body.amount ?? body.amountAed) as number,
              currency: body.currency ?? "AED",
              type: "cash" as const,
              ...(body.counterparty ? { counterpartyName: body.counterparty } : {}),
            },
          ],
        }
      : {}),
    internalReference: reportRef,
    generatedAt: iso,
    charterIntegrityHash: await computeCharterHash(reportRef, body.narrative, iso),
  };

  let xml: string;
  try {
    xml = serialiseGoamlXml(envelope);
  } catch (err) {
    console.error("goaml serialise failed", err);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: `goAML serialisation unavailable: ${err instanceof Error ? err.message : String(err)}`,
    }, { headers: gateHeaders });
  }

  // Prepend a screening-provenance XML comment block so the goAML
  // filing carries the same hashes as the .txt / PDF / JSON sidecar
  // that produced its narrative. XML comments are ignored by goAML
  // schema parsers but visible to a human reviewer or grep, which is
  // exactly the audit affordance we want — schema-safe linkage from
  // the FIU artefact back to the brain run.
  const prov = body.screeningProvenance;
  if (prov && (prov.runId || prov.payloadSha256 || prov.reportSha256)) {
    const lines: string[] = [];
    lines.push("<!--");
    lines.push("  Hawkeye Sterling — goAML envelope provenance");
    if (prov.runId) lines.push(`  screening.run_id          : ${prov.runId}`);
    if (prov.engineVersion) lines.push(`  brain.engine_version      : ${prov.engineVersion}`);
    if (prov.schemaVersion) lines.push(`  report.schema_version     : ${prov.schemaVersion}`);
    if (prov.buildSha) lines.push(`  brain.build_sha           : ${prov.buildSha}`);
    if (prov.generatedAt) lines.push(`  brain.generated_at        : ${prov.generatedAt}`);
    if (prov.payloadSha256) lines.push(`  screening.payload.sha256  : ${prov.payloadSha256}`);
    if (prov.reportSha256) lines.push(`  screening.report.sha256   : ${prov.reportSha256}`);
    if (prov.signature) lines.push(`  screening.report.signature: ${prov.signature}`);
    if (prov.signingKeyFp) lines.push(`  signing.key_fp            : ${prov.signingKeyFp}`);
    lines.push(`  goaml.envelope.generated  : ${iso}`);
    lines.push(`  goaml.internal_reference  : ${reportRef}`);
    lines.push("-->");
    const comment = lines.join("\n");
    // Insert after the <?xml ... ?> declaration so the comment is
    // schema-legal even with strict parsers. If serialiseGoamlXml
    // didn't emit a declaration, prepend.
    if (xml.startsWith("<?xml")) {
      const declEnd = xml.indexOf("?>") + 2;
      xml = xml.slice(0, declEnd) + "\n" + comment + xml.slice(declEnd);
    } else {
      xml = comment + "\n" + xml;
    }
  }

  const filename = `goaml-${body.reportCode.toLowerCase()}-${safeFilenameSegment(reportRef)}.xml`;
  const warningHeaders: Record<string, string> = usingPlaceholderMlro
    ? { "X-Hawkeye-Warning": "GOAML_MLRO_FULL_NAME/GOAML_MLRO_EMAIL not set — placeholder MLRO values used. Set env vars before FIU submission." }
    : {};
  return new Response(xml, {
    status: 200,
    headers: {
      ...gateHeaders,
      ...warningHeaders,
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export const POST = handleGoaml;
