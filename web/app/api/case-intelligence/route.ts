// POST /api/case-intelligence
//
// Per-case AI enrichment endpoint. Classifies risk cluster, detects evasion
// indicators, computes network complexity, and recommends reasoning modes
// for the investigator.
//
// Regulatory basis: UAE Federal Decree-Law No. 20 of 2018 Art.18 (CDD), Federal Decree-Law No. 10 of 2025 Art.18 (AI audit trail).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface EvidenceInput {
  category: string;
  description: string;
  severity?: string;
}

interface SubjectInput {
  name?: string;
  entityType?: string;
  jurisdiction?: string;
  sector?: string;
}

interface RequestBody {
  caseId: string;
  subject?: SubjectInput;
  evidence?: EvidenceInput[];
}

interface CaseIntelligence {
  riskCluster: string;
  riskClusterRationale: string;
  activeTypologies: string[];
  evasionIndicators: string[];
  networkComplexityScore: number;
  immediateFlags: string[];
  recommendedModes: string[];
}

// Evasion technique keywords to scan evidence descriptions for.
const EVASION_KEYWORDS: Record<string, string> = {
  layering:    "Layering detected",
  structuring: "Structuring / smurfing pattern",
  smurfing:    "Structuring / smurfing pattern",
  shell:       "Shell company usage",
  nominee:     "Nominee / proxy arrangement",
  offshore:    "Offshore jurisdiction routing",
};

function classifyRiskCluster(evidence: EvidenceInput[]): {
  riskCluster: string;
  riskClusterRationale: string;
  activeTypologies: string[];
  recommendedModes: string[];
} {
  const categories = evidence.map((e) => e.category.toLowerCase());
  const hasSanctions = categories.some(
    (c) => c.includes("sanction") || c.includes("pep") || c.includes("screening"),
  );
  const hasTransaction = categories.some(
    (c) => c.includes("transaction") || c.includes("transfer") || c.includes("payment"),
  );
  const hasAdverseMedia = categories.some(
    (c) => c.includes("adverse") || c.includes("media") || c.includes("news"),
  );

  if (hasSanctions) {
    return {
      riskCluster: "Sanctions/PEP Nexus",
      riskClusterRationale:
        "Evidence includes sanctions-related or PEP screening material indicating a direct nexus to designated parties or politically exposed persons.",
      activeTypologies: [
        "Sanctions Evasion",
        "PEP Abuse of Position",
        "Third-Party Conduit",
      ],
      recommendedModes: [
        "sanctions-nexus-deep",
        "pep-risk-assessment",
        "beneficial-ownership-trace",
        "network-mapping",
      ],
    };
  }
  if (hasTransaction) {
    return {
      riskCluster: "Transaction Anomaly",
      riskClusterRationale:
        "Transaction records present with patterns inconsistent with declared business purpose, indicating potential layering or placement activity.",
      activeTypologies: [
        "Layering",
        "Structuring",
        "Round-Trip Transactions",
        "Rapid Movement of Funds",
      ],
      recommendedModes: [
        "transaction-pattern-analysis",
        "velocity-check",
        "structuring-detection",
        "correspondent-bank-risk",
      ],
    };
  }
  if (hasAdverseMedia) {
    return {
      riskCluster: "Adverse Media",
      riskClusterRationale:
        "Adverse media evidence links the subject to negative news coverage that may indicate financial crime, fraud, or reputational risk.",
      activeTypologies: [
        "Fraud",
        "Corruption",
        "Tax Evasion",
        "Reputational Risk Proxy",
      ],
      recommendedModes: [
        "adverse-media-deep",
        "sentiment-analysis",
        "corroboration-check",
        "source-credibility",
      ],
    };
  }
  return {
    riskCluster: "General AML",
    riskClusterRationale:
      "Evidence does not map to a specific high-risk cluster. General AML typologies apply pending further investigation.",
    activeTypologies: [
      "General Money Laundering",
      "Cash Intensive Business Abuse",
    ],
    recommendedModes: [
      "aml-general-review",
      "cdd-gap-analysis",
      "sector-risk-assessment",
    ],
  };
}

function extractEvasionIndicators(evidence: EvidenceInput[]): string[] {
  const found = new Set<string>();
  for (const e of evidence) {
    const desc = e.description.toLowerCase();
    for (const [keyword, label] of Object.entries(EVASION_KEYWORDS)) {
      if (desc.includes(keyword) && !found.has(label)) {
        found.add(label);
      }
    }
  }
  return Array.from(found);
}

function computeNetworkComplexityScore(evidence: EvidenceInput[]): number {
  const distinctCategories = new Set(evidence.map((e) => e.category)).size;
  const score = evidence.length * 5 + distinctCategories * 10;
  return Math.min(score, 100);
}

function buildImmediateFlags(
  evidence: EvidenceInput[],
  evasionIndicators: string[],
): string[] {
  const flags: string[] = [];

  const criticalEvidence = evidence.filter(
    (e) => e.severity?.toLowerCase() === "critical" || e.severity?.toLowerCase() === "high",
  );
  if (criticalEvidence.length > 0) {
    flags.push(
      `${criticalEvidence.length} high/critical severity evidence item(s) require immediate review`,
    );
  }
  if (evasionIndicators.length >= 3) {
    flags.push("Multiple evasion techniques detected — consider escalation to MLRO");
  }
  if (evidence.length >= 10) {
    flags.push("Large evidence volume — triage prioritisation recommended");
  }

  return flags;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.caseId || typeof body.caseId !== "string" || body.caseId.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "caseId is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const caseId = body.caseId.trim();
  const evidence: EvidenceInput[] = Array.isArray(body.evidence) ? body.evidence : [];

  const { riskCluster, riskClusterRationale, activeTypologies, recommendedModes } =
    classifyRiskCluster(evidence);

  const evasionIndicators = extractEvasionIndicators(evidence);
  const networkComplexityScore = computeNetworkComplexityScore(evidence);
  const immediateFlags = buildImmediateFlags(evidence, evasionIndicators);

  const intelligence: CaseIntelligence = {
    riskCluster,
    riskClusterRationale,
    activeTypologies,
    evasionIndicators,
    networkComplexityScore,
    immediateFlags,
    recommendedModes,
  };

  await writeAuditChainEntry(
    {
      event: "ai.case_intelligence_run",
      actor: gate.keyId,
      caseId,
      meta: { caseId, riskCluster },
    },
    tenant,
  );

  return NextResponse.json(
    { ok: true, caseId, intelligence },
    { headers: gate.headers },
  );
}
