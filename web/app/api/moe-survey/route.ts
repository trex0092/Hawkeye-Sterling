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
  // Section 1: MLRO appointment
  mlroName: string;
  mlroQualification: string;
  mlroAppointmentDate: string;
  mlroGoAmlUserId: string;
  mlroReportsTo: string;          // "board" | "ceo" | "other"
  mlroIndependent: boolean;
  // Section 2: AML/CFT Policies
  policyApprovalDate: string;
  policyApprovedBy: string;
  policyLastReviewDate: string;
  tippingOffProcedure: boolean;
  freezeProcedure: boolean;
  cnmrProcedure: boolean;
  dpmsrProcedure: boolean;
  // Section 3: Training
  lastTrainingDate: string;
  trainingCoverage: string;       // % staff trained
  trainingTestPassRate: string;
  mlroQualificationRecord: string; // certification / course name
  // Section 4: Risk Assessment
  bwraCompletionDate: string;
  bwraApprovedBy: string;
  nraAlignment: boolean;          // aligned to 2024 NRA DPMS Medium-High
  dpmsRiskRating: string;         // entity's self-assessed overall risk
  // Section 5: goAML Filing History
  goAmlRegistrationRef: string;
  lastStrFilingDate: string;
  lastSarFilingDate: string;
  lastDpmsrFilingDate: string;
  strCountLast12m: string;
  dpmsrCountLast12m: string;
  // Section 6: Sanctions Screening Tools
  screeningToolName: string;
  screeningLists: string[];        // lists screened against
  nasRegistered: boolean;
  arsRegistered: boolean;
  screeningFrequency: string;      // "daily" | "transaction" | "other"
  // Section 7: AI Tool Governance
  aiToolsUsed: boolean;
  aiToolNames: string;
  aiGovernancePolicyExists: boolean;
  aiGovernancePolicyDate: string;
  aiInventoryDocumentExists: boolean;
  aiModelCardsExist: boolean;
  humanOversightDemonstrable: boolean;
  cbueaNotified: boolean;
  sections: MoeSurveySection[];
}

const DEFAULT_STATE: Omit<MoeSurveyState, "tenant" | "updatedAt"> = {
  mlroName: "", mlroQualification: "", mlroAppointmentDate: "", mlroGoAmlUserId: "", mlroReportsTo: "board", mlroIndependent: false,
  policyApprovalDate: "", policyApprovedBy: "", policyLastReviewDate: "", tippingOffProcedure: false, freezeProcedure: false, cnmrProcedure: false, dpmsrProcedure: false,
  lastTrainingDate: "", trainingCoverage: "", trainingTestPassRate: "", mlroQualificationRecord: "",
  bwraCompletionDate: "", bwraApprovedBy: "", nraAlignment: false, dpmsRiskRating: "",
  goAmlRegistrationRef: "", lastStrFilingDate: "", lastSarFilingDate: "", lastDpmsrFilingDate: "", strCountLast12m: "", dpmsrCountLast12m: "",
  screeningToolName: "Hawkeye Sterling", screeningLists: ["UAE Local Terrorist List", "UN Consolidated List", "OFAC SDN", "EU FSF", "UK OFSI"], nasRegistered: false, arsRegistered: false, screeningFrequency: "transaction",
  aiToolsUsed: true, aiToolNames: "Hawkeye Sterling AI screening engine", aiGovernancePolicyExists: false, aiGovernancePolicyDate: "", aiInventoryDocumentExists: false, aiModelCardsExist: false, humanOversightDemonstrable: false, cbueaNotified: false,
  sections: [
    { id: "mlro", completed: false },
    { id: "policies", completed: false },
    { id: "training", completed: false },
    { id: "risk-assessment", completed: false },
    { id: "goaml", completed: false },
    { id: "screening", completed: false },
    { id: "ai-governance", completed: false },
  ],
};

const STORE = "hawkeye-moe-survey";

async function loadState(tenant: string): Promise<MoeSurveyState> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(tenant, { type: "text" });
    if (raw) return JSON.parse(raw) as MoeSurveyState;
  } catch { /* local dev */ }
  return { ...DEFAULT_STATE, tenant, updatedAt: new Date().toISOString() };
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
