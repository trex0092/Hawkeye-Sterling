// Frontend coverage engine — mirrors src/brain/coverage.ts semantics.

import { PLAYBOOKS, type Playbook } from "@/lib/data/playbooks";

export interface ModeLike {
  id: string;
  taxonomyIds: readonly string[];
}

export interface CategoryCoverage {
  category: "skills" | "reasoning" | "analysis";
  covered: string[];
  coveredCount: number;
  totalCount: number;
  percent: number;
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
  satisfactionPercent: number;
  status: "satisfied" | "partial" | "unmet";
}

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
  overallScore: number;
}

const SATISFIED_THRESHOLD = 95;
const PARTIAL_THRESHOLD = 40;

function percent(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 100);
}

function categoryCoverage(
  category: "skills" | "reasoning" | "analysis",
  activated: Set<string>,
  totalInCategory: number,
): CategoryCoverage {
  const covered: string[] = [];
  for (const id of activated) {
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
  pb: Playbook,
  activated: Set<string>,
  anchorsActivated: Set<string>,
): PlaybookSatisfaction {
  const missingSkills = pb.requiredSkills.filter((id) => !activated.has(id));
  const missingReasoning = pb.requiredReasoning.filter((id) => !activated.has(id));
  const missingAnalysis = pb.requiredAnalysis.filter((id) => !activated.has(id));
  const missingAnchors = pb.requiredAnchors.filter((id) => !anchorsActivated.has(id));

  const coveredSkills = pb.requiredSkills.length - missingSkills.length;
  const coveredReasoning = pb.requiredReasoning.length - missingReasoning.length;
  const coveredAnalysis = pb.requiredAnalysis.length - missingAnalysis.length;
  const coveredAnchors = pb.requiredAnchors.length - missingAnchors.length;

  const totalRequired =
    pb.requiredSkills.length +
    pb.requiredReasoning.length +
    pb.requiredAnalysis.length +
    pb.requiredAnchors.length;
  const totalCovered = coveredSkills + coveredReasoning + coveredAnalysis + coveredAnchors;

  const satisfactionPercent = percent(totalCovered, totalRequired);
  const status: PlaybookSatisfaction["status"] =
    satisfactionPercent >= SATISFIED_THRESHOLD
      ? "satisfied"
      : satisfactionPercent >= PARTIAL_THRESHOLD
        ? "partial"
        : "unmet";

  const result: PlaybookSatisfaction = {
    playbookId: pb.id,
    playbookName: pb.name,
    summary: pb.summary,
    requiredSkills: pb.requiredSkills.length,
    coveredSkills,
    requiredReasoning: pb.requiredReasoning.length,
    coveredReasoning,
    requiredAnalysis: pb.requiredAnalysis.length,
    coveredAnalysis,
    requiredAnchors: pb.requiredAnchors.length,
    coveredAnchors,
    missingSkills,
    missingReasoning,
    missingAnalysis,
    missingAnchors,
    satisfactionPercent,
    status,
  };
  if (pb.slaHours !== undefined) result.slaHours = pb.slaHours;
  return result;
}

export interface ComputeCoverageInput {
  modes: readonly ModeLike[];
  totals: { skills: number; reasoning: number; analysis: number };
}

export function computeCoverage(input: ComputeCoverageInput): CoverageReport {
  const activated = new Set<string>();
  for (const m of input.modes) for (const t of m.taxonomyIds) activated.add(t);

  const anchorsActivated = new Set<string>();
  for (const pb of PLAYBOOKS) {
    const fullyCovered =
      pb.requiredSkills.every((id) => activated.has(id)) &&
      pb.requiredReasoning.every((id) => activated.has(id)) &&
      pb.requiredAnalysis.every((id) => activated.has(id));
    if (fullyCovered) {
      for (const a of pb.requiredAnchors) anchorsActivated.add(a);
    }
  }

  const bySkills = categoryCoverage("skills", activated, input.totals.skills);
  const byReasoning = categoryCoverage("reasoning", activated, input.totals.reasoning);
  const byAnalysis = categoryCoverage("analysis", activated, input.totals.analysis);

  const playbookResults = PLAYBOOKS.map((p) =>
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
    taxonomyIdsActivated: Array.from(activated).sort(),
    anchorIdsActivated: Array.from(anchorsActivated).sort(),
    bySkills,
    byReasoning,
    byAnalysis,
    playbooks: playbookResults,
    playbooksSatisfied: satisfied,
    playbooksPartial: partial,
    playbooksUnmet: unmet,
    overallScore,
  };
}
