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
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getNamedStore } from "@/lib/server/blob-getter";
import { assertSafeWebhookUrl } from "@/lib/server/webhook";

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
  const store = await getNamedStore(BLOB_STORE_NAME);
  if (!store) return [];
  try {
    const raw = await store.get(`${listId}/latest.json`, { type: "json" }) as {
      entities?: NormalisedEntity[];
    } | null;
    return raw?.entities ?? [];
  } catch (err) {
    console.warn("[eocn-ingest] readExistingEntities failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function writeToBlobStore(listId: string, entities: NormalisedEntity[]): Promise<{ ok: boolean; error?: string }> {
  const store = await getNamedStore(BLOB_STORE_NAME);
  if (!store) {
    const msg = `Blobs store "${BLOB_STORE_NAME}" unavailable — NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN may be missing`;
    console.error("[eocn-ingest] writeToBlobStore:", msg);
    return { ok: false, error: msg };
  }
  if (!store.set) {
    const msg = `Blobs store "${BLOB_STORE_NAME}" does not expose set() — unexpected store shape`;
    console.error("[eocn-ingest] writeToBlobStore:", msg);
    return { ok: false, error: msg };
  }
  const now = Date.now();
  // Include a `report` block with fetchedAt + recordCount so the
  // sanctions/status and health endpoints mark this list as fresh (not stale).
  const report = {
    listId,
    recordCount: entities.length,
    fetchedAt: now,
    source: "manual_upload",
    ingestedAt: new Date(now).toISOString(),
  };
  try {
    await store.set(
      `${listId}/latest.json`,
      JSON.stringify({ entities, report, source: "manual_upload", ingestedAt: report.ingestedAt }),
    );
    return { ok: true };
  } catch (err) {
    console.error("[eocn-ingest] writeToBlobStore set() failed:", err);
    return { ok: false, error: "blob store write failed — check storage configuration" };
  }
}

// ── XML parser (UN SC / UAE EOCN / OFAC SDN XML formats) ─────────────────────
// Supports the three most common sanctions XML schemas without external deps.
// Deduplication by normalised name prevents double-counting aliases/variants.

function getText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
  return m ? m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ").trim() : "";
}

function getAllText(xml: string, tag: string): string[] {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml)) !== null) {
    const v = m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ").replace(/<[^>]+>/g, " ").trim();
    if (v) out.push(v);
  }
  return out;
}

interface XmlEntity {
  name: string;
  aliases: string[];
  type: "individual" | "entity";
  nationalities: string[];
  dob?: string;
  passport?: string;
  reference?: string;
}

function parseEocnXml(xml: string): XmlEntity[] {
  const results: XmlEntity[] = [];

  // ── UN Security Council XML (INDIVIDUAL / ENTITY blocks) ──────────────────
  const unIndividuals = [...xml.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/gi)];
  for (const m of unIndividuals) {
    const block = m[1]!;
    const parts = [
      getText(block, "FIRST_NAME"),
      getText(block, "SECOND_NAME"),
      getText(block, "THIRD_NAME"),
      getText(block, "FOURTH_NAME"),
    ].filter(Boolean);
    const name = parts.join(" ").trim();
    if (!name) continue;
    const aliases = getAllText(block, "ALIAS_NAME").filter((a) => a !== name);
    results.push({
      name,
      aliases,
      type: "individual",
      nationalities: getAllText(block, "NATIONALITY").slice(0, 5),
      dob: getText(block, "DATE_OF_BIRTH") || undefined,
      reference: getText(block, "DATAID") || undefined,
    });
  }
  const unEntities = [...xml.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/gi)];
  for (const m of unEntities) {
    const block = m[1]!;
    const name = getText(block, "FIRST_NAME") || getText(block, "NAME");
    if (!name) continue;
    results.push({
      name,
      aliases: getAllText(block, "ALIAS_NAME").filter((a) => a !== name),
      type: "entity",
      nationalities: [],
      reference: getText(block, "DATAID") || undefined,
    });
  }

  // ── OFAC SDN XML (sdnEntry blocks) ────────────────────────────────────────
  if (results.length === 0) {
    const sdnEntries = [...xml.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi)];
    for (const m of sdnEntries) {
      const block = m[1]!;
      const firstName = getText(block, "firstName");
      const lastName = getText(block, "lastName");
      const name = [firstName, lastName].filter(Boolean).join(" ").trim();
      if (!name) continue;
      const typeRaw = getText(block, "sdnType").toLowerCase();
      const type: "individual" | "entity" = typeRaw.includes("individual") ? "individual" : "entity";
      const aliases = getAllText(block, "aka")
        .map((a) => [getText(a, "firstName"), getText(a, "lastName")].filter(Boolean).join(" ").trim())
        .filter((a) => a && a !== name);
      results.push({ name, aliases, type, nationalities: [], reference: getText(block, "uid") || undefined });
    }
  }

  // ── Generic XML fallback: look for any <*Name*> / <fullName> / <name> ─────
  if (results.length === 0) {
    const nameBlocks = [...xml.matchAll(/<(?:fullName|displayName|entityName|name)>([^<]{3,200})<\/(?:fullName|displayName|entityName|name)>/gi)];
    const seen = new Set<string>();
    for (const m of nameBlocks) {
      const name = m[1]!.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      results.push({ name, aliases: [], type: "individual", nationalities: [] });
    }
  }

  // Dedup by normalised name — same name from multiple elements (e.g. primary
  // name also appears as an alias block) must not create two records.
  const seen = new Map<string, XmlEntity>();
  for (const e of results) {
    const key = e.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

async function fireDesignationAlert(
  listId: string,
  added: NormalisedEntity[],
  removed: NormalisedEntity[],
  uploadedBy: string,
): Promise<void> {
  const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
  if (!webhookUrl || (added.length === 0 && removed.length === 0)) return;
  try { assertSafeWebhookUrl(webhookUrl); } catch (err) {
    console.error("[eocn-ingest] ALERT_WEBHOOK_URL is not a safe URL — aborting webhook:", err instanceof Error ? err.message : String(err));
    return;
  }
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
  const anthropic = getAnthropicClient(apiKey, 4_500, "eocn-ingest");
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
            source: { type: "base64", media_type: mediaType as "application/pdf", data: base64 },
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
  // This route accepts multipart/form-data file uploads (see formData() call
  // below). Without `requireJsonBody: false` the enforce() guard returns 415
  // "Content-Type: application/json required" before the handler can read the
  // form — manual EOCN/LTL upload is completely broken in that state.
  // Both options must be set explicitly because enforce()'s default param is
  // an all-or-nothing replacement, not a per-property merge (see enforce.ts).
  const gate = await enforce(req, { requireAuth: true, requireJsonBody: false });
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
  const isPdf   = ext === "pdf"  || file.type === "application/pdf";
  const isExcel = ext === "xls"  || ext === "xlsx" || file.type.includes("excel") || file.type.includes("spreadsheet");
  const isXml   = ext === "xml"  || file.type.includes("xml");

  if (!isPdf && !isExcel && !isXml) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type — upload .xml, .xls, .xlsx, or .pdf" },
      { status: 415, headers: gate.headers },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const warnings: string[] = [];
  const now = Date.now();
  let parseMethod: IngestResult["parseMethod"] = "none";
  let entities: NormalisedEntity[] = [];

  // ── 0. XML parse (UN SC / OFAC / generic) ────────────────────────────────
  if (isXml) {
    try {
      const xmlText = buf.toString("utf-8");
      const parsed = parseEocnXml(xmlText);
      if (parsed.length > 0) {
        parseMethod = "structural";
        entities = parsed.map((p, i) => {
          const ref = p.reference ?? String(i + 1);
          const identifiers: Record<string, string> = {};
          if (p.dob) identifiers["dob"] = p.dob;
          if (p.passport) identifiers["passport"] = p.passport;
          const out: NormalisedEntity = {
            id: `${listId}:${ref}:${p.name.slice(0, 30).replace(/\s+/g, "_")}`,
            name: p.name,
            aliases: p.aliases,
            type: p.type,
            nationalities: p.nationalities,
            jurisdictions: ["AE"],
            identifiers,
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
          return out;
        });
      } else {
        warnings.push("XML parser found 0 entities — falling back to AI extraction");
      }
    } catch (err) {
      console.warn("[eocn-ingest] XML parse failed:", err);
      warnings.push("XML parse failed — falling back to AI extraction");
    }
  }

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
      console.warn("[eocn-ingest] structural parse failed:", err);
      warnings.push("Structural parse failed — falling back to AI extraction");
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
      console.error("[eocn-ingest] AI extraction failed:", err);
      return NextResponse.json(
        {
          ok: false,
          error: "AI extraction failed — please retry or verify the uploaded file is a valid EOCN/LTL document",
          warnings,
        },
        { status: 502, headers: gate.headers },
      );
    }
  }

  if (entities.length === 0) {
    warnings.push("No entities extracted — verify the file is the correct EOCN/LTL document");
  }

  // ── Deduplication — remove duplicate names within the uploaded file ────────
  // ID and normalised-name dedup prevents double-counting when an XML/XLS has
  // the same entity in multiple sections or with variant capitalisation.
  if (entities.length > 0) {
    const seenIds  = new Set<string>();
    const seenNames = new Set<string>();
    const deduped: NormalisedEntity[] = [];
    for (const e of entities) {
      const normName = e.name.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenIds.has(e.id) || seenNames.has(normName)) continue;
      seenIds.add(e.id);
      seenNames.add(normName);
      deduped.push(e);
    }
    if (deduped.length < entities.length) {
      warnings.push(`Deduplicated ${entities.length - deduped.length} duplicate entries from the uploaded file`);
      entities = deduped;
    }
  }

  // ── 3. Write to blob store ─────────────────────────────────────────────────
  const existingEntities = entities.length > 0 ? await readExistingEntities(listId) : [];
  let written = false;

  if (entities.length > 0) {
    const writeResult = await writeToBlobStore(listId, entities);
    written = writeResult.ok;
    if (!written) {
      const detail = writeResult.error ? ` (${writeResult.error})` : "";
      warnings.push(`Blob store write failed — entities extracted but not persisted; retry or contact support${detail}`);
    } else {
      invalidateCandidateCache();
      const existingIds = new Set(existingEntities.map((e) => e.id));
      const newIds = new Set(entities.map((e) => e.id));
      const added   = entities.filter((e) => !existingIds.has(e.id));
      const removed = existingEntities.filter((e) => !newIds.has(e.id));
      if (existingEntities.length > 0) {
        void fireDesignationAlert(listId, added, removed, gate.keyId ?? "MLRO").catch((err: unknown) => {
          console.warn("[admin/eocn-ingest] designation alert failed:", err instanceof Error ? err.message : String(err));
        });
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

  // Sanctions list ingest is a high-impact compliance operation (UAE EOCN/LTL);
  // must be on the tamper-evident chain per FDL 10/2025 Art.15.
  void writeAuditChainEntry(
    {
      event: "sanctions.eocn_ingest",
      actor: gate.keyId,
      listId,
      entitiesExtracted: entities.length,
      entitiesWritten: result.entitiesWritten,
      parseMethod,
      fileName,
      fileBytes,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn("[admin/eocn-ingest] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json(result, { headers: gate.headers });
}
