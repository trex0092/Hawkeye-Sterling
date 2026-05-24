// Hawkeye Sterling — OECD 5-Step Due Diligence Guidance (DDG) framework store.
// Covers the five mandatory steps under OECD DDG for Responsible Supply Chains
// from Conflict-Affected and High-Risk Areas (CAHRA). Required for UAE gold
// refiners under Ministerial Decree 68/2024 and FDL 10/2025.

import { getJson, setJson, listKeys } from "./store";
import { randomBytes } from "node:crypto";

export interface OecdDdgRecord {
  id: string;           // "OECD-YYYYMMDD-xxxx"
  tenantId: string;
  reportingYear: number;
  status: "in_progress" | "completed" | "under_review";

  // Step 1: Management Systems
  step1: {
    hasWrittenPolicy: boolean;
    seniorAccountabilityDesignated: boolean;
    grievanceMechanismEstablished: boolean;
    budgetAllocated: boolean;
    completedAt?: string;
  };

  // Step 2: Risk Identification (CAHRA)
  step2: {
    supplyChainMapped: boolean;
    cahraJurisdictionsIdentified: string[];  // country codes
    redFlagsIdentified: string[];            // free text
    mineOfOriginDocumented: boolean;
    completedAt?: string;
  };

  // Step 3: Risk Response
  step3: {
    riskMitigationPlanExists: boolean;
    nonCompliantSourcesRejected: boolean;
    enhancedDdApplied: boolean;
    completedAt?: string;
  };

  // Step 4: Independent Audit
  step4: {
    auditConducted: boolean;
    auditorName?: string;
    auditDate?: string;
    auditScope?: string;
    auditFindings?: string;
    completedAt?: string;
  };

  // Step 5: Annual Report
  step5: {
    publicDisclosureMade: boolean;
    sourcingLocationsReported: boolean;
    remediationActionsReported: boolean;
    reportUrl?: string;
    completedAt?: string;
  };

  createdAt: string;
  updatedAt: string;
}

function oecdDdgKey(tenantId: string, id: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const i = id.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
  return `oecd-ddg/${t}/${i}.json`;
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex");
  return `OECD-${date}-${suffix}`;
}

function defaultStep1(): OecdDdgRecord["step1"] {
  return {
    hasWrittenPolicy: false,
    seniorAccountabilityDesignated: false,
    grievanceMechanismEstablished: false,
    budgetAllocated: false,
  };
}

function defaultStep2(): OecdDdgRecord["step2"] {
  return {
    supplyChainMapped: false,
    cahraJurisdictionsIdentified: [],
    redFlagsIdentified: [],
    mineOfOriginDocumented: false,
  };
}

function defaultStep3(): OecdDdgRecord["step3"] {
  return {
    riskMitigationPlanExists: false,
    nonCompliantSourcesRejected: false,
    enhancedDdApplied: false,
  };
}

function defaultStep4(): OecdDdgRecord["step4"] {
  return {
    auditConducted: false,
  };
}

function defaultStep5(): OecdDdgRecord["step5"] {
  return {
    publicDisclosureMade: false,
    sourcingLocationsReported: false,
    remediationActionsReported: false,
  };
}

export async function createOecdDdgRecord(
  tenantId: string,
  fields: Partial<Omit<OecdDdgRecord, "id" | "tenantId" | "status" | "createdAt" | "updatedAt">> & { reportingYear: number },
): Promise<OecdDdgRecord> {
  const now = new Date().toISOString();
  const id = generateId();
  const record: OecdDdgRecord = {
    id,
    tenantId,
    reportingYear: fields.reportingYear,
    status: "in_progress",
    step1: fields.step1 ?? defaultStep1(),
    step2: fields.step2 ?? defaultStep2(),
    step3: fields.step3 ?? defaultStep3(),
    step4: fields.step4 ?? defaultStep4(),
    step5: fields.step5 ?? defaultStep5(),
    createdAt: now,
    updatedAt: now,
  };
  await setJson(oecdDdgKey(tenantId, id), record);
  return record;
}

export async function loadOecdDdgRecord(
  tenantId: string,
  id: string,
): Promise<OecdDdgRecord | null> {
  return getJson<OecdDdgRecord>(oecdDdgKey(tenantId, id));
}

export async function loadAllOecdDdgRecords(
  tenantId: string,
): Promise<OecdDdgRecord[]> {
  const prefix = `oecd-ddg/${tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((k) => getJson<OecdDdgRecord>(k)),
  );
  return records.filter((r): r is OecdDdgRecord => r !== null);
}

export async function updateOecdDdgRecord(
  tenantId: string,
  id: string,
  patch: Partial<Omit<OecdDdgRecord, "id" | "tenantId" | "createdAt">>,
): Promise<OecdDdgRecord> {
  const existing = await loadOecdDdgRecord(tenantId, id);
  if (!existing) {
    throw new Error(`OECD DDG record not found: ${id}`);
  }
  const updated: OecdDdgRecord = {
    ...existing,
    ...patch,
    // Deep-merge steps if provided
    step1: patch.step1 ? { ...existing.step1, ...patch.step1 } : existing.step1,
    step2: patch.step2 ? { ...existing.step2, ...patch.step2 } : existing.step2,
    step3: patch.step3 ? { ...existing.step3, ...patch.step3 } : existing.step3,
    step4: patch.step4 ? { ...existing.step4, ...patch.step4 } : existing.step4,
    step5: patch.step5 ? { ...existing.step5, ...patch.step5 } : existing.step5,
    id: existing.id,
    tenantId: existing.tenantId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await setJson(oecdDdgKey(tenantId, id), updated);
  return updated;
}

/** Compute per-step completion status for progress display. */
export function getStepCompletion(
  record: OecdDdgRecord,
): { step: number; completed: number; total: number; pct: number }[] {
  const step1Bools = [
    record.step1.hasWrittenPolicy,
    record.step1.seniorAccountabilityDesignated,
    record.step1.grievanceMechanismEstablished,
    record.step1.budgetAllocated,
  ];
  const step1Done = step1Bools.filter(Boolean).length;

  const step2Bools = [
    record.step2.supplyChainMapped,
    record.step2.cahraJurisdictionsIdentified.length > 0,
    record.step2.mineOfOriginDocumented,
  ];
  const step2Done = step2Bools.filter(Boolean).length;

  const step3Bools = [
    record.step3.riskMitigationPlanExists,
    record.step3.nonCompliantSourcesRejected,
    record.step3.enhancedDdApplied,
  ];
  const step3Done = step3Bools.filter(Boolean).length;

  const step4Bools = [
    record.step4.auditConducted,
    Boolean(record.step4.auditorName),
    Boolean(record.step4.auditDate),
  ];
  const step4Done = step4Bools.filter(Boolean).length;

  const step5Bools = [
    record.step5.publicDisclosureMade,
    record.step5.sourcingLocationsReported,
    record.step5.remediationActionsReported,
  ];
  const step5Done = step5Bools.filter(Boolean).length;

  return [
    { step: 1, completed: step1Done, total: step1Bools.length, pct: Math.round((step1Done / step1Bools.length) * 100) },
    { step: 2, completed: step2Done, total: step2Bools.length, pct: Math.round((step2Done / step2Bools.length) * 100) },
    { step: 3, completed: step3Done, total: step3Bools.length, pct: Math.round((step3Done / step3Bools.length) * 100) },
    { step: 4, completed: step4Done, total: step4Bools.length, pct: Math.round((step4Done / step4Bools.length) * 100) },
    { step: 5, completed: step5Done, total: step5Bools.length, pct: Math.round((step5Done / step5Bools.length) * 100) },
  ];
}
