// POST /api/admin/eocn-ingest
//
// UAE EOCN / Local Terrorist List — manual upload ingest.
//
// The EOCN body emails list updates as .xls attachments to registered entities.
// This endpoint accepts that file and persists the parsed designations to
// hawkeye-lists blob store for immediate screening use.
//
// Parse strategy:
//   1. Structural parser (parseEocnBuffer) — uses SheetJS to read .xls/.xlsx
//      and extract entities based on the known EOCN column layout.  Fast,
//      deterministic, no API cost.
//   2. Claude AI fallback — if structural parsing yields 0 entities (e.g. the
//      layout changed significantly), the file is sent to Claude Haiku which
//      uses document understanding to extract what it can.
//   3. Warning surfaced in response if only AI fallback was used.
//
// Auth: Bearer ADMIN_TOKEN (same gate as all admin routes).
// Max file size: 50 MB.
// Accepted: .xls, .xlsx, .pdf

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";
import { parseEocnBuffer } from "@/lib/server/eocn-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 50 * 1024 * 1024;
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
  notes?: string;
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
  parseMethod: "structural" | "ai" | "none";
  warnings: string[];
  error?: string;
}

async function readExistingEntities(listId: string): Promise<NormalisedEntity[]> {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(BLOB_STORE_NAME);
    const raw = await store.get(`${listId}/latest.json`, { type: "json" }) as {
      entities?: NormalisedEntity[];
    } | null;
    return raw?.entities ?? [];
  } catch {
    return [];
  }
}

async function writeToBlobStore(listId: string, entities: NormalisedEntity[]): Promise<boolean> {
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

async function fireDesignationAlert(
  listId: string,
  added: NormalisedEntity[],
  removed: NormalisedEntity[],
  uploadedBy: string,
): Promise<void> {
  const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
  if (!webhookUrl || (added.length === 0 && removed.length === 0)) return;
  const SAMPLE = 20;
  const lines = [
    `⚡ HAWKEYE STERLING — UAE SANCTIONS LIST UPDATED (MANUAL UPLOAD)`,
    ``,
    `List         : ${listId.toUpperCase()}`,
    `Uploaded by  : ${uploadedBy}`,
    `Detected at  : ${new Date().toISOString()}`,
    `New designations : ${added.length}`,
    `Delistings       : ${removed.length}`,
    ``,
  ];
  if (added.length > 0) {
    lines.push(`NEW DESIGNATIONS — ACTION REQUIRED`);
    for (const e of added.slice(0, SAMPLE)) lines.push(`  + ${e.name}  [${e.listings[0]?.reference ?? e.id}]`);
    if (added.length > SAMPLE) lines.push(`  … and ${added.length - SAMPLE} more`);
    lines.push(``);
  }
  if (removed.length > 0) {
    lines.push(`DELISTINGS — ACTION REQUIRED`);
    for (const e of removed.slice(0, SAMPLE)) lines.push(`  - ${e.name}  [${e.listings[0]?.reference ?? e.id}]`);
    if (removed.length > SAMPLE) lines.push(`  … and ${removed.length - SAMPLE} more`);
  }
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: lines.join("\n"),
        event: "uae_manual_upload_designation_change",
        listId,
        totalAdded: added.length,
        totalRemoved: removed.length,
        detectedAt: new Date().toISOString(),
        added: added.slice(0, SAMPLE).map((e) => ({ name: e.name, reference: e.listings[0]?.reference })),
        removed: removed.slice(0, SAMPLE).map((e) => ({ name: e.name, reference: e.listings[0]?.reference })),
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.warn("[eocn-ingest] designation-change webhook failed:", err instanceof Error ? err.message : String(err));
  }
}

// ── Claude AI fallback ────────────────────────────────────────────────────────

async function extractWithClaude(
  buf: Buffer,
  fileName: string,
  listId: string,
  apiKey: string,
): Promise<NormalisedEntity[]> {
  const anthropic = getAnthropicClient(apiKey, 55_000, "eocn-ingest");
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || fileName.includes(".pdf");

  // Claude only natively supports PDF as a document block.
  // For Excel, encode as PDF media type if it is PDF, otherwise send
  // the raw bytes as a text/plain base64 block and rely on Claude's
  // instruction following to extract the structured data from the
  // spreadsheet's cell representation.
  const base64 = buf.toString("base64");
  const mediaType = isPdf ? "application/pdf" as const : "text/plain" as const;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16000,
    system: `You are a UAE AML compliance data extraction specialist.

Extract ALL entities from this UAE EOCN / Local Terrorist List document.
The document has up to 5 sections:
1. Organizations (التنظيمات) — terrorist organizations
2. Individuals (الأفراد) — designated persons with passport/ID data
3. Entities (الكيانات) — designated companies/entities
4. Removed Individuals (الأفراد المرفوعة) — EXCLUDE these
5. Removed Entities (الكيانات المرفوعة) — EXCLUDE these

Return ONLY valid JSON — no prose, no markdown fences, no truncation.
JSON must be an array of objects with this exact shape:
[
  {
    "name": "primary Latin name as listed (use Arabic if no Latin name)",
    "nameArabic": "Arabic name if available",
    "aliases": ["alias1", "alias2"],
    "type": "individual" | "entity",
    "nationalities": ["AE", "SY"],
    "dob": "YYYY-MM-DD or partial",
    "passport": "passport number if listed",
    "nationalId": "national ID if listed",
    "reference": "row number or reference",
    "authority": "Cabinet Resolution reference e.g. مدرج بموجب قرار مجلس الوزراء رقم (41) لسنة 2014",
    "designation": "UAE EOCN TFS or UAE Local Terrorist List"
  }
]

Rules:
- Include EVERY active entity — do not skip or truncate
- Exclude removed/delisted entries (sections 4 and 5)
- Use ISO-2 nationality codes (AE, SY, IR, QA, LB, YE, etc.)
- type = "individual" for persons; type = "entity" for organisations/companies
- Omit fields that are absent (no null/empty strings)`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Extract all active designated entities from this UAE ${listId === "uae_ltl" ? "Local Terrorist List" : "EOCN Targeted Financial Sanctions"} document. Return the JSON array only.`,
          },
        ],
      },
    ],
  });

  const rawJson = msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text.trim() : "[]";
  let rawEntities: Array<Record<string, unknown>> = [];
  try {
    const parsed: unknown = JSON.parse(rawJson.replace(/```json\n?|\n?```/g, "").trim());
    rawEntities = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }

  const now = Date.now();
  return rawEntities
    .filter((r) => typeof r.name === "string" && r.name.trim())
    .map((r) => {
      const name = (r.name as string).trim();
      const ref = typeof r.reference === "string" ? r.reference : name;
      const natRaw = Array.isArray(r.nationalities)
        ? (r.nationalities as unknown[]).filter((x): x is string => typeof x === "string")
        : typeof r.nationalities === "string" ? [(r.nationalities as string)] : [];
      const identifiers: Record<string, string> = {};
      if (typeof r.dob === "string" && r.dob) identifiers["dob"] = r.dob;
      if (typeof r.passport === "string" && r.passport) identifiers["passport"] = r.passport;
      if (typeof r.nationalId === "string" && r.nationalId) identifiers["national_id"] = r.nationalId;
      const aliases = Array.isArray(r.aliases)
        ? (r.aliases as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const notes = typeof r.nameArabic === "string" ? r.nameArabic : undefined;
      const out: NormalisedEntity = {
        id: `${listId}:${ref}`,
        name,
        aliases,
        type: r.type === "entity" ? "entity" : "individual",
        nationalities: natRaw,
        jurisdictions: ["AE"],
        identifiers,
        addresses: [],
        listings: [
          {
            source: listId,
            program: typeof r.designation === "string" ? r.designation
              : listId === "uae_ltl" ? "UAE Local Terrorist List" : "UAE EOCN TFS",
            reference: ref,
            authorityUrl: "https://www.uaeiec.gov.ae/en-us/un-page",
          },
        ],
        source: listId,
        fetchedAt: now,
      };
      if (notes) out.notes = notes;
      return out;
    });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Request body too large (max 50 MB)" },
      { status: 413, headers: gate.headers },
    );
  }

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
      { ok: false, error: "'file' field is required (PDF, .xls, or .xlsx)" },
      { status: 400, headers: gate.headers },
    );
  }

  const fileName = file instanceof File ? file.name : "upload";
  const fileBytes = file.size;

  if (fileBytes > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File too large — max 50 MB, got ${(fileBytes / 1024 / 1024).toFixed(1)} MB` },
      { status: 413, headers: gate.headers },
    );
  }

  const listIdOverride = formData.get("listId");
  const listId: "uae_eocn" | "uae_ltl" =
    listIdOverride === "uae_ltl" ? "uae_ltl" : "uae_eocn";

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const isExcel = ext === "xls" || ext === "xlsx" || file.type.includes("excel") || file.type.includes("spreadsheet");

  if (!isPdf && !isExcel) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type — upload .xls, .xlsx, or .pdf" },
      { status: 415, headers: gate.headers },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const warnings: string[] = [];
  const now = Date.now();
  let parseMethod: IngestResult["parseMethod"] = "none";
  let entities: NormalisedEntity[] = [];

  // ── 1. Structural parse (XLS/XLSX only) ───────────────────────────────────
  if (isExcel) {
    try {
      const parsed = await parseEocnBuffer(buf);
      if (parsed.length > 0) {
        parseMethod = "structural";
        entities = parsed.map((p, i) => {
          const ref = p.reference ?? String(i + 1);
          const out: NormalisedEntity = {
            id: `${listId}:${ref}:${p.name.slice(0, 30).replace(/\s+/g, "_")}`,
            name: p.name,
            aliases: p.aliases,
            type: p.type,
            nationalities: p.nationalities,
            jurisdictions: ["AE"],
            identifiers: p.identifiers,
            addresses: [],
            listings: [
              {
                source: listId,
                program: listId === "uae_ltl" ? "UAE Local Terrorist List" : "UAE EOCN TFS",
                reference: ref,
                authorityUrl: "https://www.uaeiec.gov.ae/en-us/un-page",
              },
            ],
            source: listId,
            fetchedAt: now,
          };
          if (p.nameArabic) out.notes = p.nameArabic;
          if (p.dateOfBirth) out.identifiers["dob"] = p.dateOfBirth;
          return out;
        });
      } else {
        warnings.push("Structural parser found 0 entities — falling back to AI extraction");
      }
    } catch (err) {
      warnings.push(`Structural parse failed (${err instanceof Error ? err.message : String(err)}) — falling back to AI extraction`);
    }
  }

  // ── 2. AI fallback (PDF always; Excel when structural yields 0) ───────────
  if (entities.length === 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      if (isPdf) {
        return NextResponse.json(
          { ok: false, error: "ANTHROPIC_API_KEY not configured — required for PDF extraction" },
          { status: 503, headers: gate.headers },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Structural parser found 0 entities and ANTHROPIC_API_KEY is not configured for AI fallback",
          warnings,
        },
        { status: 422, headers: gate.headers },
      );
    }
    try {
      entities = await extractWithClaude(buf, fileName, listId, apiKey);
      if (entities.length > 0) {
        parseMethod = "ai";
        warnings.push("Used Claude AI extraction (structural parser yielded 0 entities)");
      }
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: `AI extraction failed: ${err instanceof Error ? err.message : String(err)}`,
          warnings,
        },
        { status: 502, headers: gate.headers },
      );
    }
  }

  if (entities.length === 0) {
    warnings.push("No entities extracted — verify the file is the correct EOCN/LTL document");
  }

  // ── 3. Write to blob store ─────────────────────────────────────────────────
  const existingEntities = entities.length > 0 ? await readExistingEntities(listId) : [];
  let written = false;

  if (entities.length > 0) {
    written = await writeToBlobStore(listId, entities);
    if (!written) {
      warnings.push("Blob store write failed — entities extracted but not persisted; retry or contact support");
    } else {
      invalidateCandidateCache();
      const existingIds = new Set(existingEntities.map((e) => e.id));
      const newIds = new Set(entities.map((e) => e.id));
      const added   = entities.filter((e) => !existingIds.has(e.id));
      const removed = existingEntities.filter((e) => !newIds.has(e.id));
      if (existingEntities.length > 0) {
        void fireDesignationAlert(listId, added, removed, gate.keyId ?? "MLRO");
      }
    }
  }

  const result: IngestResult = {
    ok: true,
    listId,
    entitiesExtracted: entities.length,
    entitiesWritten: written ? entities.length : 0,
    uploadedBy: gate.keyId,
    uploadedAt: new Date().toISOString(),
    fileName,
    fileBytes,
    parseMethod,
    warnings,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
