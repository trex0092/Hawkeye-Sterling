import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GET  /api/responsible-sourcing — load 5-step workflow state
// POST /api/responsible-sourcing — save workflow state
//
// Ministerial Decree 68/2024 mandates that UAE gold refiners follow the
// OECD 5-Step Due Diligence Guidance for Responsible Supply Chains of
// Minerals from Conflict-Affected and High-Risk Areas (DDG). Each step must
// produce documented evidence. This API stores the structured workflow.

export interface OecdStepEvidence {
  stepId: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  boardApprovedAt?: string;
  evidenceNotes: string;
  documentRefs: string[];  // internal document references
  gaps: string[];          // identified gaps in this step
}

export interface ResponsibleSourcingState {
  tenant: string;
  updatedAt: string;
  entityName: string;
  reportingYear: string;
  // Step 1: Management Systems
  step1: OecdStepEvidence & {
    supplyChainPolicyExists: boolean;
    supplyChainPolicyDate: string;
    grievanceMechanismExists: boolean;
    grievanceMechanismType: string;    // "hotline" | "email" | "committee" | "other"
    contractualProvisions: boolean;    // provisions in supplier contracts
    internalAuditProcedure: boolean;
    recordKeepingPeriodYears: number;
  };
  // Step 2: Risk Identification
  step2: OecdStepEvidence & {
    supplyChainMapped: boolean;
    cahraCountries: string[];          // ISO-2 country codes identified as CAHRA
    smeltersIdentified: number;
    smeltersRmapConformant: number;
    redFlagsIdentified: string[];
    sourceCountries: string[];
  };
  // Step 3: Risk Mitigation
  step3: OecdStepEvidence & {
    mitigationStrategyExists: boolean;
    supplierEngagementRecords: boolean;
    cahraSuppliersSuspended: string[];  // suspended supplier names
    escalatedToSeniorMgmt: boolean;
    escalationDate?: string;
    thirdPartyAuditsRequired: boolean;
  };
  // Step 4: Third-Party Audit
  step4: OecdStepEvidence & {
    auditConducted: boolean;
    auditDate?: string;
    auditorName: string;
    auditorAccreditation: string;      // "RMAP" | "LBMA" | "other"
    auditScope: string;
    auditOutcome: "conformant" | "active" | "suspended" | "pending" | "";
    criticalFindingsCount: number;
    criticalFindingsResolved: boolean;
  };
  // Step 5: Annual Report
  step5: OecdStepEvidence & {
    reportPublished: boolean;
    reportPublishedAt?: string;
    reportUrl?: string;
    regulatorySubmission: boolean;
    regulatorySubmissionDate?: string;
    submittedTo: string[];             // "MoE" | "DMCC" | "CBUAE" etc.
    disclosureScope: string;           // "public" | "regulatory" | "internal"
  };
  overallStatus: "not-started" | "in-progress" | "complete" | "needs-review";
  lastReviewDate?: string;
}

const STORE = "hawkeye-responsible-sourcing";

function computeOverallStatus(state: Partial<ResponsibleSourcingState>): ResponsibleSourcingState["overallStatus"] {
  const steps = [state.step1, state.step2, state.step3, state.step4, state.step5];
  const completed = steps.filter((s) => s?.completed).length;
  if (completed === 0) return "not-started";
  if (completed === 5) return "complete";
  return "in-progress";
}

async function loadState(tenant: string): Promise<ResponsibleSourcingState> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(tenant, { type: "text" });
    if (raw) return JSON.parse(raw) as ResponsibleSourcingState;
  } catch { /* local dev */ }

  const defaultStep = (id: 1 | 2 | 3 | 4 | 5): OecdStepEvidence => ({
    stepId: id, completed: false, evidenceNotes: "", documentRefs: [], gaps: [],
  });

  return {
    tenant,
    updatedAt: new Date().toISOString(),
    entityName: "",
    reportingYear: new Date().getFullYear().toString(),
    step1: { ...defaultStep(1), supplyChainPolicyExists: false, supplyChainPolicyDate: "", grievanceMechanismExists: false, grievanceMechanismType: "", contractualProvisions: false, internalAuditProcedure: false, recordKeepingPeriodYears: 10 },
    step2: { ...defaultStep(2), supplyChainMapped: false, cahraCountries: [], smeltersIdentified: 0, smeltersRmapConformant: 0, redFlagsIdentified: [], sourceCountries: [] },
    step3: { ...defaultStep(3), mitigationStrategyExists: false, supplierEngagementRecords: false, cahraSuppliersSuspended: [], escalatedToSeniorMgmt: false, thirdPartyAuditsRequired: false },
    step4: { ...defaultStep(4), auditConducted: false, auditorName: "", auditorAccreditation: "", auditScope: "", auditOutcome: "", criticalFindingsCount: 0, criticalFindingsResolved: false },
    step5: { ...defaultStep(5), reportPublished: false, regulatorySubmission: false, submittedTo: [], disclosureScope: "regulatory" },
    overallStatus: "not-started",
  };
}

async function saveState(tenant: string, state: ResponsibleSourcingState): Promise<void> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.set(tenant, JSON.stringify(state));
  } catch { /* local dev */ }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);
  const state = await loadState(tenant);
  return NextResponse.json({ ok: true, workflow: state }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: Partial<ResponsibleSourcingState>;
  try { body = (await req.json()) as Partial<ResponsibleSourcingState>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const existing = await loadState(tenant);
  const updated: ResponsibleSourcingState = {
    ...existing,
    ...body,
    tenant,
    updatedAt: new Date().toISOString(),
  };
  updated.overallStatus = computeOverallStatus(updated);
  await saveState(tenant, updated);
  return NextResponse.json({ ok: true, workflow: updated }, { headers: gate.headers });
}
