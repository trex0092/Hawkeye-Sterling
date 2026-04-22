// Hawkeye Sterling — doctrine-satisfaction coverage engine.
//
// Given a selected set of reasoning modes (plus the tagged taxonomy IDs they
// carry) and a set of doctrines, compute:
//   - overall taxonomy coverage by category
//   - per-doctrine satisfaction (0..1) based on required-taxonomy overlap
//   - anchor coverage (which regulatory references are invoked)
//   - gap report: which doctrines cannot close, which entries are missing
//
// This is the Refinitiv-kill: the MLRO can see, live, whether the selected
// cognitive pipeline is sufficient to discharge the obligations in play.

import {
  REGULATORY_PLAYBOOKS,
  type RegulatoryPlaybook,
} from "./regulatory-playbooks.js";
import { ANCHORS } from "./anchors.js";

export interface ModeLike {
  id: string;
  taxonomyIds: readonly string[];
}

export interface CategoryCoverage {
  category: "skills" | "reasoning" | "analysis";
  covered: string[];       // taxonomy IDs actually exercised
  coveredCount: number;
  totalCount: number;
  percent: number;         // 0..100
}

export interface PlaybookSatisfaction {
  playbookId: string;
  playbookName: string;
  summary: string;
  slaHours?: number;
  requiredSkills: number;
  coveredSkills: number;
  requiredReasoning: number;
  coveredReasoning: number;
  requiredAnalysis: number;
  coveredAnalysis: number;
  requiredAnchors: number;
  coveredAnchors: number;
  missingSkills: string[];
  missingReasoning: string[];
  missingAnalysis: string[];
  missingAnchors: string[];
  satisfactionPercent: number;  // 0..100 weighted
  status: "satisfied" | "partial" | "unmet";
}

type DoctrineSatisfaction = PlaybookSatisfaction;

export interface CoverageReport {
  modeIds: string[];
  taxonomyIdsActivated: string[];
  anchorIdsActivated: string[];
  bySkills: CategoryCoverage;
  byReasoning: CategoryCoverage;
  byAnalysis: CategoryCoverage;
  playbooks: PlaybookSatisfaction[];
  playbooksSatisfied: number;
  playbooksPartial: number;
  playbooksUnmet: number;
  overallScore: number;         // 0..100 weighted
  generatedAt: string;
}

const SATISFIED_THRESHOLD = 95;
const PARTIAL_THRESHOLD = 40;

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function percent(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 100);
}

function categoryCoverage(
  category: "skills" | "reasoning" | "analysis",
  taxonomyActivated: Set<string>,
  totalInCategory: number,
): CategoryCoverage {
  const covered: string[] = [];
  for (const id of taxonomyActivated) {
    if (id.startsWith(`${category}-`)) covered.push(id);
  }
  return {
    category,
    covered: covered.sort(),
    coveredCount: covered.length,
    totalCount: totalInCategory,
    percent: percent(covered.length, totalInCategory),
  };
}

function evaluatePlaybook(
  doc: RegulatoryPlaybook,
  activated: Set<string>,
  anchorsActivated: Set<string>,
): PlaybookSatisfaction {
  const missingSkills = doc.requiredSkills.filter((id) => !activated.has(id));
  const missingReasoning = doc.requiredReasoning.filter((id) => !activated.has(id));
  const missingAnalysis = doc.requiredAnalysis.filter((id) => !activated.has(id));
  const missingAnchors = doc.requiredAnchors.filter((id) => !anchorsActivated.has(id));

  const coveredSkills = doc.requiredSkills.length - missingSkills.length;
  const coveredReasoning = doc.requiredReasoning.length - missingReasoning.length;
  const coveredAnalysis = doc.requiredAnalysis.length - missingAnalysis.length;
  const coveredAnchors = doc.requiredAnchors.length - missingAnchors.length;

  const totalRequired =
    doc.requiredSkills.length +
    doc.requiredReasoning.length +
    doc.requiredAnalysis.length +
    doc.requiredAnchors.length;
  const totalCovered = coveredSkills + coveredReasoning + coveredAnalysis + coveredAnchors;

  const satisfactionPercent = percent(totalCovered, totalRequired);
  const status: PlaybookSatisfaction["status"] =
    satisfactionPercent >= SATISFIED_THRESHOLD
      ? "satisfied"
      : satisfactionPercent >= PARTIAL_THRESHOLD
        ? "partial"
        : "unmet";

  const result: PlaybookSatisfaction = {
    playbookId: doc.id,
    playbookName: doc.name,
    summary: doc.summary,
    requiredSkills: doc.requiredSkills.length,
    coveredSkills,
    requiredReasoning: doc.requiredReasoning.length,
    coveredReasoning,
    requiredAnalysis: doc.requiredAnalysis.length,
    coveredAnalysis,
    requiredAnchors: doc.requiredAnchors.length,
    coveredAnchors,
    missingSkills,
    missingReasoning,
    missingAnalysis,
    missingAnchors,
    satisfactionPercent,
    status,
  };
  if (doc.slaHours !== undefined) result.slaHours = doc.slaHours;
  return result;
}

export interface ComputeCoverageInput {
  modes: readonly ModeLike[];
  totals: { skills: number; reasoning: number; analysis: number };
  // Optional: reasoning modes carry anchor references too (future extension).
  anchorIds?: string[];
  playbooks?: readonly RegulatoryPlaybook[];
  now?: () => string;
}

export function computeCoverage(input: ComputeCoverageInput): CoverageReport {
  const playbooks = input.playbooks ?? REGULATORY_PLAYBOOKS;
  const now = input.now ?? (() => new Date().toISOString());

  const activated = new Set<string>();
  for (const m of input.modes) for (const t of m.taxonomyIds) activated.add(t);

  // Derive anchors from playbooks whose taxonomy entries are fully covered
  // (anchor activation = "evidence this anchor is being discharged by the
  // selected modes"). More nuanced activation can come later.
  const anchorsActivated = new Set<string>();
  for (const pb of playbooks) {
    const satisfies =
      pb.requiredSkills.every((id) => activated.has(id)) &&
      pb.requiredReasoning.every((id) => activated.has(id)) &&
      pb.requiredAnalysis.every((id) => activated.has(id));
    if (satisfies) {
      for (const a of pb.requiredAnchors) anchorsActivated.add(a);
    }
  }
  for (const explicit of input.anchorIds ?? []) anchorsActivated.add(explicit);

  const bySkills = categoryCoverage("skills", activated, input.totals.skills);
  const byReasoning = categoryCoverage("reasoning", activated, input.totals.reasoning);
  const byAnalysis = categoryCoverage("analysis", activated, input.totals.analysis);

  const playbookResults = playbooks.map((p) =>
    evaluatePlaybook(p, activated, anchorsActivated),
  );
  const satisfied = playbookResults.filter((d) => d.status === "satisfied").length;
  const partial = playbookResults.filter((d) => d.status === "partial").length;
  const unmet = playbookResults.filter((d) => d.status === "unmet").length;

  const overallScore =
    playbookResults.length === 0
      ? 0
      : Math.round(
          playbookResults.reduce((sum, d) => sum + d.satisfactionPercent, 0) /
            playbookResults.length,
        );

  return {
    modeIds: input.modes.map((m) => m.id),
    taxonomyIdsActivated: dedupe(Array.from(activated)).sort(),
    anchorIdsActivated: dedupe(Array.from(anchorsActivated)).sort(),
    bySkills,
    byReasoning,
    byAnalysis,
    playbooks: playbookResults,
    playbooksSatisfied: satisfied,
    playbooksPartial: partial,
    playbooksUnmet: unmet,
    overallScore,
    generatedAt: now(),
  };
}

// Convenience: list anchors actually defined in the catalogue.
export function definedAnchorIds(): string[] {
  return ANCHORS.map((a) => a.id);
}
