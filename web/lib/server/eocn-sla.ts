// EOCN SLA — countdown timers for UAE Cabinet Decision 74/2020 obligations.
//
// Three SLA types are tracked per EOCN/LTL/UN hit:
//   EOCN_FREEZE_24H           — 24 calendar hours to apply asset freeze
//   EOCN_PNMR_5BD             — 5 UAE business days to file PNMR via goAML
//   EOCN_CUSTOMER_VERIFY_10BD — 10 UAE business days for customer identity verification
//
// Storage layout: eocn-sla/<tenantId>/<id>.json

import { getJson, setJson, listKeys } from "@/lib/server/store";

export type EocnSlaType =
  | "EOCN_FREEZE_24H"
  | "EOCN_PNMR_5BD"
  | "EOCN_CUSTOMER_VERIFY_10BD";

export type EocnSlaStatus = "active" | "breached" | "completed" | "cancelled";

export interface EocnSlaRecord {
  id: string;           // "ESLA-YYYYMMDD-xxxx"
  tenantId: string;
  type: EocnSlaType;
  pnmrId?: string;      // linked PNMR record
  subjectName: string;
  listId: string;
  status: EocnSlaStatus;
  createdAt: string;    // ISO
  dueAt: string;        // deadline ISO string
  completedAt?: string;
  breachedAt?: string;
  notes?: string;
}

export interface EocnSlaRecordEnriched extends EocnSlaRecord {
  hoursRemaining: number;
  pctElapsed: number;
  statusColor: "green" | "amber" | "red";
}

// UAE public holidays 2025-2026 for business-day calculation.
// Mirrors the set used in pnmr.ts.
const UAE_HOLIDAYS = new Set([
  "2025-01-01","2025-03-29","2025-03-30","2025-04-02","2025-04-18","2025-06-06",
  "2025-06-07","2025-06-08","2025-09-22","2025-09-23","2025-10-29","2025-12-02",
  "2026-01-01","2026-03-18","2026-03-19","2026-03-20","2026-04-07","2026-05-26",
  "2026-05-27","2026-05-28","2026-09-11","2026-09-12","2026-10-19","2026-12-02",
]);

// UAE weekend: Friday (5) and Saturday (6).
export function addUaeBusinessDays(from: Date, days: number): Date {
  let remaining = days;
  const d = new Date(from.getTime());
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 5 && dow !== 6 && !UAE_HOLIDAYS.has(d.toISOString().slice(0, 10))) {
      remaining--;
    }
  }
  return d;
}

function eocnSlaKey(tenantId: string, id: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const i = id.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
  return `eocn-sla/${t}/${i}.json`;
}

function generateEocnSlaId(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `ESLA-${stamp}-${rand}`;
}

function computeDueAt(type: EocnSlaType, from: Date): string {
  switch (type) {
    case "EOCN_FREEZE_24H":
      return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case "EOCN_PNMR_5BD":
      return addUaeBusinessDays(from, 5).toISOString();
    case "EOCN_CUSTOMER_VERIFY_10BD":
      return addUaeBusinessDays(from, 10).toISOString();
  }
}

export async function createEocnSlaRecord(
  tenantId: string,
  fields: {
    type: EocnSlaType;
    subjectName: string;
    listId: string;
    pnmrId?: string;
    notes?: string;
  },
): Promise<EocnSlaRecord> {
  const now = new Date();
  const id = generateEocnSlaId();
  const dueAt = computeDueAt(fields.type, now);

  const record: EocnSlaRecord = {
    id,
    tenantId,
    type: fields.type,
    subjectName: fields.subjectName,
    listId: fields.listId,
    status: "active",
    createdAt: now.toISOString(),
    dueAt,
    ...(fields.pnmrId !== undefined ? { pnmrId: fields.pnmrId } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
  };

  await setJson(eocnSlaKey(tenantId, id), record);
  return record;
}

export async function loadEocnSlaRecord(
  tenantId: string,
  id: string,
): Promise<EocnSlaRecord | null> {
  return getJson<EocnSlaRecord>(eocnSlaKey(tenantId, id));
}

export async function loadAllEocnSlaRecords(tenantId: string): Promise<EocnSlaRecord[]> {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const prefix = `eocn-sla/${t}/`;
  const keys = await listKeys(prefix);
  const items = await Promise.all(keys.map((k) => getJson<EocnSlaRecord>(k)));
  return items.filter((r): r is EocnSlaRecord => r !== null);
}

export async function updateEocnSlaRecord(
  tenantId: string,
  id: string,
  patch: Partial<Omit<EocnSlaRecord, "id" | "tenantId" | "createdAt">>,
): Promise<EocnSlaRecord> {
  const existing = await loadEocnSlaRecord(tenantId, id);
  if (!existing) throw new Error(`EOCN SLA record not found: ${id}`);

  const updated: EocnSlaRecord = { ...existing, ...patch };
  await setJson(eocnSlaKey(tenantId, id), updated);
  return updated;
}

/** Enrich a record with computed countdown fields. */
export function computeEocnSlaStatus(record: EocnSlaRecord): EocnSlaRecordEnriched {
  const now = Date.now();
  const createdMs = new Date(record.createdAt).getTime();
  const dueMs = new Date(record.dueAt).getTime();
  const totalMs = Math.max(dueMs - createdMs, 1);
  const elapsedMs = now - createdMs;
  const remainingMs = dueMs - now;

  const hoursRemaining = remainingMs / (1000 * 60 * 60);
  const pctElapsed = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

  let statusColor: "green" | "amber" | "red";
  if (record.status === "breached" || hoursRemaining <= 0) {
    statusColor = "red";
  } else if (pctElapsed >= 75) {
    statusColor = "amber";
  } else {
    statusColor = "green";
  }

  return {
    ...record,
    hoursRemaining,
    pctElapsed,
    statusColor,
  };
}
