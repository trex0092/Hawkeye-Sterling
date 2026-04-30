// Minimal RFC-4180-ish CSV parser. Pulled inline so the bulk-import
// dialog doesn't need a new client-side dep.
//
// Limitations: no streaming — the whole file is materialised in memory.
// Acceptable for the 500-row /api/batch-screen ceiling.

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(input: string): CsvParseResult {
  const errors: string[] = [];
  if (!input.trim()) return { headers: [], rows: [], errors: ["empty input"] };

  // Strip UTF-8 BOM the way Excel writes it.
  let src = input.replace(/^﻿/, "");

  // Detect delimiter — comma vs semicolon vs tab. Score the first line.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) ?? ",";

  // Lex into fields honouring quoted strings + doubled quotes.
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i += 1; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); records.push(row); field = ""; row = []; continue; }
    field += ch;
  }
  // Trailing field / row.
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }

  if (records.length === 0) return { headers: [], rows: [], errors: ["no records"] };
  const headerRow = records[0]!;
  const headers = headerRow.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (headers.length === 0) return { headers: [], rows: [], errors: ["no header row"] };

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r += 1) {
    const rec = records[r]!;
    if (rec.length === 1 && (rec[0] ?? "").trim() === "") continue;
    if (rec.length !== headers.length) {
      errors.push(`row ${r + 1} has ${rec.length} columns, expected ${headers.length}`);
    }
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]!] = (rec[c] ?? "").trim();
    }
    rows.push(obj);
  }
  return { headers, rows, errors };
}

export interface BulkImportRow {
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  dob?: string;
  gender?: string;
  idNumber?: string;
}

const ALIAS_FIELDS = ["aliases", "alternate names", "alt names", "altnames", "aka"];
const TYPE_FIELDS = ["entitytype", "entity type", "type"];
const JURISDICTION_FIELDS = ["jurisdiction", "country", "citizenship", "nationality"];

export function rowsToBulkImport(rows: Record<string, string>[]): BulkImportRow[] {
  const out: BulkImportRow[] = [];
  for (const r of rows) {
    const name = (r["name"] ?? r["subject"] ?? r["full name"] ?? "").trim();
    if (!name) continue;
    const row: BulkImportRow = { name };
    for (const f of ALIAS_FIELDS) {
      const v = r[f];
      if (v) {
        row.aliases = v.split(/[;|,]/).map((x) => x.trim()).filter(Boolean);
        break;
      }
    }
    for (const f of TYPE_FIELDS) {
      const v = r[f]?.toLowerCase();
      if (v === "individual" || v === "organisation" || v === "vessel" || v === "aircraft" || v === "other") {
        row.entityType = v;
        break;
      }
      if (v === "person" || v === "p") { row.entityType = "individual"; break; }
      if (v === "company" || v === "corp" || v === "org" || v === "o") { row.entityType = "organisation"; break; }
    }
    for (const f of JURISDICTION_FIELDS) {
      const v = r[f];
      if (v) { row.jurisdiction = v; break; }
    }
    if (r["dob"]) row.dob = r["dob"];
    if (r["gender"]) row.gender = r["gender"];
    if (r["idnumber"] || r["id number"] || r["id"]) {
      row.idNumber = r["idnumber"] ?? r["id number"] ?? r["id"];
    }
    out.push(row);
  }
  return out;
}
