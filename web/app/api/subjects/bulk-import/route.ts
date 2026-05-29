// POST /api/subjects/bulk-import
// Accepts multipart/form-data with a CSV file field named "file".
// CSV columns: name (required), dob, nationality, entityType, notes, externalRef
// Returns: { ok, imported, skipped, errors: [{row, field, message}] }
// Max 1000 rows per import.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { setJson } from "@/lib/server/store";
import { randomBytes } from "node:crypto";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportedSubject {
  id: string;
  name: string;
  dob?: string;
  nationality?: string;
  entityType?: string;
  notes?: string;
  externalRef?: string;
  tenantId: string;
  createdAt: string;
  source: "bulk-import";
}

const MAX_ROWS = 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO2_RE = /^[A-Za-z]{2}$/;

/**
 * Minimal CSV line parser: handles quoted fields with embedded commas/newlines.
 * Returns an array of string values for each field in the row.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      // Skip comma after field
      if (line[i] === ",") i++;
    } else {
      // Unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i).trim());
        break;
      } else {
        fields.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
  }
  return fields;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireJsonBody: false });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400, headers: gate.headers },
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { ok: false, error: "Missing file field in form data" },
      { status: 400, headers: gate.headers },
    );
  }

  let csvText: string;
  try {
    csvText = await (file as File).text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read uploaded file" },
      { status: 400, headers: gate.headers },
    );
  }

  // Split into lines, normalize line endings
  const rawLines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = rawLines.map((l) => l.trimEnd()).filter((l, i) => l.trim() !== "" || i === 0);

  if (lines.length < 2) {
    return NextResponse.json(
      { ok: false, error: "CSV must contain a header row and at least one data row" },
      { status: 400, headers: gate.headers },
    );
  }

  // Parse header
  const headerRow = parseCsvRow(lines[0]!);
  const headerMap: Record<string, number> = {};
  headerRow.forEach((h, i) => { headerMap[h.toLowerCase().trim()] = i; });

  const col = (row: string[], name: string): string => {
    const idx = headerMap[name];
    return idx !== undefined ? (row[idx] ?? "").trim() : "";
  };

  const dataLines = lines.slice(1).filter((l) => l.trim() !== "");

  if (dataLines.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `CSV exceeds maximum of ${MAX_ROWS} data rows (found ${dataLines.length})` },
      { status: 400, headers: gate.headers },
    );
  }

  const errors: ImportError[] = [];
  let imported = 0;
  let skipped = 0;

  const now = new Date().toISOString();

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // 1-based, header is row 1
    const rawLine = dataLines[i]!;
    if (!rawLine.trim()) continue;

    const row = parseCsvRow(rawLine);
    const rowErrors: ImportError[] = [];

    const name = col(row, "name");
    if (!name) {
      rowErrors.push({ row: rowNum, field: "name", message: "name is required" });
    } else if (name.length > 512) {
      rowErrors.push({ row: rowNum, field: "name", message: "name exceeds 512 characters" });
    }

    const dob = col(row, "dob");
    if (dob && !ISO_DATE_RE.test(dob)) {
      rowErrors.push({ row: rowNum, field: "dob", message: "dob must be YYYY-MM-DD if present" });
    }

    const nationality = col(row, "nationality");
    if (nationality && !ISO2_RE.test(nationality)) {
      rowErrors.push({
        row: rowNum,
        field: "nationality",
        message: "nationality must be a 2-character ISO country code if present",
      });
    }

    const entityType = col(row, "entitytype") || col(row, "entityType");
    const notes = col(row, "notes");
    const externalRef = col(row, "externalref") || col(row, "externalRef");

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      skipped++;
      continue;
    }

    const id = randomBytes(12).toString("hex");
    const subject: ImportedSubject = {
      id,
      name,
      tenantId: tenant,
      createdAt: now,
      source: "bulk-import",
      ...(dob ? { dob } : {}),
      ...(nationality ? { nationality: nationality.toUpperCase() } : {}),
      ...(entityType ? { entityType } : {}),
      ...(notes ? { notes } : {}),
      ...(externalRef ? { externalRef } : {}),
    };

    await setJson(`bulk-subjects/${tenant}/${id}`, subject);
    imported++;
  }

  void writeAuditChainEntry(
    { event: "subjects.bulk_imported", actor: gate.keyId, meta: { imported, skipped, errorCount: errors.length } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, imported, skipped, errors },
    { headers: gate.headers },
  );
}
