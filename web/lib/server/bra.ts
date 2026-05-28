// Business Risk Assessment (BRA) store — MOE Circular 6/2025
//
// Provides CRUD operations for BRA records with a 90-day mandatory review
// cycle as required by UAE Ministry of Economy Circular 6/2025 for DNFBPs.
//
// Regulatory basis: MOE Circular 6/2025, CBUAE Rulebook Ch.6

import { randomBytes } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export interface BraRecord {
  id: string;              // "BRA-YYYYMMDD-xxxx"
  tenantId: string;
  status: "draft" | "active" | "overdue_review" | "superseded";
  inherentRisk: 1 | 2 | 3 | 4 | 5;  // 1=very low, 5=very high
  controlsEffectiveness: 1 | 2 | 3 | 4 | 5;  // 1=very weak, 5=very strong
  residualRisk: number;  // computed: inherentRisk * (6 - controlsEffectiveness) / 5
  // MOE-required risk categories (each rated 1-5)
  customerRisk: number;
  productRisk: number;
  channelRisk: number;
  geographyRisk: number;
  // DNFBP fields
  isDnfbp: boolean;
  aedThresholdApplies: boolean;  // true if any transaction >= AED 55,000
  activityScope: string;         // description of DNFBP activities
  // Review cycle
  approvedBy?: string;           // MLRO name
  approvedAt?: string;           // ISO
  nextReviewDate: string;        // ISO — 90 days from approval
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type BraCreateFields = Pick<
  BraRecord,
  | "inherentRisk"
  | "controlsEffectiveness"
  | "customerRisk"
  | "productRisk"
  | "channelRisk"
  | "geographyRisk"
  | "activityScope"
> & {
  isDnfbp?: boolean;
  aedThresholdApplies?: boolean;
  notes?: string;
};

export type BraPatch = Partial<
  Omit<BraRecord, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function braKey(tenantId: string, id: string): string {
  return `bra/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function computeResidualRisk(inherentRisk: number, controlsEffectiveness: number): number {
  return Math.round((inherentRisk * (6 - controlsEffectiveness)) / 5 * 100) / 100;
}

function addDays(date: Date, days: number): string {
  const result = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return result.toISOString();
}

function generateBraId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `BRA-${yyyymmdd}-${suffix}`;
}

export async function createBraRecord(
  tenantId: string,
  fields: BraCreateFields,
): Promise<BraRecord> {
  const now = new Date();
  const id = generateBraId();
  const residualRisk = computeResidualRisk(fields.inherentRisk, fields.controlsEffectiveness);
  const nextReviewDate = addDays(now, 90);

  const record: BraRecord = {
    id,
    tenantId,
    status: "draft",
    inherentRisk: fields.inherentRisk,
    controlsEffectiveness: fields.controlsEffectiveness,
    residualRisk,
    customerRisk: fields.customerRisk,
    productRisk: fields.productRisk,
    channelRisk: fields.channelRisk,
    geographyRisk: fields.geographyRisk,
    isDnfbp: fields.isDnfbp ?? false,
    aedThresholdApplies: fields.aedThresholdApplies ?? false,
    activityScope: fields.activityScope,
    nextReviewDate,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };

  await setJson(braKey(tenantId, id), record);

  await writeAuditChainEntry(
    {
      event: "bra.created",
      actor: "system",
      caseId: id,
      inherentRisk: fields.inherentRisk,
      residualRisk,
      isDnfbp: record.isDnfbp,
    },
    tenantId,
  );

  return record;
}

export async function loadBraRecord(
  tenantId: string,
  id: string,
): Promise<BraRecord | null> {
  return getJson<BraRecord>(braKey(tenantId, id));
}

export async function loadAllBraRecords(tenantId: string): Promise<BraRecord[]> {
  const prefix = `bra/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<BraRecord>(key)),
  );
  return records.filter((r): r is BraRecord => r !== null);
}

export async function updateBraRecord(
  tenantId: string,
  id: string,
  patch: BraPatch,
): Promise<BraRecord> {
  const existing = await loadBraRecord(tenantId, id);
  if (!existing) {
    throw new Error(`BRA record not found: ${id}`);
  }

  const now = new Date();
  const updated: BraRecord = { ...existing, ...patch, updatedAt: now.toISOString() };

  // Recalculate residualRisk and nextReviewDate when status changes to "active"
  if (patch.status === "active") {
    updated.residualRisk = computeResidualRisk(updated.inherentRisk, updated.controlsEffectiveness);
    updated.nextReviewDate = addDays(now, 90);
  }

  await setJson(braKey(tenantId, id), updated);
  return updated;
}
