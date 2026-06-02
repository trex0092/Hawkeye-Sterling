// GET /api/governance/rmf-status
//
// Returns NIST AI RMF scorecard (GOVERN/MAP/MEASURE/MANAGE) per model
// plus MITRE ATLAS probe coverage heatmap.
// Used by the GovernanceSection in intelligence-hub.

import { NextResponse, type NextRequest } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  MODEL_REGISTRY,
  computeAttestationStatus,
  GOVERNANCE_POLICY,
  getOverdueModels,
} from "@/lib/server/ai-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── NIST AI RMF ───────────────────────────────────────────────────────────────

export interface RmfFunctionScore {
  fn: "GOVERN" | "MAP" | "MEASURE" | "MANAGE";
  label: string;
  score: number;   // 0–100
  status: "green" | "amber" | "red";
  controls: string[];
  gaps: string[];
}

export interface ModelRmfRow {
  purpose: string;
  modelId: string;
  riskTier: string;
  attestationStatus: "current" | "due" | "overdue";
  nextAttestationDue: string;
  approvedBy: string;
  humanReviewRequired: boolean;
  redTeamLastRunAt: string | null;
}

// ── MITRE ATLAS ───────────────────────────────────────────────────────────────

export interface AtlasTactic {
  id: string;
  name: string;
  phase: string;
  probeIds: string[];    // probe IDs covering this tactic
  covered: boolean;
}

export interface RmfStatusResponse {
  ok: boolean;
  generatedAt: string;
  tenantId: string;
  overallRmfScore: number;
  rmfFunctions: RmfFunctionScore[];
  models: ModelRmfRow[];
  overdueCount: number;
  atlasTactics: AtlasTactic[];
  atlasGapCount: number;
  policyVersion: string;
  policyAttestation: string;
}

// ── NIST AI RMF controls implemented in Hawkeye Sterling ─────────────────────

function computeRmfFunctions(): RmfFunctionScore[] {
  const overdue = getOverdueModels();

  const govern: RmfFunctionScore = {
    fn: "GOVERN",
    label: "Governance & Accountability",
    score: overdue.length === 0 ? 92 : 70,
    status: overdue.length === 0 ? "green" : "amber",
    controls: [
      "MODEL_REGISTRY with riskTier + approval + cardRef for every model",
      "GOVERNANCE_POLICY with 7 principles + 5 prohibitions",
      "Quarterly review cycle tracked in reviewCycle field",
      "FDL No.10/2025 Art.18 demonstrable human oversight",
    ],
    gaps: overdue.length > 0
      ? [`${overdue.length} model(s) with overdue attestation`]
      : [],
  };

  const map: RmfFunctionScore = {
    fn: "MAP",
    label: "Risk Context Mapping",
    score: 88,
    status: "green",
    controls: [
      "System prompt P1–P10 prohibitions enumerate AI risk context",
      "PII masking before LLM transmission (data minimisation)",
      "Each MODEL_REGISTRY entry lists dataReceived and constraints",
      "UAE FDL + FATF regulatory anchors documented per model",
    ],
    gaps: [],
  };

  const measure: RmfFunctionScore = {
    fn: "MEASURE",
    label: "Risk Measurement & Testing",
    score: 85,
    status: "green",
    controls: [
      "24 adversarial probes across 10 MITRE ATLAS categories",
      "Eval harness: 50 scenarios in src/brain/registry/eval-harness.ts",
      "Bias monitor: biasRatio ≤ 1.15 (tighter than FATF floor 1.5)",
      "Drift monitor: tracks model response distribution shift",
      "Prompt hash manifest validated in CI (FDL 10/2025 Art.18)",
    ],
    gaps: [
      "AML.TA0001 Reconnaissance — no probe coverage yet",
      "AML.T0048 Adversarial ML examples — no perturbed name-matching probe",
    ],
  };

  const manage: RmfFunctionScore = {
    fn: "MANAGE",
    label: "Risk Response & Recovery",
    score: 80,
    status: overdue.length === 0 ? "green" : "amber",
    controls: [
      "Circuit breaker auto-triggers on consecutive LLM failures",
      "Rule-based fallback when AI is unavailable (fail-closed)",
      "Incident runbook documented in docs/INCIDENT-RECOVERY.md",
      "Four-eyes gate for STR filing (TOCTOU-protected)",
      "Egress tipping-off gate: held_review on any error path",
    ],
    gaps: [
      "CG-3 periodic re-screening: cadences implemented, enrollment pending",
      "CG-6 audit chain 10-yr retention: S3/WORM backup pending operator config",
    ],
  };

  return [govern, map, measure, manage];
}

// ── MITRE ATLAS tactic/probe coverage ─────────────────────────────────────────

const ATLAS_TACTICS: Omit<AtlasTactic, "covered">[] = [
  { id: "AML.TA0001", name: "Reconnaissance",        phase: "Pre-ML",   probeIds: [] },
  { id: "AML.TA0002", name: "Resource Development",  phase: "Pre-ML",   probeIds: [] },
  { id: "AML.TA0003", name: "Initial Access",        phase: "Attack",   probeIds: ["PI-001","PI-002","PI-003","SC-001","SC-002"] },
  { id: "AML.TA0004", name: "ML Attack Staging",     phase: "Attack",   probeIds: ["SE-001","SE-002","SE-003"] },
  { id: "AML.TA0005", name: "Model Access",          phase: "Attack",   probeIds: ["AI-ATK-001"] },
  { id: "AML.TA0006", name: "Discovery",             phase: "Attack",   probeIds: ["AI-ATK-001","DATA-002"] },
  { id: "AML.TA0007", name: "Collection",            phase: "Attack",   probeIds: ["DATA-001","DATA-002"] },
  { id: "AML.TA0008", name: "ML Model Access",       phase: "Attack",   probeIds: ["AI-ATK-002","JB-001","JB-002"] },
  { id: "AML.TA0009", name: "Exfiltration",          phase: "Impact",   probeIds: ["PII-001","PII-002","PII-003","PII-004","DATA-001"] },
  { id: "AML.TA0010", name: "Impact",                phase: "Impact",   probeIds: ["HL-001","HL-002","CV-001","CV-002","GOV-001","GOV-002"] },
];

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  void writeAuditChainEntry({ event: "rmf_status_viewed", actor: gate.sub ?? "api" }, tenantId).catch(() => {});

  const rmfFunctions = computeRmfFunctions();
  const overallRmfScore = Math.round(
    rmfFunctions.reduce((s, f) => s + f.score, 0) / rmfFunctions.length
  );

  const models: ModelRmfRow[] = MODEL_REGISTRY.map((m) => ({
    purpose: m.purpose,
    modelId: m.modelId,
    riskTier: m.riskTier,
    attestationStatus: computeAttestationStatus(m.approval.nextAttestationDue),
    nextAttestationDue: m.approval.nextAttestationDue,
    approvedBy: m.approval.approvedBy,
    humanReviewRequired: m.humanReviewRequired,
    redTeamLastRunAt: m.redTeamLastRunAt ?? null,
  }));

  const atlasTactics: AtlasTactic[] = ATLAS_TACTICS.map((t) => ({
    ...t,
    covered: t.probeIds.length > 0,
  }));

  const body: RmfStatusResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantId,
    overallRmfScore,
    rmfFunctions,
    models,
    overdueCount: getOverdueModels().length,
    atlasTactics,
    atlasGapCount: atlasTactics.filter((t) => !t.covered).length,
    policyVersion: GOVERNANCE_POLICY.policyVersion,
    policyAttestation: GOVERNANCE_POLICY.attestation,
  };

  return NextResponse.json(body, { headers: gate.headers });
}
