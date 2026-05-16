// POST /api/admin/eocn-ingest
//
// UAE EOCN / Local Terrorist List — manual PDF/Excel ingest.
//
// Background: The UAE Executive Office for Control & Non-Proliferation (EOCN)
// does NOT publish a machine-readable public API. When the list changes, the
// EOCN body emails a PDF (and sometimes an Excel) to all registered entities.
// This endpoint bridges that gap: the MLRO uploads the received document and
// Claude extracts the structured designation data, which is then written to the
// hawkeye-lists blob store and immediately available for screening.
//
// Flow:
//   1. MLRO receives EOCN PDF/Excel via email
//   2. MLRO opens Hawkeye → EOCN → "Upload designation list" tab
//   3. File is POSTed here (multipart/form-data, field: "file")
//   4. Claude (claude-haiku-4-5 with PDF/XLSX vision) extracts entities
//   5. Entities written to hawkeye-lists:uae_eocn/latest.json
//   6. Optional: uae_ltl/latest.json if the upload contains LTL entries
//   7. Candidate cache invalidated → next screening uses fresh data
//
// Auth: Bearer ADMIN_TOKEN (same as all admin surface routes).
// Max file size: 10 MB.
//
// Regulatory basis: UAE Cabinet Resolution No. 74/2020; FDL 10/2025 Art.11;
//   all regulated entities must screen within 24 h of list update and freeze
//   any matched assets immediately.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const BLOB_STORE_NAME = "hawkeye-lists";

interface NormalisedEntity {
  id: string;
  name: string;
  aliases: string[];
  type: "individual" | "entity" | "vessel" | "aircraft" | "unknown";
  nationalities: string[];
  jurisdictions: string[];
  identifiers: Record<string, string>;
  addresses: string[];
  listings: Array<{
    source: string;
    program?: string;
    reference?: string;
    designatedAt?: string;
    authorityUrl?: string;
  }>;
  source: string;
  fetchedAt: number;
}

interface IngestResult {
  ok: boolean;
  listId: string;
  entitiesExtracted: number;
  entitiesWritten: number;
  uploadedBy?: string;
  uploadedAt: string;
  fileName: string;
  fileBytes: number;
  claudeModel: string;
  warnings: string[];
}

async function writeToBlobStore(
  listId: string,
  entities: NormalisedEntity[],
): Promise<boolean> {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(BLOB_STORE_NAME);
    await store.set(
      `${listId}/latest.json`,
      JSON.stringify({ entities, ingestedAt: new Date().toISOString(), source: "manual_upload" }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data with a 'file' field" },
      { status: 400, headers: gate.headers },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "'file' field is required (PDF or Excel)" },
      { status: 400, headers: gate.headers },
    );
  }

  const fileName = file instanceof File ? file.name : "upload";
  const fileBytes = file.size;

  if (fileBytes > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File too large — max 10 MB, got ${(fileBytes / 1024 / 1024).toFixed(1)} MB` },
      { status: 413, headers: gate.headers },
    );
  }

  const listIdOverride = formData.get("listId");
  const listId: "uae_eocn" | "uae_ltl" =
    listIdOverride === "uae_ltl" ? "uae_ltl" : "uae_eocn";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured" },
      { status: 503, headers: gate.headers },
    );
  }

  // Detect media type
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const isXlsx =
    ext === "xlsx" ||
    ext === "xls" ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel");

  if (!isPdf && !isXlsx) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type — upload a PDF or Excel (.xlsx/.xls) file" },
      { status: 415, headers: gate.headers },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const mediaType = isPdf
    ? ("application/pdf" as const)
    : ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const);

  const anthropic = getAnthropicClient(apiKey, 4_500, "eocn-ingest");

  const warnings: string[] = [];

  let rawJson = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: `You are a UAE AML compliance data extraction specialist. Extract ALL sanctioned/designated entities from this UAE EOCN or Local Terrorist List document.

Return ONLY valid JSON — no prose, no markdown fences. The JSON must be an array of objects with this exact shape:
[
  {
    "name": "full primary name as listed",
    "aliases": ["alias1", "alias2"],
    "type": "individual" | "entity",
    "nationalities": ["AE", "SY"],
    "dob": "YYYY-MM-DD or partial date if known",
    "passport": "passport number if listed",
    "nationalId": "national ID if listed",
    "reference": "EOCN/LTL reference number",
    "designation": "program name e.g. UAE Local Terrorist List",
    "designatedAt": "YYYY-MM-DD if known"
  }
]

Rules:
- Include EVERY entity in the document — do not truncate
- Use ISO-2 nationality codes (e.g. AE, SY, IR)
- Omit fields that are not present (do not use null/empty strings)
- For individuals: type = "individual"; for organisations/companies: type = "entity"
- If the document contains both EOCN and LTL entries, include all of them`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `Extract all designated entities from this UAE ${listId === "uae_ltl" ? "Local Terrorist List" : "EOCN Targeted Financial Sanctions"} document. Return the JSON array only.`,
            },
          ],
        },
      ],
    });

    rawJson =
      msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text.trim() : "[]";
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Claude extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502, headers: gate.headers },
    );
  }

  // Parse Claude's response
  let rawEntities: Array<Record<string, unknown>> = [];
  try {
    const parsed: unknown = JSON.parse(rawJson.replace(/```json\n?|\n?```/g, "").trim());
    rawEntities = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    warnings.push("Claude returned malformed JSON — no entities extracted");
  }

  const now = Date.now();
  const entities: NormalisedEntity[] = rawEntities
    .filter((r) => typeof r.name === "string" && r.name.trim())
    .map((r) => {
      const name = (r.name as string).trim();
      const ref = typeof r.reference === "string" ? r.reference : name;
      const natRaw = Array.isArray(r.nationalities)
        ? (r.nationalities as unknown[]).filter((x): x is string => typeof x === "string")
        : typeof r.nationalities === "string" ? [r.nationalities] : [];
      const identifiers: Record<string, string> = {};
      if (typeof r.dob === "string" && r.dob) identifiers["dob"] = r.dob;
      if (typeof r.passport === "string" && r.passport) identifiers["passport"] = r.passport;
      if (typeof r.nationalId === "string" && r.nationalId) identifiers["national_id"] = r.nationalId;

      return {
        id: `${listId}:${ref}`,
        name,
        aliases: Array.isArray(r.aliases)
          ? (r.aliases as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
        type: r.type === "entity" ? "entity" : "individual",
        nationalities: natRaw,
        jurisdictions: ["AE"],
        identifiers,
        addresses: [],
        listings: [
          {
            source: listId,
            program: typeof r.designation === "string" ? r.designation : `UAE ${listId === "uae_ltl" ? "Local Terrorist List" : "EOCN TFS"}`,
            reference: ref,
            designatedAt: typeof r.designatedAt === "string" ? r.designatedAt : undefined,
            authorityUrl: "https://www.uaeiec.gov.ae/en-us/un-page",
          },
        ],
        source: listId,
        fetchedAt: now,
      } satisfies NormalisedEntity;
    });

  if (entities.length === 0) {
    warnings.push("No entities were extracted — verify the file is the correct EOCN/LTL document");
  }

  // Write to blob store
  let written = false;
  if (entities.length > 0) {
    written = await writeToBlobStore(listId, entities);
    if (!written) {
      warnings.push("Blob store write failed — entities extracted but not persisted; retry or contact support");
    } else {
      // Invalidate in-process candidate cache so next screen uses fresh data
      invalidateCandidateCache();
    }
  }

  const result: IngestResult = {
    ok: true,
    listId,
    entitiesExtracted: rawEntities.length,
    entitiesWritten: written ? entities.length : 0,
    uploadedAt: new Date().toISOString(),
    fileName,
    fileBytes,
    claudeModel: "claude-haiku-4-5-20251001",
    warnings,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
