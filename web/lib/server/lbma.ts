// Hawkeye Sterling — LBMA Responsible Gold Guidance V9 questionnaire store.
// Covers the 8 sections of the annual LBMA RGG V9 questionnaire submitted by
// refiners on the LBMA Good Delivery List. Each record is tenant-scoped and
// stored as a single JSON blob per questionnaire.

import { getJson, setJson, listKeys } from "./store";
import { randomBytes } from "node:crypto";

export interface LbmaQuestionnaire {
  id: string;              // "LBMA-YYYYMMDD-xxxx"
  tenantId: string;
  reportingYear: number;   // e.g. 2025
  status: "draft" | "submitted" | "approved";

  // Section 1: AML/CFT Policy
  hasAmlPolicy: boolean;
  amlPolicyLastReviewed?: string;  // ISO date

  // Section 2: Refiner/Counterparty Identity
  counterpartyName: string;
  counterpartyCountry: string;
  counterpartyType: "refiner" | "supplier" | "dealer" | "other";
  isGdlListed: boolean;        // LBMA Good Delivery List

  // Section 3: Government Watchlist Results
  watchlistScreeningDate?: string;  // ISO date
  watchlistResult: "clear" | "hit" | "pending" | "not_done";
  watchlistScreeningRef?: string;   // reference to screening result

  // Section 4: CAHRA Classification
  cahraSourcing: boolean;       // does supply chain touch CAHRA?
  cahraJurisdictions?: string[]; // list of CAHRA countries

  // Section 5: Supply Chain Counterparties
  supplyChainVerified: boolean;
  supplyChainDepth?: number;    // how many tiers verified

  // Section 6: Ongoing Monitoring
  ongoingMonitoringFrequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";

  // Section 7: Independent Audit
  lastAuditDate?: string;       // ISO date
  auditorName?: string;
  auditFindings?: "compliant" | "minor_findings" | "major_findings" | "non_compliant";

  // Section 8: Annual Declaration
  declarationSubmitted: boolean;
  declarationDate?: string;     // ISO date
  declarationSignedBy?: string; // MLRO/compliance officer name

  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export function lbmaKey(tenantId: string, id: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const i = id.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
  return `lbma/${t}/${i}.json`;
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex");
  return `LBMA-${date}-${suffix}`;
}

export async function createLbmaRecord(
  tenantId: string,
  fields: Omit<LbmaQuestionnaire, "id" | "tenantId" | "status" | "createdAt" | "updatedAt">,
): Promise<LbmaQuestionnaire> {
  const now = new Date().toISOString();
  const id = generateId();
  const record: LbmaQuestionnaire = {
    id,
    tenantId,
    status: "draft",
    ...fields,
    createdAt: now,
    updatedAt: now,
  };
  await setJson(lbmaKey(tenantId, id), record);
  return record;
}

export async function loadLbmaRecord(
  tenantId: string,
  id: string,
): Promise<LbmaQuestionnaire | null> {
  return getJson<LbmaQuestionnaire>(lbmaKey(tenantId, id));
}

export async function loadAllLbmaRecords(
  tenantId: string,
): Promise<LbmaQuestionnaire[]> {
  const prefix = `lbma/${tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((k) => getJson<LbmaQuestionnaire>(k)),
  );
  return records.filter((r): r is LbmaQuestionnaire => r !== null);
}

export async function updateLbmaRecord(
  tenantId: string,
  id: string,
  patch: Partial<Omit<LbmaQuestionnaire, "id" | "tenantId" | "createdAt">>,
): Promise<LbmaQuestionnaire> {
  const existing = await loadLbmaRecord(tenantId, id);
  if (!existing) {
    throw new Error(`LBMA record not found: ${id}`);
  }
  const updated: LbmaQuestionnaire = {
    ...existing,
    ...patch,
    id: existing.id,
    tenantId: existing.tenantId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await setJson(lbmaKey(tenantId, id), updated);
  return updated;
}
