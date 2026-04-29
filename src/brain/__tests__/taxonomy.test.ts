import { describe, expect, it } from "vitest";
import {
  ANALYSIS,
  REASONING,
  SKILLS,
  TAXONOMY,
  byCategory,
  searchTaxonomy,
  slugifyTaxonomyName,
} from "../taxonomy.js";
import { ANCHORS, anchorsByFamily } from "../anchors.js";
import { REGULATORY_PLAYBOOKS as PLAYBOOKS, taxId } from "../regulatory-playbooks.js";
import { computeCoverage } from "../coverage.js";

describe("taxonomy", () => {
  it("populates all three categories with at least 100 entries each (except deep)", () => {
    expect(SKILLS.length).toBeGreaterThan(100);
    expect(REASONING.length).toBeGreaterThan(100);
    expect(ANALYSIS.length).toBeGreaterThan(100);
  });

  it("emits deterministic, unique slug IDs", () => {
    const ids = new Set<string>();
    for (const e of TAXONOMY) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.id).toBe(`${e.category}-${slugifyTaxonomyName(e.name)}`);
    }
  });

  it("slugifies FATF R.10 style references correctly", () => {
    expect(slugifyTaxonomyName("FATF R.10")).toBe("fatf-r-10");
    expect(slugifyTaxonomyName("Likelihood & Impact Assessment")).toBe(
      "likelihood-and-impact-assessment",
    );
    expect(slugifyTaxonomyName("LBMA RGG Steps 1-5")).toBe("lbma-rgg-steps-1-5");
  });

  it("byCategory returns the matching frozen array", () => {
    expect(byCategory("skills")).toBe(SKILLS);
    expect(byCategory("reasoning")).toBe(REASONING);
    expect(byCategory("analysis")).toBe(ANALYSIS);
  });

  it("searchTaxonomy is case-insensitive and substring", () => {
    const results = searchTaxonomy("CAHRA");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.name.toLowerCase()).toContain("cahra");
  });
});

describe("anchors", () => {
  it("has at least 30 anchors across FATF + UAE + LBMA families", () => {
    expect(ANCHORS.length).toBeGreaterThanOrEqual(30);
    expect(anchorsByFamily("FATF").length).toBeGreaterThan(0);
    expect(anchorsByFamily("UAE-FDL").length).toBeGreaterThan(0);
    expect(anchorsByFamily("LBMA").length).toBe(5);
  });

  it("emits unique anchor IDs with anchor- prefix", () => {
    const ids = new Set<string>();
    for (const a of ANCHORS) {
      expect(a.id.startsWith("anchor-")).toBe(true);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
    }
  });
});

describe("playbooks", () => {
  it("every required-taxonomy ID resolves to a real taxonomy entry", () => {
    const valid = new Set(TAXONOMY.map((e) => e.id));
    for (const d of PLAYBOOKS) {
      for (const id of d.requiredSkills)    expect(valid.has(id), `${d.id} refs ${id}`).toBe(true);
      for (const id of d.requiredReasoning) expect(valid.has(id), `${d.id} refs ${id}`).toBe(true);
      for (const id of d.requiredAnalysis)  expect(valid.has(id), `${d.id} refs ${id}`).toBe(true);
    }
  });

  it("every required anchor ID resolves to a real anchor", () => {
    const valid = new Set(ANCHORS.map((a) => a.id));
    for (const d of PLAYBOOKS) {
      for (const id of d.requiredAnchors) {
        expect(valid.has(id), `${d.id} refs ${id}`).toBe(true);
      }
    }
  });

  it("taxId helper composes category + slug correctly", () => {
    expect(taxId("skills", "UBO Tracing")).toBe("skills-ubo-tracing");
    expect(taxId("reasoning", "MLRO Judgment")).toBe("reasoning-mlro-judgment");
  });
});

describe("coverage engine", () => {
  const totals = { skills: SKILLS.length, reasoning: REASONING.length, analysis: ANALYSIS.length };

  it("returns 0% with no modes selected", () => {
    const report = computeCoverage({ modes: [], totals });
    expect(report.bySkills.coveredCount).toBe(0);
    expect(report.playbooksSatisfied).toBe(0);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("computes per-category coverage from mode taxonomyIds", () => {
    const modes = [
      {
        id: "RM-115",
        taxonomyIds: [
          taxId("skills", "UBO Tracing"),
          taxId("reasoning", "Beneficial Owner Tracing Logic"),
          taxId("analysis", "UBO Beneficial Ownership Mapping"),
        ],
      },
    ];
    const report = computeCoverage({ modes, totals });
    expect(report.bySkills.coveredCount).toBe(1);
    expect(report.byReasoning.coveredCount).toBe(1);
    expect(report.byAnalysis.coveredCount).toBe(1);
  });

  it("marks a playbook satisfied when all required entries are activated", () => {
    const playbook = PLAYBOOKS.find((d) => d.id === "playbook-ubo-opaque");
    expect(playbook).toBeDefined();
    if (!playbook) return;
    const modes = [
      {
        id: "synthetic-full-coverage",
        taxonomyIds: [
          ...playbook.requiredSkills,
          ...playbook.requiredReasoning,
          ...playbook.requiredAnalysis,
        ],
      },
    ];
    const report = computeCoverage({ modes, totals });
    const result = report.playbooks.find((d) => d.playbookId === "playbook-ubo-opaque");
    expect(result?.status).toBe("satisfied");
    expect(result?.satisfactionPercent).toBeGreaterThanOrEqual(95);
  });

  it("marks playbooks unmet when nothing is activated", () => {
    const report = computeCoverage({ modes: [], totals });
    for (const d of report.playbooks) {
      expect(d.satisfactionPercent).toBeLessThan(40);
      expect(d.status).toBe("unmet");
    }
  });
});
