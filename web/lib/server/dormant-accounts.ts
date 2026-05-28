// Dormant Account Register store — CBUAE AML/CFT Guidelines §8
//
// Tracks accounts inactive for 12+ months with full re-KYC and MLRO
// notification workflow as required by CBUAE AML/CFT Guidelines §8.
//
// Regulatory basis: CBUAE AML/CFT Guidelines §8, §8.4

import { randomBytes } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface DormantAccount {
  id: string;              // "DRM-YYYYMMDD-xxxx"
  tenantId: string;
  customerName: string;
  accountRef: string;      // internal account reference
  lastActivityDate: string; // ISO date
  dormancyStartDate: string; // date account crossed 12-month threshold
  riskRating: "high" | "medium" | "low";
  flaggedDate: string;     // when Hawkeye flagged it
  status: "flagged" | "under_review" | "reactivated" | "closed" | "escalated";
  reactivationReason?: string;
  reactivationDate?: string;
  reactivationReKycCompleted?: boolean;
  mlroNotified?: boolean;
  mlroNotifiedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DormantAccountCreateFields = Pick<
  DormantAccount,
  | "customerName"
  | "accountRef"
  | "lastActivityDate"
  | "riskRating"
> & {
  notes?: string;
};

export type DormantAccountPatch = Partial<
  Omit<DormantAccount, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function dormantAccountKey(tenantId: string, id: string): string {
  return `dormant-accounts/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function generateDrmId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `DRM-${yyyymmdd}-${suffix}`;
}

export async function createDormantAccount(
  tenantId: string,
  fields: DormantAccountCreateFields,
): Promise<DormantAccount> {
  const now = new Date();
  const id = generateDrmId();

  // dormancyStartDate = lastActivityDate + 365 days
  const dormancyStartDate = addDays(fields.lastActivityDate, 365);

  const record: DormantAccount = {
    id,
    tenantId,
    customerName: fields.customerName,
    accountRef: fields.accountRef,
    lastActivityDate: fields.lastActivityDate,
    dormancyStartDate,
    riskRating: fields.riskRating,
    flaggedDate: now.toISOString().slice(0, 10),
    status: "flagged",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };

  await setJson(dormantAccountKey(tenantId, id), record);
  return record;
}

export async function loadDormantAccount(
  tenantId: string,
  id: string,
): Promise<DormantAccount | null> {
  return getJson<DormantAccount>(dormantAccountKey(tenantId, id));
}

export async function loadAllDormantAccounts(
  tenantId: string,
): Promise<DormantAccount[]> {
  const prefix = `dormant-accounts/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<DormantAccount>(key)),
  );
  return records.filter((r): r is DormantAccount => r !== null);
}

export async function updateDormantAccount(
  tenantId: string,
  id: string,
  patch: DormantAccountPatch,
): Promise<DormantAccount> {
  const existing = await loadDormantAccount(tenantId, id);
  if (!existing) {
    throw new Error(`Dormant account not found: ${id}`);
  }

  const now = new Date();
  const updated: DormantAccount = { ...existing, ...patch, updatedAt: now.toISOString() };

  await setJson(dormantAccountKey(tenantId, id), updated);
  return updated;
}
