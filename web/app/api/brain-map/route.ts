// GET /api/brain-map
//
// Returns the Hawkeye Sterling brain faculty structure for the
// auditor knowledge graph — faculty names, purposes, file counts,
// and key component names for each of the 15 faculties.

import { NextResponse, type NextRequest } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface BrainFaculty {
  id: string;
  name: string;
  purpose: string;
  category: "screening" | "intelligence" | "governance" | "analysis" | "audit" | "media" | "crypto" | "modes";
  fileCount: number;
  keyComponents: string[];
  regulatoryAnchors: string[];
  color: string;
}

export interface BrainMapResponse {
  ok: boolean;
  generatedAt: string;
  tenantId: string;
  totalFiles: number;
  faculties: BrainFaculty[];
  connections: { from: string; to: string; label: string }[];
}

const FACULTIES: BrainFaculty[] = [
  {
    id: "sanctions-orchestrator",
    name: "Sanctions Orchestrator",
    purpose: "Coordinates sanctions list screening across UN, OFAC, EU, UK lists",
    category: "screening",
    fileCount: 18,
    keyComponents: ["SanctionsOrchestrator", "SanctionsDeltaEngine", "SanctionsEntity"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18", "FATF R.6", "Cabinet Decision 74/2020"],
    color: "#D20055",
  },
  {
    id: "entity-resolution",
    name: "Entity Resolution",
    purpose: "Disambiguates subject identities across name variants, aliases, and transliterations",
    category: "screening",
    fileCount: 14,
    keyComponents: ["EntityResolutionPipeline", "SearchReasoning", "PhoneticMatcher", "ArabicNormalizer"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18", "FATF R.10"],
    color: "#9333ea",
  },
  {
    id: "adverse-media",
    name: "Adverse Media NLP",
    purpose: "22-language adverse media classification and article grouping",
    category: "media",
    fileCount: 22,
    keyComponents: ["AdverseMediaNLP", "ArticleGroupingEngine", "MediaIngestionService", "SourceReliabilityEngine"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18", "FATF R.12"],
    color: "#0ea5e9",
  },
  {
    id: "relationship-intelligence",
    name: "Relationship Intelligence",
    purpose: "Maps beneficial ownership, corporate structures, and network connections",
    category: "intelligence",
    fileCount: 16,
    keyComponents: ["RelationshipIntelligence", "NetworkGraphBuilder", "UboChainAnalyzer"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18", "FATF R.10 UBO"],
    color: "#f59e0b",
  },
  {
    id: "risk-scoring",
    name: "Risk Policy Engine",
    purpose: "Contextual risk scoring with explainable primary drivers",
    category: "analysis",
    fileCount: 20,
    keyComponents: ["ContextualScoringEngine", "RiskPolicyEngine", "ContradictionAnalyzer", "EvidenceValidator"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025", "FATF R.1 Risk-Based Approach"],
    color: "#10b981",
  },
  {
    id: "decision-governance",
    name: "Decision Governance",
    purpose: "MLRO disposition workflow, four-eyes gate, and escalation engine",
    category: "governance",
    fileCount: 12,
    keyComponents: ["DecisionGovernance", "EscalationEngine", "PolicyGuardrails"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.16", "FATF R.20 STR"],
    color: "#ef4444",
  },
  {
    id: "audit-ledger",
    name: "Audit Ledger",
    purpose: "Append-only HMAC-SHA256 audit chain for every AI decision and screening result",
    category: "audit",
    fileCount: 10,
    keyComponents: ["AuditLedger", "EvidenceSigner", "ReplayEngine"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18 AI audit trail", "SOC2 CC7.4"],
    color: "#6366f1",
  },
  {
    id: "crypto-risk",
    name: "Crypto & Cybercrime",
    purpose: "Blockchain address risk scoring, mixer detection, cybercrime typology classification",
    category: "crypto",
    fileCount: 8,
    keyComponents: ["CybercrimeClassifier", "CryptoRiskScorer", "MixerDetector"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025", "FATF R.15 Virtual Assets"],
    color: "#f97316",
  },
  {
    id: "typology-engine",
    name: "Typology Engine",
    purpose: "158 WAVE3/WAVE4 typology modes for ML pattern matching against known ML/TF patterns",
    category: "modes",
    fileCount: 158,
    keyComponents: ["TypologyMatchEngine", "WaveTypologyBatch", "DpmsTypologies"],
    regulatoryAnchors: ["FATF Typologies Report", "Federal Decree-Law No. 10 of 2025"],
    color: "#14b8a6",
  },
  {
    id: "adversarial-probes",
    name: "Adversarial Red-Team",
    purpose: "24 probes across 10 MITRE ATLAS categories for continuous AI safety testing",
    category: "governance",
    fileCount: 6,
    keyComponents: ["AdversarialProbes", "EvalHarness", "RefusalRouter"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18", "NIST AI RMF MEASURE-2.7"],
    color: "#dc2626",
  },
  {
    id: "bias-monitor",
    name: "Bias & Fairness Monitor",
    purpose: "Bias ratio monitoring across 9 name-script groups with FATF R.10 alignment",
    category: "governance",
    fileCount: 4,
    keyComponents: ["BiasMonitor", "NationalityDistribution", "FairnessMeasure"],
    regulatoryAnchors: ["FATF R.10 Non-discrimination", "NIST AI RMF MEASURE-2.6"],
    color: "#8b5cf6",
  },
  {
    id: "drift-monitor",
    name: "Model Drift Monitor",
    purpose: "Tracks response distribution shift and triggers re-attestation when threshold breached",
    category: "governance",
    fileCount: 3,
    keyComponents: ["DriftMonitor", "DriftThresholdGate"],
    regulatoryAnchors: ["NIST AI RMF MANAGE-2.4", "Federal Decree-Law No. 10 of 2025 Art.18"],
    color: "#ec4899",
  },
  {
    id: "lib-utilities",
    name: "Brain Utilities",
    purpose: "Shared utilities: name matching, crypto risk, graph theory, jurisdiction lookup",
    category: "analysis",
    fileCount: 19,
    keyComponents: ["AdverseMediaScorer", "AggregationEngine", "JurisdictionalLookup", "GraphTheory"],
    regulatoryAnchors: ["Internal — supports all faculties"],
    color: "#64748b",
  },
  {
    id: "citation-validation",
    name: "Citation Validator",
    purpose: "Validates AI-generated regulatory citations against authoritative source list",
    category: "audit",
    fileCount: 3,
    keyComponents: ["CitationValidator", "TaxonomicGuard"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18 — no hallucinated citations"],
    color: "#78716c",
  },
  {
    id: "model-router",
    name: "Model Router",
    purpose: "Claude primary + Groq cost fallback routing with circuit breaker",
    category: "intelligence",
    fileCount: 5,
    keyComponents: ["ModelRouter", "LlmFallback", "CircuitBreaker"],
    regulatoryAnchors: ["Federal Decree-Law No. 10 of 2025 Art.18 resilience", "SOC2 CC6.1"],
    color: "#0284c7",
  },
];

const CONNECTIONS = [
  { from: "sanctions-orchestrator", to: "entity-resolution",     label: "disambiguation" },
  { from: "entity-resolution",      to: "risk-scoring",          label: "resolved entity" },
  { from: "adverse-media",          to: "risk-scoring",          label: "media signals" },
  { from: "relationship-intelligence", to: "risk-scoring",       label: "network risk" },
  { from: "risk-scoring",           to: "decision-governance",   label: "disposition input" },
  { from: "crypto-risk",            to: "risk-scoring",          label: "crypto signals" },
  { from: "typology-engine",        to: "risk-scoring",          label: "typology match" },
  { from: "decision-governance",    to: "audit-ledger",          label: "HMAC-signed entry" },
  { from: "model-router",           to: "sanctions-orchestrator", label: "LLM calls" },
  { from: "model-router",           to: "adverse-media",         label: "NLP inference" },
  { from: "adversarial-probes",     to: "model-router",          label: "red-team" },
  { from: "bias-monitor",           to: "risk-scoring",          label: "fairness gate" },
  { from: "drift-monitor",          to: "model-router",          label: "drift alert" },
  { from: "citation-validation",    to: "decision-governance",   label: "citation check" },
];

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  void writeAuditChainEntry({ event: "brain_map_viewed", actor: gate.sub ?? "api" }, tenantId).catch(() => {});

  const body: BrainMapResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantId,
    totalFiles: FACULTIES.reduce((s, f) => s + f.fileCount, 0),
    faculties: FACULTIES,
    connections: CONNECTIONS,
  };

  return NextResponse.json(body, { headers: gate.headers });
}
