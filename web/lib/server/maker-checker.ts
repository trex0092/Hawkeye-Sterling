// Hawkeye Sterling — Maker-Checker enforcement for high-risk decisions.
//
// Implements the two-person integrity (TPI) control required by:
//   UAE FDL 10/2025 Art.16 — Four-eyes principle for material AML decisions
//   FATF R.28             — Internal controls, compliance, audit
//
// Supported action types:
//   risk_override  — manual override of a system-generated risk score
//   str_filing     — filing a Suspicious Transaction Report
//   whitelist_add  — adding a subject to a permanent whitelist / FP register
//   pep_clearance  — clearing a PEP-classified subject
//   case_close     — closing a compliance case
//
// Storage key: `maker-checker:<tenantId>:<id>`
//
// Invariants:
//   • Checker MUST differ from initiator (self-approval is blocked).
//   • Only "pending" requests can be approved or rejected.
//   • All state transitions are reflected in requestedAt / checkedAt.

import { getJson, setJson, listKeys } from "./store";
import { writeAuditChainEntry } from "./audit-chain";

// ── Public types ──────────────────────────────────────────────────────────────

export type MakerCheckerActionType =
  | "risk_override"
  | "str_filing"
  | "whitelist_add"
  | "pep_clearance"
  | "case_close";

export type MakerCheckerStatus = "pending" | "approved" | "rejected";

export interface MakerCheckerRequest {
  id: string;
  tenantId: string;
  initiatorId: string;
  actionType: MakerCheckerActionType;
  subjectId: string;
  payload: Record<string, unknown>;
  requestedAt: string;
  status: MakerCheckerStatus;
  checkerId?: string;
  checkedAt?: string;
  checkerNote?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
const MAX_ID_LEN = 96;

function blobKey(tenantId: string, id: string): string {
  return `maker-checker:${tenantId}:${id}`;
}

function prefixForTenant(tenantId: string): string {
  return `maker-checker:${tenantId}:`;
}

function newId(): string {
  return `mc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeId(raw: string): string | null {
  if (!raw || raw.length > MAX_ID_LEN || !SAFE_ID_RE.test(raw)) return null;
  return raw;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new maker-checker request. The request enters status "pending"
 * and awaits approval by a DIFFERENT operator (checker != initiator).
 */
export async function createMakerCheckerRequest(
  req: Omit<MakerCheckerRequest, "id" | "status" | "requestedAt">,
): Promise<MakerCheckerRequest> {
  if (!req.tenantId || !req.initiatorId || !req.actionType || !req.subjectId) {
    throw new Error("tenantId, initiatorId, actionType, and subjectId are required");
  }

  const id = newId();
  const record: MakerCheckerRequest = {
    ...req,
    id,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };

  await setJson(blobKey(req.tenantId, id), record);

  void writeAuditChainEntry({
    event: "maker_checker.created",
    actor: req.initiatorId,
    target: req.subjectId,
    body: {
      id,
      actionType: req.actionType,
      tenantId: req.tenantId,
    },
  }, req.tenantId).catch((err: unknown) => {
    console.warn("[maker-checker] audit write failed on create:", err instanceof Error ? err.message : err);
  });

  return record;
}

/**
 * Approve a pending maker-checker request. The checker must be a different
 * user from the initiator (four-eyes principle — UAE FDL 10/2025 Art.16).
 */
export async function approveMakerCheckerRequest(
  id: string,
  checkerId: string,
  note?: string,
): Promise<MakerCheckerRequest> {
  const tenantId = await resolveTenantForId(id);
  if (!tenantId) throw new Error(`maker-checker request not found: ${id}`);

  const existing = await getJson<MakerCheckerRequest>(blobKey(tenantId, id));
  if (!existing) throw new Error(`maker-checker request not found: ${id}`);
  if (existing.status !== "pending") throw new Error(`request is already ${existing.status}`);
  if (existing.initiatorId === checkerId) {
    throw new Error(
      "checker must differ from initiator — self-approval is prohibited (UAE FDL 10/2025 Art.16 four-eyes principle)",
    );
  }

  const updated: MakerCheckerRequest = {
    ...existing,
    status: "approved",
    checkerId,
    checkedAt: new Date().toISOString(),
    ...(note?.trim() ? { checkerNote: note.trim() } : {}),
  };

  await setJson(blobKey(tenantId, id), updated);

  void writeAuditChainEntry({
    event: "maker_checker.approved",
    actor: checkerId,
    target: updated.subjectId,
    body: { id, actionType: updated.actionType, initiatorId: updated.initiatorId },
  }, tenantId).catch((err: unknown) => {
    console.warn("[maker-checker] audit write failed on approve:", err instanceof Error ? err.message : err);
  });

  return updated;
}

/**
 * Reject a pending maker-checker request. Note is mandatory for rejections
 * to satisfy audit trail requirements. Checker must differ from initiator.
 */
export async function rejectMakerCheckerRequest(
  id: string,
  checkerId: string,
  note: string,
): Promise<MakerCheckerRequest> {
  if (!note?.trim()) throw new Error("rejection note is required");

  const tenantId = await resolveTenantForId(id);
  if (!tenantId) throw new Error(`maker-checker request not found: ${id}`);

  const existing = await getJson<MakerCheckerRequest>(blobKey(tenantId, id));
  if (!existing) throw new Error(`maker-checker request not found: ${id}`);
  if (existing.status !== "pending") throw new Error(`request is already ${existing.status}`);
  if (existing.initiatorId === checkerId) {
    throw new Error(
      "checker must differ from initiator — self-rejection is prohibited (UAE FDL 10/2025 Art.16 four-eyes principle)",
    );
  }

  const updated: MakerCheckerRequest = {
    ...existing,
    status: "rejected",
    checkerId,
    checkedAt: new Date().toISOString(),
    checkerNote: note.trim(),
  };

  await setJson(blobKey(tenantId, id), updated);

  void writeAuditChainEntry({
    event: "maker_checker.rejected",
    actor: checkerId,
    target: updated.subjectId,
    body: { id, actionType: updated.actionType, initiatorId: updated.initiatorId, note },
  }, tenantId).catch((err: unknown) => {
    console.warn("[maker-checker] audit write failed on reject:", err instanceof Error ? err.message : err);
  });

  return updated;
}

/**
 * List all pending maker-checker requests for a tenant.
 * Returns newest first.
 */
export async function listPendingRequests(tenantId: string): Promise<MakerCheckerRequest[]> {
  const prefix = prefixForTenant(tenantId);
  const keys = await listKeys(prefix).catch(() => [] as string[]);
  const records = await Promise.all(
    keys.map((k) => getJson<MakerCheckerRequest>(k).catch(() => null)),
  );
  return records
    .filter((r): r is MakerCheckerRequest => r !== null && r.status === "pending")
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/**
 * List ALL maker-checker requests for a tenant (all statuses).
 * Returns newest first.
 */
export async function listAllRequests(tenantId: string): Promise<MakerCheckerRequest[]> {
  const prefix = prefixForTenant(tenantId);
  const keys = await listKeys(prefix).catch(() => [] as string[]);
  const records = await Promise.all(
    keys.map((k) => getJson<MakerCheckerRequest>(k).catch(() => null)),
  );
  return records
    .filter((r): r is MakerCheckerRequest => r !== null)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/**
 * Load a single request by id within a tenant.
 */
export async function getRequestById(id: string, tenantId: string): Promise<MakerCheckerRequest | null> {
  const safe = safeId(id);
  if (!safe) return null;
  return getJson<MakerCheckerRequest>(blobKey(tenantId, safe));
}

// ── Internal: tenant resolution ───────────────────────────────────────────────
// When approve/reject is called and the caller provides only the id (not
// tenantId), we scan the store to find which tenant owns the record.

async function resolveTenantForId(id: string): Promise<string | null> {
  const safe = safeId(id);
  if (!safe) return null;

  const allKeys = await listKeys("maker-checker:").catch(() => [] as string[]);
  const matchKey = allKeys.find((k) => k.endsWith(`:${safe}`));
  if (!matchKey) return null;

  // Key format: maker-checker:<tenantId>:<id>
  const withoutPrefix = matchKey.replace(/^maker-checker:/, "");
  const colonIdx = withoutPrefix.indexOf(":");
  if (colonIdx < 0) return null;
  return withoutPrefix.slice(0, colonIdx);
}
