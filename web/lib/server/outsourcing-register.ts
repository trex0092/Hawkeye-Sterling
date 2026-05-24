// Outsourcing / Third-Party Register store — FDL 10/2025 Art.18
//
// Provides CRUD operations for outsourcing arrangement records.
// AML/CFT outsourcing arrangements require annual MLRO review and Board approval
// per FDL 10/2025 Art.18 and CBUAE Outsourcing Guidance.
//
// Regulatory basis: FDL 10/2025 Art.18, CBUAE Outsourcing Guidance, FATF R.2

import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface OutsourcingArrangement {
  id: string;              // "OSR-YYYYMMDD-xxxx"
  tenantId: string;
  vendorName: string;
  vendorCountry: string;
  serviceType: string;     // e.g. "KYC Screening", "Transaction Monitoring", "CDD Data"
  amlCftRelevant: boolean; // Does this arrangement touch AML/CFT functions?
  contractStartDate: string;
  contractEndDate?: string;
  riskRating: "high" | "medium" | "low";
  lastAssessmentDate?: string;
  nextAssessmentDate?: string;  // auto: +1 year from lastAssessmentDate
  boardApproved: boolean;
  agreementCurrent: boolean;
  status: "active" | "under_review" | "terminated" | "pending_approval";
  mlroSignOff?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type OutsourcingCreateFields = Pick<
  OutsourcingArrangement,
  | "vendorName"
  | "vendorCountry"
  | "serviceType"
  | "amlCftRelevant"
  | "contractStartDate"
  | "riskRating"
> & {
  contractEndDate?: string;
  boardApproved?: boolean;
  agreementCurrent?: boolean;
  mlroSignOff?: boolean;
  notes?: string;
};

export type OutsourcingPatch = Partial<
  Omit<OutsourcingArrangement, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function outsourcingKey(tenantId: string, id: string): string {
  return `outsourcing-register/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function generateOsrId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OSR-${yyyymmdd}-${suffix}`;
}

function applyOverdueFlag(record: OutsourcingArrangement): OutsourcingArrangement {
  if (
    record.nextAssessmentDate &&
    new Date(record.nextAssessmentDate) < new Date() &&
    record.status !== "terminated"
  ) {
    return { ...record, status: "under_review" };
  }
  return record;
}

export async function createOutsourcingArrangement(
  tenantId: string,
  fields: OutsourcingCreateFields,
): Promise<OutsourcingArrangement> {
  const now = new Date();
  const id = generateOsrId();

  const record: OutsourcingArrangement = {
    id,
    tenantId,
    vendorName: fields.vendorName,
    vendorCountry: fields.vendorCountry,
    serviceType: fields.serviceType,
    amlCftRelevant: fields.amlCftRelevant,
    contractStartDate: fields.contractStartDate,
    riskRating: fields.riskRating,
    boardApproved: fields.boardApproved ?? false,
    agreementCurrent: fields.agreementCurrent ?? false,
    status: "pending_approval",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(fields.contractEndDate ? { contractEndDate: fields.contractEndDate } : {}),
    ...(fields.mlroSignOff !== undefined ? { mlroSignOff: fields.mlroSignOff } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };

  await setJson(outsourcingKey(tenantId, id), record);
  return record;
}

export async function loadOutsourcingArrangement(
  tenantId: string,
  id: string,
): Promise<OutsourcingArrangement | null> {
  const record = await getJson<OutsourcingArrangement>(outsourcingKey(tenantId, id));
  if (!record) return null;
  return applyOverdueFlag(record);
}

export async function loadAllOutsourcingArrangements(
  tenantId: string,
): Promise<OutsourcingArrangement[]> {
  const prefix = `outsourcing-register/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<OutsourcingArrangement>(key)),
  );
  return records
    .filter((r): r is OutsourcingArrangement => r !== null)
    .map(applyOverdueFlag);
}

export async function updateOutsourcingArrangement(
  tenantId: string,
  id: string,
  patch: OutsourcingPatch,
): Promise<OutsourcingArrangement> {
  const existing = await getJson<OutsourcingArrangement>(outsourcingKey(tenantId, id));
  if (!existing) {
    throw new Error(`Outsourcing arrangement not found: ${id}`);
  }

  const now = new Date();
  const updated: OutsourcingArrangement = { ...existing, ...patch, updatedAt: now.toISOString() };

  // Auto-compute nextAssessmentDate when lastAssessmentDate is updated
  if (patch.lastAssessmentDate && !patch.nextAssessmentDate) {
    updated.nextAssessmentDate = addYears(patch.lastAssessmentDate, 1);
  }

  await setJson(outsourcingKey(tenantId, id), updated);
  return applyOverdueFlag(updated);
}
