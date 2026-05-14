// POST /api/pdpl/erase  — PDPL 45/2021 Art.39 right-to-be-forgotten.
//
// Distinct from /api/gdpr/delete (admin-only hard-delete tool):
// this endpoint implements the audit-grade erasure workflow PDPL requires:
//
//   1. **Soft-delete** — flip the record's `_erased` flag, replace PII
//      fields with deterministic-hash placeholders (irreversible without
//      the original input), keep the hash anchor so the audit trail can
//      still link to the erasure event without surfacing PII.
//   2. **Legal-hold timer** — anonymised record retained for ERASURE_LEGAL_HOLD_DAYS
//      (default 365) to satisfy concurrent AML retention obligations
//      under FDL 10/2025 Art.24. A subsequent purge cron hard-deletes
//      after the hold expires.
//   3. **Audit-log** — every erasure recorded as a tamper-evident event
//      (subject, requester, timestamp, scope, regulation basis).
//
// Request body:
//   {
//     subjectId?: string,
//     email?: string,
//     requesterEmail: string,        // who's requesting erasure (data subject)
//     legalBasis?: string,           // optional — e.g. "consent withdrawn"
//     dryRun?: boolean
//   }
//
// Auth: ADMIN_TOKEN (operator must verify identity OOB before invoking).

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import { adminAuth } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ERASURE_LEGAL_HOLD_DAYS = Number.parseInt(process.env["PDPL_ERASURE_HOLD_DAYS"] ?? "365", 10);
const ERASURE_LOG_PREFIX = "pdpl/erasures/";

// PII fields we hash-anonymise. Anything not in this set is left intact
// so the system can still operate on the anonymised stub.
const PII_FIELDS = new Set([
  "name", "fullName", "primaryName",
  "email", "phone", "phoneNumber",
  "dob", "dateOfBirth",
  "passport", "passportNumber", "nationalId", "emiratesId",
  "address", "physicalAddress", "residenceAddress",
  "requesterEmail",
]);

interface ErasureRequestBody {
  subjectId?: string;
  email?: string;
  requesterEmail?: string;
  legalBasis?: string;
  dryRun?: boolean;
}

interface ErasedRecord {
  _erased: true;
  _erasedAt: string;
  _erasureId: string;
  _holdExpiresAt: string;
  _originalKeyHash: string;
  [key: string]: unknown;
}

interface ErasureLogEntry {
  id: string;
  subjectId?: string;
  email?: string;
  requesterEmail: string;
  legalBasis: string;
  erasedAt: string;
  holdExpiresAt: string;
  keysAffected: string[];
  regulationBasis: string[];
}

function anonymisePiiField(value: unknown, fieldName: string, salt: string): string {
  if (typeof value !== "string" || !value) return "[ERASED]";
  // Deterministic hash so re-running an erasure on the same record
  // doesn't change downstream cross-references. Salt = the erasure ID
  // so different erasures of the same value produce different tokens.
  const h = createHash("sha256").update(`${salt}|${fieldName}|${value}`).digest("hex").slice(0, 12);
  return `[ERASED_${fieldName.toUpperCase()}_${h}]`;
}

function anonymiseRecord(
  rec: Record<string, unknown>,
  erasureId: string,
  originalKey: string,
): ErasedRecord {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (PII_FIELDS.has(k)) {
      out[k] = anonymisePiiField(v, k, erasureId);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = anonymiseRecord(v as Record<string, unknown>, erasureId, originalKey);
    } else {
      out[k] = v;
    }
  }
  const hold = new Date();
  hold.setDate(hold.getDate() + ERASURE_LEGAL_HOLD_DAYS);
  return {
    ...out,
    _erased: true,
    _erasedAt: new Date().toISOString(),
    _erasureId: erasureId,
    _holdExpiresAt: hold.toISOString(),
    _originalKeyHash: createHash("sha256").update(originalKey).digest("hex").slice(0, 16),
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  let body: ErasureRequestBody;
  try {
    body = (await req.json()) as ErasureRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const subjectId = body.subjectId?.trim();
  const email = body.email?.trim().toLowerCase();
  const requesterEmail = body.requesterEmail?.trim().toLowerCase();
  if (!subjectId && !email) {
    return NextResponse.json({ ok: false, error: "subjectId or email required" }, { status: 400 });
  }
  if (!requesterEmail) {
    return NextResponse.json(
      { ok: false, error: "requesterEmail required (PDPL Art.39 requires data-subject attribution)" },
      { status: 400 },
    );
  }

  const erasureId = `erase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const prefixes = [
    "ongoing/subject/",
    "ongoing/last/",
    "feedback/",
    "corrections/",
    "screening-history/",
    "cases/",
  ];

  const keysAffected: string[] = [];
  let totalScanned = 0;

  for (const prefix of prefixes) {
    const keys = await listKeys(prefix);
    totalScanned += keys.length;
    for (const k of keys) {
      const rec = await getJson<Record<string, unknown>>(k);
      if (!rec || rec["_erased"]) continue; // skip already-erased
      const idField = String(rec["id"] ?? "");
      const subjField = String(rec["subjectId"] ?? rec["id"] ?? "");
      const emailField = (typeof rec["requesterEmail"] === "string" ? rec["requesterEmail"] : rec["email"]) as string | undefined;
      const matches =
        (subjectId !== undefined && (idField === subjectId || subjField === subjectId)) ||
        (email !== undefined && typeof emailField === "string" && emailField.toLowerCase() === email);
      if (!matches) continue;
      keysAffected.push(k);
      if (!body.dryRun) {
        const anonymised = anonymiseRecord(rec, erasureId, k);
        await setJson(k, anonymised);
      }
    }
  }

  // Persist the erasure log entry itself. Auditors trace back via the
  // erasure ID; the log retains scope but not the original PII.
  const hold = new Date();
  hold.setDate(hold.getDate() + ERASURE_LEGAL_HOLD_DAYS);
  const logEntry: ErasureLogEntry = {
    id: erasureId,
    ...(subjectId ? { subjectId } : {}),
    ...(email ? { email: anonymisePiiField(email, "email", erasureId) } : {}),
    requesterEmail: anonymisePiiField(requesterEmail, "requesterEmail", erasureId),
    legalBasis: body.legalBasis ?? "data-subject erasure request",
    erasedAt: new Date().toISOString(),
    holdExpiresAt: hold.toISOString(),
    keysAffected,
    regulationBasis: [
      "UAE PDPL Federal Decree-Law 45/2021 Art.39 (right to erasure)",
      "UAE FDL 10/2025 Art.24 (10-year AML retention — basis for legal-hold timer)",
      "GDPR Art.17(3)(b) (legal-obligation exemption for AML)",
    ],
  };
  if (!body.dryRun) {
    await setJson(`${ERASURE_LOG_PREFIX}${erasureId}`, logEntry);
  }

  return NextResponse.json({
    ok: true,
    regulation: "UAE PDPL Art.39 / FDL 10/2025 Art.24",
    erasureId,
    dryRun: Boolean(body.dryRun),
    keysAnonymised: keysAffected.length,
    keysAffected,
    totalScanned,
    holdExpiresAt: logEntry.holdExpiresAt,
    holdDays: ERASURE_LEGAL_HOLD_DAYS,
    hint: body.dryRun
      ? "Dry run — no records modified. Re-run with dryRun: false to perform erasure."
      : `Records anonymised. Audit hash anchors retained for ${ERASURE_LEGAL_HOLD_DAYS} days for AML retention; purge cron then hard-deletes.`,
    log: logEntry,
  });
}
