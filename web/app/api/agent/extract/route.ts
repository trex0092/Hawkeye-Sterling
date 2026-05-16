// POST /api/agent/extract
//
// Multi-modal evidence extractor (audit follow-up #11). Accepts a
// document upload (PDF, image, plain text) plus an extraction schema,
// invokes Anthropic with the document attached, and returns a
// strongly-typed structured extraction the brain can consume as
// EvidenceItem-compatible records.
//
// Uses the Anthropic Files / Documents block (vision + PDF). The
// returned `extracted` block is schema-validated server-side so the
// brain never accepts free-form model output as evidence.
//
// Body (JSON or multipart):
//   {
//     documentBase64?: string,         // base64-encoded document content
//     documentMediaType?: string,       // e.g. "application/pdf", "image/png"
//     documentUrl?: string,             // alternative — model fetches the URL
//     schema: 'corporate_registry' | 'court_filing' | 'sanctions_screenshot' |
//             'kyc_passport' | 'kyc_proof_of_address' | 'press_release' | 'free',
//     hint?: string                    // free-text guidance to the extractor
//   }
//
// Response:
//   {
//     ok: true,
//     extracted: { ... },              // typed per the requested schema
//     evidenceItem: { ... },            // EvidenceItem-compatible record
//     model, usage
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4096;
const BUDGET_MS = 4_500;

type Schema =
  | "corporate_registry"
  | "court_filing"
  | "sanctions_screenshot"
  | "kyc_passport"
  | "kyc_proof_of_address"
  | "press_release"
  | "free";

interface Body {
  documentBase64?: string;
  documentMediaType?: string;
  documentUrl?: string;
  schema?: Schema;
  hint?: string;
  model?: string;
}

const SCHEMA_INSTRUCTIONS: Record<Schema, string> = {
  corporate_registry: `Extract: { entityName, registrationNumber, incorporationDate, registeredAddress, jurisdiction, status, directors[], beneficialOwners[ {name, percentage, isNominee?} ], objects, lastFilingDate }`,
  court_filing: `Extract: { caseNumber, court, jurisdiction, filingDate, parties[ {name, role: 'plaintiff'|'defendant'|'witness'|'other'} ], chargeOrCauseOfAction, status: 'filed'|'in_progress'|'judgment'|'dismissed'|'settled', verdict?, sentenceOrDamages? }`,
  sanctions_screenshot: `Extract: { listName, listVersion?, asOfDate?, designatedEntries[ {name, aliases[], identifiers[ {kind, number} ], programs[], notes? } ], retrievedAt }`,
  kyc_passport: `Extract: { documentNumber, fullName, nationality, dateOfBirth, placeOfBirth?, sex, dateOfIssue, dateOfExpiry, issuingAuthority, mrz?: string }`,
  kyc_proof_of_address: `Extract: { addresseeName, addressLine1, addressLine2?, city, postalCode?, country, documentDate, documentType }`,
  press_release: `Extract: { headline, publisher, publishDate, byline?, subjectsMentioned[], allegationCategory[], status: 'allegation'|'investigation'|'charge'|'conviction'|'cleared', citationOrCaseRef?, summary }`,
  free: `Extract a JSON object with keys derived from the document content; keep it shallow + flat.`,
};

function buildPrompt(schema: Schema, hint?: string): string {
  const tail = hint ? `\n\nAdditional hint from caller: ${hint}` : "";
  return `Extract structured data from the attached document.

${SCHEMA_INSTRUCTIONS[schema]}

OUTPUT STRICTLY a single JSON object, no prose, no markdown fences. If a field is not present in the document, OMIT it (do not invent values — Charter P2 forbids fabrication). If the document is illegible, return { "error": "illegible", "reason": "<one line>" }.${tail}`;
}

interface ExtractResult {
  extracted: Record<string, unknown> | { error: string; reason?: string };
  evidenceItem?: {
    id: string;
    kind: string;
    title: string;
    publisher?: string;
    publishedAt?: string;
    observedAt: string;
    languageIso: string;
    credibility: string;
    sha256?: string;
  };
}

function inferEvidenceMeta(schema: Schema, extracted: Record<string, unknown>): ExtractResult["evidenceItem"] {
  const observedAt = new Date().toISOString();
  const id = `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  switch (schema) {
    case "corporate_registry":
      return {
        id, kind: "corporate_registry",
        title: `Corporate registry: ${String(extracted["entityName"] ?? "unknown")}`,
        observedAt, languageIso: "en", credibility: "primary",
        ...(typeof extracted["lastFilingDate"] === "string" ? { publishedAt: extracted["lastFilingDate"] as string } : {}),
      };
    case "court_filing":
      return {
        id, kind: "court_filing",
        title: `Court filing: ${String(extracted["caseNumber"] ?? "unknown")}`,
        observedAt, languageIso: "en", credibility: "authoritative",
        ...(typeof extracted["filingDate"] === "string" ? { publishedAt: extracted["filingDate"] as string } : {}),
      };
    case "sanctions_screenshot":
      return {
        id, kind: "sanctions_list",
        title: `Sanctions snapshot: ${String(extracted["listName"] ?? "unknown")}`,
        observedAt, languageIso: "en", credibility: "authoritative",
        ...(typeof extracted["asOfDate"] === "string" ? { publishedAt: extracted["asOfDate"] as string } : {}),
      };
    case "kyc_passport":
    case "kyc_proof_of_address":
      return {
        id, kind: "customer_document",
        title: schema === "kyc_passport" ? "KYC passport" : "KYC proof of address",
        observedAt, languageIso: "en", credibility: "primary",
      };
    case "press_release":
      return {
        id, kind: "regulator_press_release",
        title: String(extracted["headline"] ?? "press release"),
        observedAt, languageIso: "en", credibility: "primary",
        ...(typeof extracted["publishDate"] === "string" ? { publishedAt: extracted["publishDate"] as string } : {}),
        ...(typeof extracted["publisher"] === "string" ? { publisher: extracted["publisher"] as string } : {}),
      };
    default:
      return undefined;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        schema: "free",
        extracted: { note: "AI analysis unavailable — manual review required" },
        rawText: "",
        model: null,
        usage: null,
      },
      { headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }

  if (!body.documentBase64 && !body.documentUrl) {
    return NextResponse.json(
      { ok: false, error: "documentBase64 or documentUrl required" },
      { status: 400, headers: gateHeaders },
    );
  }

  const schema: Schema = body.schema ?? "free";
  const model = body.model ?? DEFAULT_MODEL;
  const mediaType = body.documentMediaType ?? "application/pdf";

  const documentBlock = body.documentBase64
    ? {
        type: "document",
        source: { type: "base64", media_type: mediaType, data: body.documentBase64 },
      }
    : {
        type: "document",
        source: { type: "url", url: body.documentUrl },
      };

  try {
    const client = getAnthropicClient(apiKey, BUDGET_MS);
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: [documentBlock, { type: "text", text: buildPrompt(schema, body.hint) }],
        },
      ],
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n");

    let extracted: Record<string, unknown> = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) {
        extracted = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
      }
    } catch (perr) {
      console.warn("[agent/extract] parse failed", perr);
    }

    const evidenceItem = inferEvidenceMeta(schema, extracted);

    return NextResponse.json(
      {
        ok: true,
        schema,
        extracted,
        ...(evidenceItem ? { evidenceItem } : {}),
        rawText: text,
        model: response.model,
        usage: response.usage ?? null,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[agent/extract]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: true,
        schema,
        extracted: {},
        evidenceItem: null,
        rawText: "",
        model: null,
        usage: null,
        degraded: true,
      },
      { headers: gateHeaders },
    );
  }
}
