// Server-side goAML submission vault — tracks XML generation, FIU submission
// status, and acknowledgment receipts per tenant.
//
// Storage layout:
//   hawkeye-goaml/<tenant>/submissions/<reportRef>.json   SubmissionRecord
//   hawkeye-goaml/<tenant>/_index.json                    lightweight index
//   hawkeye-goaml/<tenant>/submitted-hashes.json          sha256 → submissionRef (idempotency)

import { getJson, setJson, del, listKeys } from "@/lib/server/store";

export type SubmissionStatus =
  | "draft"         // XML generated, not yet submitted to FIU
  | "submitted"     // Manually submitted via FIU portal
  | "acknowledged"  // FIU confirmed receipt
  | "rejected"      // FIU rejected the submission
  | "failed";       // Submission attempt failed

export interface GoAmlSubmissionRecord {
  reportRef: string;          // HWK-STR-YYYYMMDD-<subject> — unique per envelope
  tenantId: string;
  reportCode: string;         // STR | SAR | FFR | etc.
  subjectName: string;
  entityType: string;
  narrativeSlice: string;     // first 200 chars for display
  charterHash: string;
  status: SubmissionStatus;
  generatedAt: string;        // ISO — when XML was first generated
  submittedAt?: string;       // ISO — when MLRO uploaded to FIU portal
  acknowledgedAt?: string;    // ISO — when FIU sent acknowledgment
  fiuResponseCode?: string;   // FIU response/error code
  fiuAcknowledgmentNumber?: string;
  retryCount: number;         // number of resubmission attempts
  lastRetryAt?: string;
  notes?: string;             // MLRO notes on the filing
  caseId?: string;            // linked Hawkeye case
  asanaTaskUrl?: string;
}

interface IndexEntry {
  reportRef: string;
  reportCode: string;
  subjectName: string;
  status: SubmissionStatus;
  generatedAt: string;
}

interface IndexFile {
  version: 1;
  updatedAt: string;
  entries: IndexEntry[];
}

function safeTenant(tenantId: string): string {
  return tenantId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

function submissionKey(tenantId: string, reportRef: string): string {
  const safeRef = reportRef.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
  return `hawkeye-goaml/${safeTenant(tenantId)}/submissions/${safeRef}.json`;
}

function submissionPrefix(tenantId: string): string {
  return `hawkeye-goaml/${safeTenant(tenantId)}/submissions/`;
}

function indexKey(tenantId: string): string {
  return `hawkeye-goaml/${safeTenant(tenantId)}/_index.json`;
}

export async function listGoAmlSubmissions(tenantId: string): Promise<GoAmlSubmissionRecord[]> {
  const prefix = submissionPrefix(tenantId);
  const keys = await listKeys(prefix);
  const records = await Promise.all(keys.map((k) => getJson<GoAmlSubmissionRecord>(k)));
  return records
    .filter((r): r is GoAmlSubmissionRecord => r !== null)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

export async function getGoAmlSubmission(
  tenantId: string,
  reportRef: string,
): Promise<GoAmlSubmissionRecord | null> {
  return getJson<GoAmlSubmissionRecord>(submissionKey(tenantId, reportRef));
}

export async function saveGoAmlSubmission(
  tenantId: string,
  record: GoAmlSubmissionRecord,
): Promise<void> {
  await setJson(submissionKey(tenantId, record.reportRef), record);
  // Update lightweight index
  const idx = (await getJson<IndexFile>(indexKey(tenantId))) ?? {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
  const existing = idx.entries.findIndex((e) => e.reportRef === record.reportRef);
  const entry: IndexEntry = {
    reportRef: record.reportRef,
    reportCode: record.reportCode,
    subjectName: record.subjectName,
    status: record.status,
    generatedAt: record.generatedAt,
  };
  if (existing >= 0) {
    idx.entries[existing] = entry;
  } else {
    idx.entries.unshift(entry);
  }
  idx.updatedAt = new Date().toISOString();
  await setJson(indexKey(tenantId), idx);
}

export async function deleteGoAmlSubmission(tenantId: string, reportRef: string): Promise<void> {
  await del(submissionKey(tenantId, reportRef));
  const idx = await getJson<IndexFile>(indexKey(tenantId));
  if (idx) {
    idx.entries = idx.entries.filter((e) => e.reportRef !== reportRef);
    idx.updatedAt = new Date().toISOString();
    await setJson(indexKey(tenantId), idx);
  }
}

// ── Idempotency helpers ───────────────────────────────────────────────────────
//
// Prevent duplicate live submissions to the UAE FIU goAML gateway.
// Maps sha256(xml) → submissionRef for any live submission that completed.
//
// Not perfectly atomic under concurrent requests, but the two-eyes signature
// requirement already serialises submissions in practice. This check catches
// the common case: retry after network timeout or accidental double-click.

function hashIndexKey(tenantId: string): string {
  return `hawkeye-goaml/${safeTenant(tenantId)}/submitted-hashes.json`;
}

/** Returns the existing submissionRef if this sha256 was already submitted live, else null. */
export async function findSubmittedBySha256(tenantId: string, draftSha256: string): Promise<string | null> {
  const idx = await getJson<Record<string, string>>(hashIndexKey(tenantId));
  return idx?.[draftSha256] ?? null;
}

/** Records a successful live submission so retries can be detected. */
export async function recordSubmittedSha256(tenantId: string, draftSha256: string, submissionRef: string): Promise<void> {
  const key = hashIndexKey(tenantId);
  const idx = (await getJson<Record<string, string>>(key)) ?? {};
  idx[draftSha256] = submissionRef;
  await setJson(key, idx);
}
