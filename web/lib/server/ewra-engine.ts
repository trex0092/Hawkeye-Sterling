// Hawkeye Sterling — EWRA engine: FATF risk factor matrix, residual risk,
// CBUAE risk appetite alignment, UAE sector modifiers, and trend analysis.
//
// Regulatory basis:
//   FATF Recommendation 1 (risk-based approach) / INR.1
//   CBUAE AML/CFT Supervisory Standards (2024 revision)
//   UAE Federal Decree-Law No. 10 of 2025 — Federal Decree-Law on AML/CFT
//   UAE Federal Decree-Law No. (10) of 2025 — Dealers in Precious Metals and Stones
//   ISO 31000:2018 — Risk management framework (residual risk treatment)

import { getJson, setJson } from "@/lib/server/store";

// ── FATF Risk Factor Matrix ───────────────────────────────────────────────────
// Structured scoring matrix based on FATF's risk-based approach (Rec. 1 / INR.1).
// Each factor carries a base risk score (0–100) and a weight (0–1).
// Overall dimension score = weighted average of applicable factor scores.

export interface FatfRiskFactor {
  factor: string;
  category: "customer" | "product_service" | "geographic" | "delivery_channel";
  baseScore: number;          // inherent score 0-100
  weight: number;             // contribution weight 0-1
  ratingLabel: "low" | "medium" | "medium-high" | "high" | "critical";
  regulatoryBasis: string;
}

export const FATF_RISK_FACTOR_MATRIX: FatfRiskFactor[] = [
  // ── Customer Risk ──────────────────────────────────────────────────────────
  {
    factor: "Politically Exposed Person (PEP)",
    category: "customer",
    baseScore: 85,
    weight: 0.30,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.12; CBUAE AML/CFT Standards Art.14",
  },
  {
    factor: "New customers (< 12 months)",
    category: "customer",
    baseScore: 55,
    weight: 0.15,
    ratingLabel: "medium",
    regulatoryBasis: "FATF Rec.10; Federal Decree-Law No. 10 of 2025 Art.8",
  },
  {
    factor: "Non-face-to-face (remote onboarding)",
    category: "customer",
    baseScore: 60,
    weight: 0.20,
    ratingLabel: "medium",
    regulatoryBasis: "FATF Rec.15; CBUAE Digital Banking Guidance 2023",
  },
  {
    factor: "Non-Governmental Organisation (NGO) / NPO",
    category: "customer",
    baseScore: 70,
    weight: 0.25,
    ratingLabel: "medium-high",
    regulatoryBasis: "FATF Rec.8; Federal Decree-Law No. 10 of 2025 Art.9(3)",
  },
  // ── Product / Service Risk ─────────────────────────────────────────────────
  {
    factor: "Private banking / wealth management",
    category: "product_service",
    baseScore: 85,
    weight: 0.25,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.22; CBUAE AML/CFT Standards Art.18",
  },
  {
    factor: "Wire transfers (cross-border)",
    category: "product_service",
    baseScore: 72,
    weight: 0.20,
    ratingLabel: "medium-high",
    regulatoryBasis: "FATF Rec.16; UAE CB Notice 13/2023",
  },
  {
    factor: "Crypto-asset services / VASPs",
    category: "product_service",
    baseScore: 85,
    weight: 0.20,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.15 (2019 rev.); VARA AML Framework 2024",
  },
  {
    factor: "Trade finance",
    category: "product_service",
    baseScore: 85,
    weight: 0.20,
    ratingLabel: "high",
    regulatoryBasis: "FATF Trade Finance Guidance 2006 (rev. 2021)",
  },
  {
    factor: "Correspondent banking",
    category: "product_service",
    baseScore: 85,
    weight: 0.15,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.13; CBUAE CB Guidance Note 2022",
  },
  // ── Geographic Risk ────────────────────────────────────────────────────────
  {
    factor: "FATF grey-listed jurisdiction nexus",
    category: "geographic",
    baseScore: 80,
    weight: 0.35,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.1 / INR.1; CBUAE Circular 8/2024",
  },
  {
    factor: "CAHRA-listed jurisdiction nexus (conflict-affected / high-risk area)",
    category: "geographic",
    baseScore: 95,
    weight: 0.45,
    ratingLabel: "critical",
    regulatoryBasis: "OECD DDSG 3rd Ed.; LBMA Responsible Sourcing; UAE MoEI DPMS Guidance",
  },
  {
    factor: "Domestic low-risk jurisdiction",
    category: "geographic",
    baseScore: 15,
    weight: 0.20,
    ratingLabel: "low",
    regulatoryBasis: "FATF Rec.1 simplified due diligence",
  },
  // ── Delivery Channel Risk ──────────────────────────────────────────────────
  {
    factor: "Internet / mobile banking (digital-only)",
    category: "delivery_channel",
    baseScore: 55,
    weight: 0.30,
    ratingLabel: "medium",
    regulatoryBasis: "FATF Rec.15; CBUAE Digital Banking Guidance 2023",
  },
  {
    factor: "Agents / intermediaries / introducers",
    category: "delivery_channel",
    baseScore: 80,
    weight: 0.50,
    ratingLabel: "high",
    regulatoryBasis: "FATF Rec.17; Federal Decree-Law No. 10 of 2025 Art.12",
  },
  {
    factor: "Direct bank branch (face-to-face)",
    category: "delivery_channel",
    baseScore: 20,
    weight: 0.20,
    ratingLabel: "low",
    regulatoryBasis: "FATF Rec.1 simplified due diligence",
  },
];

/** Compute the weighted average score for a given FATF matrix category. */
export function computeFatfCategoryScore(category: FatfRiskFactor["category"]): number {
  const factors = FATF_RISK_FACTOR_MATRIX.filter((f) => f.category === category);
  if (factors.length === 0) return 50;
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedSum = factors.reduce((s, f) => s + f.baseScore * f.weight, 0);
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}

// ── UAE Sector-Specific Risk Modifiers ───────────────────────────────────────
// Additive modifiers (basis points on 0-100 scale) for UAE-designated
// high-risk sectors. Applied to the inherent risk score before residual
// risk calculation. Source: CBUAE AML/CFT Sectoral Risk Assessment 2024;
// UAE Federal Decree-Law No. (10) of 2025 (DPMS); UAE MoE Free Zone CDD Circular 2022.

export interface SectorRiskModifier {
  sector: string;
  keywords: string[];          // lower-case keywords to match against sector input
  modifier: number;            // points to add to overall inherent score
  regulatoryBasis: string;
}

export const UAE_SECTOR_MODIFIERS: SectorRiskModifier[] = [
  {
    sector: "Gold trading / precious metals",
    keywords: ["gold", "precious metal", "bullion", "dpms", "gold trading"],
    modifier: 20,
    regulatoryBasis: "UAE Federal Decree-Law No. (10) of 2025; MoEI DPMS Registration; CBUAE SRA 2024 §4.3",
  },
  {
    sector: "Real estate",
    keywords: ["real estate", "property", "mortgage", "realty", "real_estate"],
    modifier: 15,
    regulatoryBasis: "UAE Federal Decree-Law No. 10 of 2025 Art.3(8); RERA AML Circular 2023",
  },
  {
    sector: "Hawala / informal money transfer",
    keywords: ["hawala", "money transfer", "remittance", "hundi", "fawri", "informal"],
    modifier: 25,
    regulatoryBasis: "CBUAE Hawala Provider Regulation 2021; Federal Decree-Law No. 10 of 2025 Art.3(10)",
  },
  {
    sector: "Free zone companies",
    keywords: ["free zone", "freezone", "free_zone", "jafza", "difc", "adgm", "dmcc", "special economic"],
    modifier: 10,
    regulatoryBasis: "UAE MoE Free Zone CDD Circular 2022; CBUAE SRA 2024 §5.1",
  },
  {
    sector: "Precious stones",
    keywords: ["precious stone", "gemstone", "diamond", "jewellery", "jewelry", "gems"],
    modifier: 15,
    regulatoryBasis: "UAE Federal Decree-Law No. (10) of 2025; MoEI DPMS Registration; CBUAE SRA 2024 §4.3",
  },
];

/**
 * Compute the total sector modifier for a given sector string.
 * Multiple modifiers can apply (e.g. a DMCC gold trading firm triggers both
 * "free zone" and "gold trading" modifiers).
 */
export function computeSectorModifier(sector: string): { totalModifier: number; applied: SectorRiskModifier[] } {
  const lower = sector.toLowerCase();
  const applied = UAE_SECTOR_MODIFIERS.filter((m) =>
    m.keywords.some((kw) => lower.includes(kw)),
  );
  const totalModifier = applied.reduce((s, m) => s + m.modifier, 0);
  return { totalModifier, applied };
}

// ── Residual Risk Calculation ─────────────────────────────────────────────────
// Residual risk = inherent risk × (1 - control_effectiveness)
// control_effectiveness ∈ [0, 1]: 0 = no controls, 1 = perfect controls.
// Based on ISO 31000:2018 risk treatment framework and FATF Rec.1 residual-
// risk-after-mitigation concept.

export interface ResidualRiskResult {
  inherentScore: number;        // raw score before controls
  controlEffectiveness: number; // 0-1 (derived from dimension mitigations count)
  residualScore: number;        // inherentScore × (1 - effectiveness)
  residualRating: "low" | "medium" | "high" | "critical";
  explanation: string;
}

/**
 * Derive a rough control effectiveness estimate from the number of mitigation
 * controls surfaced by the AI across all dimensions.
 *
 * Scale:
 *   0 controls   → 0.00 (no controls in place)
 *   1-3 controls → 0.20 (basic / nascent controls)
 *   4-7 controls → 0.40 (developing controls)
 *   8-12 controls → 0.60 (established controls)
 *   13-18 controls → 0.75 (mature controls)
 *   19+ controls  → 0.85 (advanced / leading-practice controls)
 *   Cap at 0.85: even the best controls cannot reduce ML risk to zero.
 */
export function deriveControlEffectiveness(totalMitigationControls: number): number {
  if (totalMitigationControls <= 0) return 0.00;
  if (totalMitigationControls <= 3) return 0.20;
  if (totalMitigationControls <= 7) return 0.40;
  if (totalMitigationControls <= 12) return 0.60;
  if (totalMitigationControls <= 18) return 0.75;
  return 0.85;
}

export function ratingFromScore(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function calculateResidualRisk(
  inherentScore: number,
  dimensions: Array<{ mitigationControls: string[] }>,
): ResidualRiskResult {
  const totalControls = dimensions.reduce((s, d) => s + d.mitigationControls.length, 0);
  const controlEffectiveness = deriveControlEffectiveness(totalControls);
  const residualScore = Math.round(Math.max(0, Math.min(100, inherentScore * (1 - controlEffectiveness))));
  const residualRating = ratingFromScore(residualScore);
  const pct = Math.round(controlEffectiveness * 100);
  const explanation =
    `Inherent risk score ${inherentScore}/100 reduced by ${pct}% control effectiveness ` +
    `(${totalControls} mitigation control${totalControls === 1 ? "" : "s"} identified) → ` +
    `residual risk ${residualScore}/100 (${residualRating}).`;
  return { inherentScore, controlEffectiveness, residualScore, residualRating, explanation };
}

// ── CBUAE Risk Appetite Alignment ────────────────────────────────────────────
// Thresholds derived from CBUAE AML/CFT Supervisory Standards and the
// 2024 Sectoral Risk Assessment guidance on tolerable residual risk levels.
// Obliged entities operating above these thresholds must file a board-level
// risk acceptance note and submit a remediation plan to the CBUAE within 30 days.

export interface CbuaeRiskAppetiteAlignment {
  residualScore: number;
  threshold: number;           // CBUAE-mandated maximum tolerable residual risk
  exceedsAppetite: boolean;
  mandatoryActions: string[];
  commentary: string;
}

// CBUAE residual risk appetite thresholds by sector category
const CBUAE_THRESHOLD_DEFAULT = 40;
const CBUAE_THRESHOLD_HIGH_RISK_SECTOR = 30; // gold, hawala, real estate, free zone, DPMS

export function assessCbuaeRiskAppetite(
  residualScore: number,
  sectorModifiersApplied: SectorRiskModifier[],
): CbuaeRiskAppetiteAlignment {
  const isHighRiskSector = sectorModifiersApplied.length > 0;
  const threshold = isHighRiskSector ? CBUAE_THRESHOLD_HIGH_RISK_SECTOR : CBUAE_THRESHOLD_DEFAULT;
  const exceedsAppetite = residualScore > threshold;

  const mandatoryActions: string[] = [];
  if (exceedsAppetite) {
    mandatoryActions.push(
      "Board-level risk acceptance note required (CBUAE AML/CFT Standards Art.5(3))",
      "Submit 30-day remediation plan to CBUAE Supervision Division",
      "Escalate to MLRO and Board Risk Committee within 5 business days",
    );
    if (residualScore >= 75) {
      mandatoryActions.push(
        "Immediate transaction monitoring parameter review required",
        "Consider voluntary disclosure to CBUAE (Federal Decree-Law No. 10 of 2025 Art.15)",
      );
    }
    if (isHighRiskSector) {
      mandatoryActions.push(
        "Enhanced due diligence mandatory for all new customers in this sector (CBUAE SRA 2024 §6)",
      );
    }
  }

  const commentary = exceedsAppetite
    ? `EXCEEDS CBUAE risk appetite: residual score ${residualScore} is above the ` +
      `${isHighRiskSector ? "high-risk sector" : "standard"} threshold of ${threshold}. ` +
      `Mandatory escalation and remediation required under CBUAE AML/CFT Supervisory Standards.`
    : `WITHIN CBUAE risk appetite: residual score ${residualScore} is at or below the ` +
      `${isHighRiskSector ? "high-risk sector" : "standard"} threshold of ${threshold}. ` +
      `Continue to monitor and maintain existing controls per CBUAE periodic review schedule.`;

  return { residualScore, threshold, exceedsAppetite, mandatoryActions, commentary };
}

// ── Trend Analysis ───────────────────────────────────────────────────────────
// Compare current EWRA score against the most recent prior assessment for the
// same sector+jurisdiction combination. If risk increased by > 20 points,
// flag for board-level attention per FATF Rec.1 continuous monitoring obligation.

export interface EwraTrendAnalysis {
  previousScore: number | null;
  currentScore: number;
  delta: number | null;          // currentScore - previousScore; null if no history
  significantIncrease: boolean;  // true if delta > 20
  previousGeneratedAt: string | null;
  commentary: string;
}

const EWRA_HISTORY_KEY_PREFIX = "ewra-history/";

function ewraHistoryKey(sector: string, jurisdiction: string): string {
  const s = sector.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const j = jurisdiction.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${EWRA_HISTORY_KEY_PREFIX}${j}/${s}`;
}

export interface StoredEwraSnapshot {
  overallScore: number;
  generatedAt: string;
  sector: string;
  jurisdiction: string;
}

export async function loadPreviousEwraSnapshot(
  sector: string,
  jurisdiction: string,
): Promise<StoredEwraSnapshot | null> {
  try {
    return await getJson<StoredEwraSnapshot>(ewraHistoryKey(sector, jurisdiction));
  } catch {
    return null;
  }
}

export async function saveEwraSnapshot(snapshot: StoredEwraSnapshot): Promise<void> {
  try {
    await setJson(ewraHistoryKey(snapshot.sector, snapshot.jurisdiction), snapshot);
  } catch (err) {
    console.warn("[ewra] snapshot save failed:", err instanceof Error ? err.message : String(err));
  }
}

export function buildTrendAnalysis(
  current: number,
  previous: StoredEwraSnapshot | null,
): EwraTrendAnalysis {
  if (!previous) {
    return {
      previousScore: null,
      currentScore: current,
      delta: null,
      significantIncrease: false,
      previousGeneratedAt: null,
      commentary:
        "No prior EWRA assessment found for this sector/jurisdiction. This is the baseline assessment.",
    };
  }

  const delta = current - previous.overallScore;
  const significantIncrease = delta > 20;
  const sign = delta >= 0 ? "+" : "";
  const commentary = significantIncrease
    ? `RISK ESCALATION ALERT: Overall score increased by ${sign}${delta} points ` +
      `(${previous.overallScore} → ${current}) since the previous assessment on ` +
      `${previous.generatedAt.split("T")[0]}. ` +
      `A >20 point increase requires board-level review and updated risk mitigation controls ` +
      `under FATF Rec.1 continuous monitoring and Federal Decree-Law No. 10 of 2025 Art.5(4).`
    : delta < -20
    ? `RISK IMPROVEMENT: Overall score decreased by ${delta} points ` +
      `(${previous.overallScore} → ${current}) since the previous assessment on ` +
      `${previous.generatedAt.split("T")[0]}. Document control effectiveness improvements for the audit trail.`
    : `STABLE: Overall score changed by ${sign}${delta} points ` +
      `(${previous.overallScore} → ${current}) since the previous assessment on ` +
      `${previous.generatedAt.split("T")[0]}. Risk profile is within normal variation.`;

  return {
    previousScore: previous.overallScore,
    currentScore: current,
    delta,
    significantIncrease,
    previousGeneratedAt: previous.generatedAt,
    commentary,
  };
}
