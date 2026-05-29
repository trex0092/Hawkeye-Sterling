// PNMR — Provisional/Preliminary Notification of Match Record store.
//
// Regulatory basis: Cabinet Decision 74/2020 — PNMR must be filed within
// 5 UAE business days of a hit against the LTL, EOCN, or UN Consolidated lists.
//
// Storage layout: pnmr/<tenantId>/<id>.json

import { randomBytes } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export interface PnmrRecord {
  id: string;               // "PNMR-YYYYMMDD-xxxx"
  tenantId: string;
  subjectId?: string;
  subjectName: string;
  screeningHitId?: string;  // hit reference from quick-screen
  listId: string;           // "uae_ltl", "uae_eocn", "un_consolidated", etc.
  listLabel: string;        // human-readable list name
  status: "pending" | "submitted" | "resolved_false_positive" | "resolved_confirmed";
  goamlRef?: string;        // goAML submission reference
  createdAt: string;        // ISO
  dueAt: string;            // ISO — 5 UAE business days from createdAt
  submittedAt?: string;
  resolvedAt?: string;
  notes?: string;
  initiatedBy?: string;     // user/system
}

// UAE public holidays 2025-2026 for business-day calculation.
const UAE_HOLIDAYS = new Set([
  "2025-01-01","2025-03-29","2025-03-30","2025-04-02","2025-04-18","2025-06-06",
  "2025-06-07","2025-06-08","2025-09-22","2025-09-23","2025-10-29","2025-12-02",
  "2026-01-01","2026-03-18","2026-03-19","2026-03-20","2026-04-07","2026-05-26",
  "2026-05-27","2026-05-28","2026-09-11","2026-09-12","2026-10-19","2026-12-02",
]);

function addUaeBusinessDays(from: Date, days: number): Date {
  let remaining = days;
  const d = new Date(from.getTime());
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 5 && dow !== 6 && !UAE_HOLIDAYS.has(d.toISOString().slice(0, 10))) remaining--;
  }
  return d;
}

export function pnmrKey(tenantId: string, id: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const i = id.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
  return `pnmr/${t}/${i}.json`;
}

function generatePnmrId(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const rand = randomBytes(2).toString("hex");
  return `PNMR-${stamp}-${rand}`;
}

export async function createPnmrRecord(
  tenantId: string,
  fields: {
    subjectName: string;
    listId: string;
    listLabel: string;
    subjectId?: string;
    screeningHitId?: string;
    notes?: string;
    initiatedBy?: string;
  },
): Promise<PnmrRecord> {
  const now = new Date();
  const id = generatePnmrId();
  const dueAt = addUaeBusinessDays(now, 5).toISOString();

  const record: PnmrRecord = {
    id,
    tenantId,
    subjectName: fields.subjectName,
    listId: fields.listId,
    listLabel: fields.listLabel,
    status: "pending",
    createdAt: now.toISOString(),
    dueAt,
    ...(fields.subjectId !== undefined ? { subjectId: fields.subjectId } : {}),
    ...(fields.screeningHitId !== undefined ? { screeningHitId: fields.screeningHitId } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
    ...(fields.initiatedBy !== undefined ? { initiatedBy: fields.initiatedBy } : {}),
  };

  await setJson(pnmrKey(tenantId, id), record);

  void writeAuditChainEntry({
    event: "pnmr.created",
    actor: fields.initiatedBy ?? "system",
    pnmrId: id,
    subjectName: fields.subjectName,
    listId: fields.listId,
    dueAt,
  }, tenantId).catch((err: unknown) =>
    console.warn("[pnmr] audit chain write failed:", err instanceof Error ? err.message : String(err))
  );

  return record;
}

export async function loadPnmrRecord(tenantId: string, id: string): Promise<PnmrRecord | null> {
  return getJson<PnmrRecord>(pnmrKey(tenantId, id));
}

export async function loadAllPnmrRecords(tenantId: string): Promise<PnmrRecord[]> {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const prefix = `pnmr/${t}/`;
  const keys = await listKeys(prefix);
  const items = await Promise.all(keys.map((k) => getJson<PnmrRecord>(k)));
  return items.filter((r): r is PnmrRecord => r !== null);
}

export async function updatePnmrRecord(
  tenantId: string,
  id: string,
  patch: Partial<Omit<PnmrRecord, "id" | "tenantId" | "createdAt">>,
  actor = "system",
): Promise<PnmrRecord> {
  const existing = await loadPnmrRecord(tenantId, id);
  if (!existing) throw new Error(`PNMR record not found: ${id}`);

  const updated: PnmrRecord = { ...existing, ...patch };
  await setJson(pnmrKey(tenantId, id), updated);

  void writeAuditChainEntry({
    event: "pnmr.updated",
    actor,
    pnmrId: id,
    status: updated.status,
    ...patch,
  }, tenantId).catch((err: unknown) =>
    console.warn("[pnmr] audit chain write failed:", err instanceof Error ? err.message : String(err))
  );

  return updated;
}
