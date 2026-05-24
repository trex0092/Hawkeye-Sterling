// Compliance Training Tracker — per-tenant store for staff training records.
// Storage key pattern: training:<tenantId>:<id>
// Status is always computed at read-time from expiresAt vs now.

import { getJson, setJson, listKeys } from "@/lib/server/store";
import { randomBytes } from "node:crypto";

export interface TrainingRecord {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  courseCode: string;
  courseName: string;
  completedAt: string;     // ISO date
  expiresAt: string;       // ISO date (completedAt + validityMonths)
  validityMonths: number;  // default 12
  status: "current" | "expiring_soon" | "expired";
  certificateRef?: string;
}

/** Compute status relative to now. */
function computeStatus(expiresAt: string): TrainingRecord["status"] {
  const exp = new Date(expiresAt).getTime();
  const now = Date.now();
  if (exp < now) return "expired";
  if (exp < now + 30 * 24 * 60 * 60 * 1000) return "expiring_soon";
  return "current";
}

function recordKey(tenantId: string, id: string): string {
  return `training:${tenantId}:${id}`;
}

function listPrefix(tenantId: string): string {
  return `training:${tenantId}:`;
}

export async function addTrainingRecord(
  input: Omit<TrainingRecord, "id" | "status">,
): Promise<TrainingRecord> {
  const id = randomBytes(12).toString("hex");
  const record: TrainingRecord = {
    ...input,
    id,
    status: computeStatus(input.expiresAt),
  };
  await setJson(recordKey(input.tenantId, id), record);
  return record;
}

export async function listTrainingRecords(tenantId: string): Promise<TrainingRecord[]> {
  const keys = await listKeys(listPrefix(tenantId));
  const records = await Promise.all(
    keys.map((k) => getJson<TrainingRecord>(k)),
  );
  return records
    .filter((r): r is TrainingRecord => r !== null)
    .map((r) => ({ ...r, status: computeStatus(r.expiresAt) }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function getExpiringRecords(
  tenantId: string,
  withinDays: number,
): Promise<TrainingRecord[]> {
  const all = await listTrainingRecords(tenantId);
  const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  return all.filter((r) => {
    const exp = new Date(r.expiresAt).getTime();
    return exp >= Date.now() && exp <= cutoff;
  });
}
