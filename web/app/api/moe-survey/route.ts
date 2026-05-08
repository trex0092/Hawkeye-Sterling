import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GET  /api/moe-survey — load saved survey state
// POST /api/moe-survey — save survey state
//
// The UAE Ministry of Economy launched a Mandatory AML/CFT Survey (2026) for all
// mainland DNFBPs including DPMS dealers. Non-submission triggers immediate
// on-site inspection. This API stores the operator's responses.

export interface MoeSurveySection {
  id: string;
  completed: boolean;
  completedAt?: string;
}

export interface MoeSurveyState {
  tenant: string;
  updatedAt: string;

  // Section 1: Business Profile & Licensing
  dpmsLicenseNumber: string;
  dpmsLicenseExpiry: string;
  businessActivityType: string;       // "retailer" | "wholesaler" | "manufacturer" | "broker" | "multiple"
  productTypesGold: boolean;
  productTypesDiamonds: boolean;
  productTypesPreciousStones: boolean;
  productTypesPearls: boolean;
  productTypesPreciousMetals: boolean;
  transactionChannelCash: boolean;
  transactionChannelBankTransfer: boolean;
  transactionChannelOnline: boolean;
  transactionChannelExportImport: boolean;
  numberOfEmployees: string;
  numberOfBranches: string;
  annualTransactionVolumeAed: string;
  importExportActivity: boolean;
  freeZoneActivity: boolean;

  // Section 2: MLRO Appointment
  mlroName: string;
  mlroQualification: string;
  mlroAppointmentDate: string;
  mlroGoAmlUserId: string;
  mlroReportsTo: string;              // "board" | "ceo" | "other"
  mlroIndependent: boolean;
  mlroDeputyName: string;

  // Section 3: AML/CFT Policies
  policyApprovalDate: string;
  policyApprovedBy: string;
  policyLastReviewDate: string;
  tippingOffProcedure: boolean;
  freezeProcedure: boolean;
  cnmrProcedure: boolean;
  dpmsrProcedure: boolean;
  cddThresholdStandard: string;       // AED amount triggering standard CDD
  eddTriggerDescription: string;      // what triggers EDD
  boVerificationProcedure: boolean;
  recordRetention5Year: boolean;

  // Section 4: Training Logs
  lastTrainingDate: string;
  trainingCoverage: string;
  trainingTestPassRate: string;
  mlroQualificationRecord: string;
  seniorMgmtTrainingDate: string;

  // Section 5: Risk Assessment (ML/TF)
  bwraCompletionDate: string;
  bwraApprovedBy: string;
  nraAlignment: boolean;
  dpmsRiskRating: string;

  // Section 6: Proliferation Financing Risk Assessment
  pfRiskAssessmentDate: string;
  pfRiskAssessmentApprovedBy: string;
  pfRiskRating: string;               // "low" | "medium" | "high"
  pfTfsScreeningConfirmed: boolean;
  unscr1718Compliance: boolean;
  unscr1737Compliance: boolean;
  unscr2231Compliance: boolean;
  eocnRegistrationStatus: string;     // "registered" | "not-required" | "pending"

  // Section 7: Transaction Monitoring
  txMonitoringProcedureExists: boolean;
  txMonitoringType: string;           // "manual" | "automated" | "hybrid"
  redFlagListUpdatedDate: string;
  mlroEscalationThresholdAed: string;
  cashTransactionLogMaintained: boolean;
  internalUtrCountLast12m: string;
  averageTransactionValueAed: string;

  // Section 8: goAML Filing History
  goAmlRegistrationRef: string;
  goAmlAccountStatus: string;         // "active" | "suspended" | "pending"
  lastStrFilingDate: string;
  lastSarFilingDate: string;
  lastDpmsrFilingDate: string;
  strCountLast12m: string;
  sarCountLast12m: string;
  dpmsrCountLast12m: string;

  // Section 9: Sanctions Screening
  screeningToolName: string;
  screeningLists: string[];
  nasRegistered: boolean;
  arsRegistered: boolean;
  screeningFrequency: string;         // "daily" | "transaction" | "other"
  existingCustomerRescreeningFrequency: string; // "realtime" | "daily" | "monthly" | "quarterly"
  freezeTurnaroundHours: string;
  sanctionsHitsLast12m: string;
  uaeLocalListConfirmed: boolean;

  // Section 10: Internal Audit & Independent Review
  lastAmlAuditDate: string;
  auditConductedBy: string;           // "internal" | "external" | "consultant"
  auditRating: string;                // "satisfactory" | "needs-improvement" | "unsatisfactory"
  openRemediationItems: string;
  boardAuditReviewDate: string;

  // Section 11: Senior Management Governance
  uboName: string;
  uboTitle: string;
  boardSignOffDate: string;
  boardSignOffBy: string;
  amlReportingFrequency: string;      // "monthly" | "quarterly" | "annually"
  whistleblowerChannelExists: boolean;

  // Section 12: AI Tool Governance
  aiToolsUsed: boolean;
  aiToolNames: string;
  aiGovernancePolicyExists: boolean;
  aiGovernancePolicyDate: string;
  aiInventoryDocumentExists: boolean;
  aiModelCardsExist: boolean;
  humanOversightDemonstrable: boolean;
  cbueaNotified: boolean;

  // Section 13: Previous MoE Inspections & Regulatory History
  previousInspectionDate: string;
  previousInspectionOutcome: string;  // "satisfactory" | "needs-improvement" | "enforcement" | "none"
  enforcementActionsLast3Years: boolean;
  enforcementActionsDetails: string;
  previousSurveySubmitted: boolean;
  moeCircularAcknowledged: boolean;

  sections: MoeSurveySection[];
}

const DEFAULT_STATE: Omit<MoeSurveyState, "tenant" | "updatedAt"> = {
  // Section 1
  dpmsLicenseNumber: "", dpmsLicenseExpiry: "", businessActivityType: "",
  productTypesGold: false, productTypesDiamonds: false, productTypesPreciousStones: false, productTypesPearls: false, productTypesPreciousMetals: false,
  transactionChannelCash: false, transactionChannelBankTransfer: false, transactionChannelOnline: false, transactionChannelExportImport: false,
  numberOfEmployees: "", numberOfBranches: "", annualTransactionVolumeAed: "", importExportActivity: false, freeZoneActivity: false,
  // Section 2
  mlroName: "", mlroQualification: "", mlroAppointmentDate: "", mlroGoAmlUserId: "", mlroReportsTo: "board", mlroIndependent: false, mlroDeputyName: "",
  // Section 3
  policyApprovalDate: "", policyApprovedBy: "", policyLastReviewDate: "", tippingOffProcedure: false, freezeProcedure: false, cnmrProcedure: false, dpmsrProcedure: false,
  cddThresholdStandard: "", eddTriggerDescription: "", boVerificationProcedure: false, recordRetention5Year: false,
  // Section 4
  lastTrainingDate: "", trainingCoverage: "", trainingTestPassRate: "", mlroQualificationRecord: "", seniorMgmtTrainingDate: "",
  // Section 5
  bwraCompletionDate: "", bwraApprovedBy: "", nraAlignment: false, dpmsRiskRating: "",
  // Section 6
  pfRiskAssessmentDate: "", pfRiskAssessmentApprovedBy: "", pfRiskRating: "", pfTfsScreeningConfirmed: false,
  unscr1718Compliance: false, unscr1737Compliance: false, unscr2231Compliance: false, eocnRegistrationStatus: "",
  // Section 7
  txMonitoringProcedureExists: false, txMonitoringType: "", redFlagListUpdatedDate: "", mlroEscalationThresholdAed: "",
  cashTransactionLogMaintained: false, internalUtrCountLast12m: "", averageTransactionValueAed: "",
  // Section 8
  goAmlRegistrationRef: "", goAmlAccountStatus: "active", lastStrFilingDate: "", lastSarFilingDate: "", lastDpmsrFilingDate: "",
  strCountLast12m: "", sarCountLast12m: "", dpmsrCountLast12m: "",
  // Section 9
  screeningToolName: "Hawkeye Sterling", screeningLists: ["UAE Local Terrorist List", "UN Consolidated List", "OFAC SDN", "EU FSF", "UK OFSI"],
  nasRegistered: false, arsRegistered: false, screeningFrequency: "transaction",
  existingCustomerRescreeningFrequency: "realtime", freezeTurnaroundHours: "", sanctionsHitsLast12m: "", uaeLocalListConfirmed: false,
  // Section 10
  lastAmlAuditDate: "", auditConductedBy: "", auditRating: "", openRemediationItems: "", boardAuditReviewDate: "",
  // Section 11
  uboName: "", uboTitle: "", boardSignOffDate: "", boardSignOffBy: "", amlReportingFrequency: "quarterly", whistleblowerChannelExists: false,
  // Section 12
  aiToolsUsed: true, aiToolNames: "Hawkeye Sterling AI screening engine", aiGovernancePolicyExists: false, aiGovernancePolicyDate: "",
  aiInventoryDocumentExists: false, aiModelCardsExist: false, humanOversightDemonstrable: false, cbueaNotified: false,
  // Section 13
  previousInspectionDate: "", previousInspectionOutcome: "none", enforcementActionsLast3Years: false, enforcementActionsDetails: "",
  previousSurveySubmitted: false, moeCircularAcknowledged: false,
  sections: [
    { id: "business-profile", completed: false },
    { id: "mlro", completed: false },
    { id: "policies", completed: false },
    { id: "training", completed: false },
    { id: "risk-assessment", completed: false },
    { id: "pf-risk", completed: false },
    { id: "tx-monitoring", completed: false },
    { id: "goaml", completed: false },
    { id: "screening", completed: false },
    { id: "internal-audit", completed: false },
    { id: "senior-mgmt", completed: false },
    { id: "ai-governance", completed: false },
    { id: "inspections", completed: false },
  ],
};

const STORE = "hawkeye-moe-survey";

async function loadState(tenant: string): Promise<MoeSurveyState> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(tenant, { type: "text" });
    if (raw) {
      const saved = JSON.parse(raw) as MoeSurveyState;
      // Merge with defaults so new fields are populated for existing tenants
      return { ...DEFAULT_STATE, ...saved, tenant, sections: mergedSections(saved.sections) };
    }
  } catch { /* local dev */ }
  return { ...DEFAULT_STATE, tenant, updatedAt: new Date().toISOString() };
}

function mergedSections(saved: MoeSurveySection[]): MoeSurveySection[] {
  const defaults = DEFAULT_STATE.sections;
  return defaults.map((d) => saved.find((s) => s.id === d.id) ?? d);
}

async function saveState(tenant: string, state: MoeSurveyState): Promise<void> {
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
  return NextResponse.json({ ok: true, survey: state }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: Partial<MoeSurveyState>;
  try { body = (await req.json()) as Partial<MoeSurveyState>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const existing = await loadState(tenant);
  const updated: MoeSurveyState = { ...existing, ...body, tenant, updatedAt: new Date().toISOString() };
  await saveState(tenant, updated);
  return NextResponse.json({ ok: true, survey: updated }, { headers: gate.headers });
}
