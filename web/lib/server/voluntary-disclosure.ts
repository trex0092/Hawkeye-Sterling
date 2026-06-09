// Voluntary Disclosure Workflow store — Federal Decree-Law No. 10 of 2025 Art.25
//
// Provides CRUD operations for voluntary disclosure records submitted to
// UAE regulatory bodies. Self-reporting before detection may qualify for
// enforcement mitigation under CBUAE enforcement policy.
//
// Regulatory basis: Federal Decree-Law No. 10 of 2025 Art.25, CBUAE Enforcement Policy

import { randomBytes } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface VoluntaryDisclosure {
  id: string;               // "VDR-YYYYMMDD-xxxx"
  tenantId: string;
  disclosureType: "sanctions_breach" | "str_filing_delay" | "cdd_failure" | "record_keeping" | "other";
  regulatoryBody: "UAE_FIU" | "MOE" | "CBUAE" | "EOCN" | "OTHER";
  detectedDate: string;     // ISO date — when breach was internally detected
  disclosureDate?: string;  // ISO date — when submitted to regulator
  description: string;
  rootCause: string;
  remediationTaken: string;
  status: "draft" | "pending_mlro" | "pending_legal" | "submitted" | "acknowledged" | "closed";
  mlroApproved?: boolean;
  mlroApprovalDate?: string;
  submittedBy?: string;
  regulatorRef?: string;    // reference number from regulator
  regulatorFeedback?: string;
  selfReportingDiscount?: boolean; // CBUAE enforcement policy
  createdAt: string;
  updatedAt: string;
}

export type VoluntaryDisclosureCreateFields = Pick<
  VoluntaryDisclosure,
  | "disclosureType"
  | "regulatoryBody"
  | "detectedDate"
  | "description"
  | "rootCause"
  | "remediationTaken"
> & {
  submittedBy?: string;
  selfReportingDiscount?: boolean;
};

export type VoluntaryDisclosurePatch = Partial<
  Omit<VoluntaryDisclosure, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function voluntaryDisclosureKey(tenantId: string, id: string): string {
  return `voluntary-disclosures/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function generateVdrId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `VDR-${yyyymmdd}-${suffix}`;
}

export async function createVoluntaryDisclosure(
  tenantId: string,
  fields: VoluntaryDisclosureCreateFields,
): Promise<VoluntaryDisclosure> {
  const now = new Date();
  const id = generateVdrId();

  const record: VoluntaryDisclosure = {
    id,
    tenantId,
    disclosureType: fields.disclosureType,
    regulatoryBody: fields.regulatoryBody,
    detectedDate: fields.detectedDate,
    description: fields.description,
    rootCause: fields.rootCause,
    remediationTaken: fields.remediationTaken,
    status: "draft",
    ...(fields.submittedBy ? { submittedBy: fields.submittedBy } : {}),
    ...(fields.selfReportingDiscount !== undefined ? { selfReportingDiscount: fields.selfReportingDiscount } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await setJson(voluntaryDisclosureKey(tenantId, id), record);
  return record;
}

export async function loadVoluntaryDisclosure(
  tenantId: string,
  id: string,
): Promise<VoluntaryDisclosure | null> {
  return getJson<VoluntaryDisclosure>(voluntaryDisclosureKey(tenantId, id));
}

export async function loadAllVoluntaryDisclosures(tenantId: string): Promise<VoluntaryDisclosure[]> {
  const prefix = `voluntary-disclosures/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<VoluntaryDisclosure>(key)),
  );
  return records.filter((r): r is VoluntaryDisclosure => r !== null);
}

export async function updateVoluntaryDisclosure(
  tenantId: string,
  id: string,
  patch: VoluntaryDisclosurePatch,
): Promise<VoluntaryDisclosure> {
  const existing = await loadVoluntaryDisclosure(tenantId, id);
  if (!existing) {
    throw new Error(`Voluntary disclosure not found: ${id}`);
  }

  const now = new Date();
  const updated: VoluntaryDisclosure = { ...existing, ...patch, updatedAt: now.toISOString() };

  await setJson(voluntaryDisclosureKey(tenantId, id), updated);
  return updated;
}
