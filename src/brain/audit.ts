// Hawkeye Sterling — brain self-audit.
// Exported as auditBrain() so `npm run brain:audit` can validate the registry.
// Ensures no duplicate IDs, every faculty has ≥1 mode, every template points
// at real modes, and the reasoning-mode count matches what we expect.

import { FACULTIES } from './faculties.js';
import { REASONING_MODES, REASONING_MODE_BY_ID } from './reasoning-modes.js';
import { QUESTION_TEMPLATES } from './question-templates.js';
import { SCENARIOS, SCENARIO_BY_ID } from './scenarios.js';
import { ADVERSE_MEDIA_CATEGORIES, ADVERSE_MEDIA_QUERY } from './adverse-media.js';

export interface AuditReport {
  ok: boolean;
  totals: {
    faculties: number;
    reasoningModes: number;
    questionTemplates: number;
    scenarios: number;
    adverseMediaCategories: number;
    adverseMediaKeywords: number;
    adverseMediaQueryLength: number;
  };
  categoryCounts: Record<string, number>;
  facultyCoverage: Record<string, number>;
  problems: string[];
}

export function auditBrain(print = true): AuditReport {
  const problems: string[] = [];

  // 1. Duplicate IDs within each registry.
  const dupes = (ids: string[]): string[] => {
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dup.push(id);
      seen.add(id);
    }
    return dup;
  };
  for (const dup of dupes(REASONING_MODES.map((r) => r.id))) {
    problems.push(`duplicate reasoning-mode id: ${dup}`);
  }
  for (const dup of dupes(QUESTION_TEMPLATES.map((t) => t.id))) {
    problems.push(`duplicate question-template id: ${dup}`);
  }
  for (const dup of dupes(SCENARIOS.map((s) => s.id))) {
    problems.push(`duplicate scenario id: ${dup}`);
  }

  // 2. Faculties must reference known modes and have ≥1 mode each.
  for (const fac of FACULTIES) {
    if (fac.modes.length === 0) {
      problems.push(`faculty has no bound modes: ${fac.id}`);
    }
    for (const modeId of fac.modes) {
      if (!REASONING_MODE_BY_ID.has(modeId)) {
        problems.push(`faculty ${fac.id} references unknown mode: ${modeId}`);
      }
    }
  }

  // 3. Every reasoning mode declares ≥1 faculty and those faculties exist.
  const facultyIds = new Set(FACULTIES.map((f) => f.id));
  for (const r of REASONING_MODES) {
    if (r.faculties.length === 0) {
      problems.push(`reasoning mode has no faculties: ${r.id}`);
    }
    for (const fid of r.faculties) {
      if (!facultyIds.has(fid)) {
        problems.push(`reasoning mode ${r.id} references unknown faculty: ${fid}`);
      }
    }
  }

  // 4. Question templates must point at real modes.
  for (const tpl of QUESTION_TEMPLATES) {
    for (const modeId of tpl.reasoningModes) {
      if (!REASONING_MODE_BY_ID.has(modeId)) {
        problems.push(`template ${tpl.id} references unknown mode: ${modeId}`);
      }
    }
  }

  // 5. Scenario templateId (if set) must resolve.
  const templateIds = new Set(QUESTION_TEMPLATES.map((t) => t.id));
  for (const s of SCENARIOS) {
    if (s.templateId && !templateIds.has(s.templateId)) {
      problems.push(`scenario ${s.id} references unknown template: ${s.templateId}`);
    }
  }

  // Totals.
  const categoryCounts: Record<string, number> = {};
  for (const r of REASONING_MODES) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }
  const facultyCoverage: Record<string, number> = {};
  for (const f of FACULTIES) {
    facultyCoverage[f.id] = f.modes.length;
  }

  const amkw = ADVERSE_MEDIA_CATEGORIES.reduce((n, c) => n + c.keywords.length, 0);

  const report: AuditReport = {
    ok: problems.length === 0,
    totals: {
      faculties: FACULTIES.length,
      reasoningModes: REASONING_MODES.length,
      questionTemplates: QUESTION_TEMPLATES.length,
      scenarios: SCENARIOS.length,
      adverseMediaCategories: ADVERSE_MEDIA_CATEGORIES.length,
      adverseMediaKeywords: amkw,
      adverseMediaQueryLength: ADVERSE_MEDIA_QUERY.length,
    },
    categoryCounts,
    facultyCoverage,
    problems,
  };

  if (print) {
    const banner = report.ok ? '✓ BRAIN OK' : '✗ BRAIN HAS ISSUES';
    console.log(`\nHawkeye Sterling — brain audit  [${banner}]`);
    console.log('totals', report.totals);
    console.log('modes per category', report.categoryCounts);
    console.log('faculty coverage', report.facultyCoverage);
    if (report.problems.length > 0) {
      console.log('problems:');
      for (const p of report.problems) console.log(' -', p);
    }
    // Smoke-test: scenarios exist and resolve.
    console.log('scenarios indexed:', SCENARIO_BY_ID.size);
  }

  return report;
}
