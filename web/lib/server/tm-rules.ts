// TM Rule Change Management store — CBUAE AML/CFT Guidelines §7
//
// Provides CRUD operations for transaction monitoring rule change records.
// All TM rule changes require MLRO sign-off before deployment.
//
// Regulatory basis: CBUAE AML/CFT Guidelines §7, CBUAE Transaction Monitoring Framework

import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface TmRuleChange {
  id: string;                // "TMR-YYYYMMDD-xxxx"
  tenantId: string;
  ruleName: string;
  ruleType: "threshold" | "new_rule" | "modification" | "retirement";
  currentValue?: string;     // current threshold/config
  proposedValue: string;     // proposed change
  rationale: string;         // why this change is needed
  proposedBy: string;        // staff member
  proposedDate: string;      // ISO date
  status: "proposed" | "testing" | "pending_approval" | "approved" | "deployed" | "rejected";
  testResults?: string;      // results of test/UAT
  testDate?: string;
  expectedImpact: string;    // expected effect on alert volume / FP rate
  mlroApproved?: boolean;
  mlroApprovalDate?: string;
  mlroComments?: string;
  deployedDate?: string;
  deployedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type TmRuleChangeCreateFields = Pick<
  TmRuleChange,
  | "ruleName"
  | "ruleType"
  | "proposedValue"
  | "rationale"
  | "proposedBy"
  | "expectedImpact"
> & {
  currentValue?: string;
};

export type TmRuleChangePatch = Partial<
  Omit<TmRuleChange, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function tmRuleChangeKey(tenantId: string, id: string): string {
  return `tm-rule-changes/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function generateTmrId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TMR-${yyyymmdd}-${suffix}`;
}

export async function createTmRuleChange(
  tenantId: string,
  fields: TmRuleChangeCreateFields,
): Promise<TmRuleChange> {
  const now = new Date();
  const id = generateTmrId();

  const record: TmRuleChange = {
    id,
    tenantId,
    ruleName: fields.ruleName,
    ruleType: fields.ruleType,
    proposedValue: fields.proposedValue,
    rationale: fields.rationale,
    proposedBy: fields.proposedBy,
    proposedDate: now.toISOString().slice(0, 10),
    status: "proposed",
    expectedImpact: fields.expectedImpact,
    ...(fields.currentValue ? { currentValue: fields.currentValue } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await setJson(tmRuleChangeKey(tenantId, id), record);

  return record;
}

export async function loadTmRuleChange(
  tenantId: string,
  id: string,
): Promise<TmRuleChange | null> {
  return getJson<TmRuleChange>(tmRuleChangeKey(tenantId, id));
}

export async function loadAllTmRuleChanges(tenantId: string): Promise<TmRuleChange[]> {
  const prefix = `tm-rule-changes/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<TmRuleChange>(key)),
  );
  return records.filter((r): r is TmRuleChange => r !== null);
}

export async function updateTmRuleChange(
  tenantId: string,
  id: string,
  patch: TmRuleChangePatch,
): Promise<TmRuleChange> {
  const existing = await loadTmRuleChange(tenantId, id);
  if (!existing) {
    throw new Error(`TM rule change not found: ${id}`);
  }

  const now = new Date();
  const updated: TmRuleChange = {
    ...existing,
    ...patch,
    updatedAt: now.toISOString(),
  };

  await setJson(tmRuleChangeKey(tenantId, id), updated);
  return updated;
}
