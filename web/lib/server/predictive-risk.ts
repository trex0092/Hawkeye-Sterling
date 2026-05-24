// Predictive risk signal engine — forward-looking risk scoring for AML/CFT compliance.
// Computes a weighted composite score from 7 signal categories and generates
// a natural language explanation from the top contributing signals.

import type { Subject } from "@/lib/types";
import { getCountryRisk } from "@/lib/server/high-risk-countries";

export interface RiskSignal {
  id: string;
  label: string;
  score: number;        // 0–100
  weight: number;       // 0–1, sum of all weights = 1.0
  explanation: string;
  category: "jurisdiction" | "entity_type" | "pep" | "adverse_media" | "sanctions" | "behavioral" | "structure";
}

export interface PredictiveRiskResult {
  subjectId: string;
  compositeScore: number;     // weighted average of signals, 0–100
  signals: RiskSignal[];
  tier: "critical" | "high" | "elevated" | "standard" | "low";
  generatedAt: string;
  explanation: string;        // 2–3 sentence natural language summary
}

// ── Weight table ─────────────────────────────────────────────────────────────
const WEIGHTS: Record<RiskSignal["category"], number> = {
  jurisdiction:  0.25,
  pep:           0.25,
  adverse_media: 0.20,
  sanctions:     0.15,
  entity_type:   0.10,
  structure:     0.05,
  behavioral:    0.00, // reserved for future signals; excluded from denominator
};

// ── Jurisdiction signal ───────────────────────────────────────────────────────
function jurisdictionSignal(subject: Subject): RiskSignal {
  const iso2 = subject.jurisdiction ?? subject.country;
  const entry = getCountryRisk(iso2);
  let score = 20;
  let explanation = "Subject jurisdiction presents standard risk profile.";

  if (entry) {
    switch (entry.tier) {
      case "blacklist":
        score = 100;
        explanation = `Subject is linked to ${entry.name}, a FATF blacklisted jurisdiction (call for action).`;
        break;
      case "greylist":
        score = 85;
        explanation = `Subject is linked to ${entry.name}, a FATF grey-listed jurisdiction under increased monitoring.`;
        break;
      case "elevated":
        score = 70;
        explanation = `Subject jurisdiction (${entry.name}) carries elevated risk per FATF/EU/UAE guidance.`;
        break;
      default:
        score = 20;
        explanation = `Subject jurisdiction (${entry.name}) presents standard risk profile.`;
    }
  }

  return {
    id: "jurisdiction",
    label: "Jurisdiction Risk",
    score,
    weight: WEIGHTS.jurisdiction,
    explanation,
    category: "jurisdiction",
  };
}

// ── Entity type signal ────────────────────────────────────────────────────────
function entityTypeSignal(subject: Subject): RiskSignal {
  const type = subject.type ?? "";
  let score = 20;
  let explanation = "Entity type presents standard baseline risk.";

  if (type.includes("UBO")) {
    score = 80;
    explanation = "Subject is a UBO — beneficial ownership opacity elevates inherent risk.";
  } else if (type.includes("Correspondent")) {
    score = 75;
    explanation = "Correspondent relationship presents elevated inherent risk per FATF R.13.";
  } else if (type.includes("Intermediary")) {
    score = 65;
    explanation = "Intermediary entity type carries heightened transparency risk.";
  } else if (type.includes("Counterparty")) {
    score = 50;
    explanation = "Counterparty relationship warrants standard-to-elevated due diligence.";
  } else if (type.includes("Director") || type.includes("Authorised Signatory")) {
    score = 45;
    explanation = "Director/signatory role requires identity and authority verification.";
  } else if (type.includes("Supplier") || type.includes("Refiner")) {
    score = 40;
    explanation = "Supplier/refiner relationship requires supply chain due diligence.";
  } else if (type.includes("Customer")) {
    score = 30;
    explanation = "Standard customer relationship with routine CDD obligations.";
  } else if (type === "Transaction · Cluster") {
    score = 60;
    explanation = "Transaction cluster entity type indicates layering or structuring risk.";
  }

  return {
    id: "entity_type",
    label: "Entity Type Risk",
    score,
    weight: WEIGHTS.entity_type,
    explanation,
    category: "entity_type",
  };
}

// ── PEP proximity signal ──────────────────────────────────────────────────────
function pepSignal(subject: Subject): RiskSignal {
  if (!subject.pep) {
    // Check RCA
    if (subject.rca?.screened) {
      return {
        id: "pep",
        label: "PEP Proximity",
        score: 60,
        weight: WEIGHTS.pep,
        explanation: "Subject is a Relative or Close Associate (RCA) of a PEP.  Enhanced monitoring required.",
        category: "pep",
      };
    }
    return {
      id: "pep",
      label: "PEP Proximity",
      score: 10,
      weight: WEIGHTS.pep,
      explanation: "No PEP or RCA designation detected for this subject.",
      category: "pep",
    };
  }

  const tier = (subject.pep.tier ?? "").toLowerCase();
  let score = 50;
  let explanation = "Subject has a PEP designation.";

  if (tier === "1" || tier === "tier1" || tier === "tier 1") {
    score = 90;
    explanation = "Subject is a Tier 1 PEP — senior head of state, government, or international body. Highest PEP risk.";
  } else if (tier === "2" || tier === "tier2" || tier === "tier 2") {
    score = 70;
    explanation = "Subject is a Tier 2 PEP — senior political, judicial, or military official.";
  } else if (tier === "3" || tier === "tier3" || tier === "tier 3") {
    score = 55;
    explanation = "Subject is a Tier 3 PEP — regional or local government official.";
  } else if (tier === "4" || tier === "tier4" || tier === "tier 4" || tier.includes("soe")) {
    score = 50;
    explanation = "Subject is a Tier 4 PEP — SOE executive with indirect political exposure.";
  } else if (tier.includes("rca")) {
    score = 60;
    explanation = "Subject is an RCA of a PEP — family member or known close associate.";
  }

  if (subject.pep.rationale) {
    explanation += ` (${subject.pep.rationale})`;
  }

  return {
    id: "pep",
    label: "PEP Proximity",
    score,
    weight: WEIGHTS.pep,
    explanation,
    category: "pep",
  };
}

// ── Adverse media signal ──────────────────────────────────────────────────────
function adverseMediaSignal(subject: Subject): RiskSignal {
  const mediaScore = subject.adverseMedia?.score ?? 0;
  let score = 0;
  let explanation = "No adverse media detected for this subject.";

  if (mediaScore >= 80) {
    score = 90;
    explanation = `High-confidence adverse media hit (score ${mediaScore}) — serious negative coverage detected.`;
  } else if (mediaScore >= 60) {
    score = 70;
    explanation = `Moderate adverse media signal (score ${mediaScore}) — notable negative coverage found.`;
  } else if (mediaScore >= 40) {
    score = 50;
    explanation = `Low-moderate adverse media signal (score ${mediaScore}) — some negative coverage detected.`;
  } else if (mediaScore > 0) {
    score = 25;
    explanation = `Weak adverse media signal (score ${mediaScore}) — marginal negative coverage.`;
  }

  return {
    id: "adverse_media",
    label: "Adverse Media",
    score,
    weight: WEIGHTS.adverse_media,
    explanation,
    category: "adverse_media",
  };
}

// ── Sanctions coverage width signal ──────────────────────────────────────────
function sanctionsSignal(subject: Subject): RiskSignal {
  const lists = subject.listCoverage ?? [];
  const hitCount = lists.length;
  let score = 0;
  let explanation = "No sanctions list exposure detected.";

  if (hitCount >= 5) {
    score = 100;
    explanation = `Subject appears on ${hitCount} sanctions lists — cross-jurisdictional designation confirmed.`;
  } else if (hitCount >= 3) {
    score = 85;
    explanation = `Subject appears on ${hitCount} sanctions lists (${lists.join(", ")}).`;
  } else if (hitCount === 2) {
    score = 65;
    explanation = `Subject appears on 2 sanctions lists (${lists.join(", ")}).`;
  } else if (hitCount === 1) {
    score = 45;
    explanation = `Subject appears on 1 sanctions list (${lists[0]}).`;
  }

  return {
    id: "sanctions",
    label: "Sanctions List Coverage",
    score,
    weight: WEIGHTS.sanctions,
    explanation,
    category: "sanctions",
  };
}

// ── CDD posture alignment signal (behavioral) ─────────────────────────────────
function cddPostureSignal(subject: Subject): RiskSignal {
  const posture = subject.cddPosture;
  const riskScore = subject.riskScore ?? 0;

  // EDD subject with low risk score is anomalous — may indicate mis-categorisation
  if (posture === "EDD" && riskScore < 60) {
    return {
      id: "behavioral",
      label: "CDD Posture Alignment",
      score: 70,
      weight: WEIGHTS.behavioral,
      explanation: `EDD subject with risk score ${riskScore} — posture-score misalignment may indicate data gap or evasion.`,
      category: "behavioral",
    };
  }
  // SDD subject with high risk score is also anomalous
  if (posture === "SDD" && riskScore > 60) {
    return {
      id: "behavioral",
      label: "CDD Posture Alignment",
      score: 65,
      weight: WEIGHTS.behavioral,
      explanation: `SDD subject with elevated risk score ${riskScore} — simplified due diligence may be insufficient.`,
      category: "behavioral",
    };
  }

  return {
    id: "behavioral",
    label: "CDD Posture Alignment",
    score: 10,
    weight: WEIGHTS.behavioral,
    explanation: "CDD posture is consistent with the assessed risk level.",
    category: "behavioral",
  };
}

// ── Structure risk signal ─────────────────────────────────────────────────────
function structureSignal(subject: Subject): RiskSignal {
  const type = subject.type ?? "";
  let score = 10;
  let explanation = "No elevated structural complexity detected.";

  if (type === "Corporate · Intermediary" || type === "Corporate · Correspondent") {
    score = 80;
    explanation = `${type} structure presents elevated layering and transparency risk — enhanced UBO verification required.`;
  } else if (type === "Corporate · Counterparty" || type === "Corporate · Supplier") {
    score = 40;
    explanation = "Corporate counterparty/supplier structure warrants beneficial ownership verification.";
  } else if (type === "Transaction · Cluster") {
    score = 70;
    explanation = "Transaction cluster entity indicates potential structuring or layering through multiple entities.";
  }

  return {
    id: "structure",
    label: "Structure Risk",
    score,
    weight: WEIGHTS.structure,
    explanation,
    category: "structure",
  };
}

// ── Tier classification ───────────────────────────────────────────────────────
function classifyTier(composite: number): PredictiveRiskResult["tier"] {
  if (composite >= 80) return "critical";
  if (composite >= 65) return "high";
  if (composite >= 45) return "elevated";
  if (composite >= 25) return "standard";
  return "low";
}

// ── Natural language explanation ─────────────────────────────────────────────
function buildExplanation(signals: RiskSignal[], composite: number, tier: PredictiveRiskResult["tier"]): string {
  // Top 3 contributing signals by weighted impact
  const weighted = signals
    .map((s) => ({ ...s, impact: s.score * s.weight }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const intro = `Composite risk score is ${composite.toFixed(0)}/100, classified as ${tierLabel}.`;
  const drivers = weighted
    .filter((s) => s.impact > 0)
    .map((s) => s.explanation)
    .join(" ");

  return `${intro} ${drivers}`.trim();
}

// ── Main export ───────────────────────────────────────────────────────────────
export function computePredictiveRisk(subject: Subject): PredictiveRiskResult {
  const signals: RiskSignal[] = [
    jurisdictionSignal(subject),
    entityTypeSignal(subject),
    pepSignal(subject),
    adverseMediaSignal(subject),
    sanctionsSignal(subject),
    structureSignal(subject),
    cddPostureSignal(subject),
  ];

  // Compute weighted composite over signals with non-zero weight
  const activeSignals = signals.filter((s) => s.weight > 0);
  const totalWeight = activeSignals.reduce((acc, s) => acc + s.weight, 0);
  const weightedSum = activeSignals.reduce((acc, s) => acc + s.score * s.weight, 0);
  const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  const tier = classifyTier(compositeScore);
  const explanation = buildExplanation(signals, compositeScore, tier);

  return {
    subjectId: subject.id,
    compositeScore,
    signals,
    tier,
    generatedAt: new Date().toISOString(),
    explanation,
  };
}
