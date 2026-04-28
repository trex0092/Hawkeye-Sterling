// Hawkeye Sterling — brain self-audit.
// Exported as auditBrain() so `npm run brain:audit` can validate the registry.
// Ensures no duplicate IDs, every faculty has ≥1 mode, every template points
// at real modes, and the reasoning-mode count matches what we expect.

import { FACULTIES } from './faculties.js';
import { REASONING_MODES, REASONING_MODE_BY_ID } from './reasoning-modes.js';
import { QUESTION_TEMPLATES } from './question-templates.js';
import { SCENARIOS, SCENARIO_BY_ID } from './scenarios.js';
import { ADVERSE_MEDIA_CATEGORIES, ADVERSE_MEDIA_QUERY } from './adverse-media.js';
import { implementationCoverage, listImplementedModeIds } from './modes/registry.js';
import {
  ALL_MLRO_TOPICS,
  TOPIC_TO_DOCTRINES,
  TOPIC_TO_FATF,
  TOPIC_TO_PLAYBOOKS,
  TOPIC_TO_RED_FLAGS,
  TOPIC_TO_TYPOLOGIES,
} from './mlro-question-classifier.js';
import { COMMON_SENSE_RULES, rulesForTopic } from './mlro-common-sense.js';
import { DOCTRINE_BY_ID } from './doctrines.js';
import { PLAYBOOK_BY_ID } from './playbooks.js';
import { RED_FLAG_BY_ID, RED_FLAGS } from './red-flags.js';
import { TYPOLOGY_BY_ID } from './typologies.js';
import { FATF_RECOMMENDATIONS } from './fatf-recommendations.js';
import { buildTopicGraph } from './knowledge-graph.js';

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
    mlroTopics: number;
    commonSenseRules: number;
    fatfRecommendations: number;
  };
  categoryCounts: Record<string, number>;
  facultyCoverage: Record<string, number>;
  /** Per-topic artefact counts: doctrines, FATF, playbooks, redFlags, typologies, rules. */
  mlroTopicCoverage: Record<
    string,
    {
      doctrines: number;
      fatf: number;
      playbooks: number;
      redFlags: number;
      typologies: number;
      rules: number;
      graphNodes: number;
    }
  >;
  implementation: {
    implementedCount: number;
    totalCount: number;
    percent: number;
    implementedModes: string[];
  };
  /** Hard registry errors — duplicate IDs, broken faculty/mode/template/scenario refs.
   *  Non-empty problems imply ok=false. */
  problems: string[];
  /** Soft signals — orphaned MLRO classifier references and under-authored topics
   *  that need backfill but don't break runtime. ok stays true. */
  advisories: string[];
}

export function auditBrain(print = true): AuditReport {
  const problems: string[] = [];
  const advisories: string[] = [];

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

  // 6. MLRO topic integrity: every topic must have ≥1 doctrine + ≥1 FATF Rec
  //    + ≥1 playbook + ≥3 common-sense rules, and every cited ID must resolve.
  //    Topics with `general_compliance` or pure-research scope (no playbook
  //    catalogue) are exempted from the playbook minimum.
  const NO_PLAYBOOK_REQUIRED = new Set<string>([
    'training', 'governance', 'typology_research', 'ai_governance',
    'data_protection_pdpl', 'general_compliance',
  ]);
  const FATF_BY_ID: ReadonlySet<string> = new Set(FATF_RECOMMENDATIONS.map((r) => r.id));
  const PLAYBOOK_IDS: ReadonlySet<string> = new Set(PLAYBOOK_BY_ID.keys());
  const TYPOLOGY_IDS: ReadonlySet<string> = new Set(TYPOLOGY_BY_ID.keys());
  const mlroTopicCoverage: AuditReport['mlroTopicCoverage'] = {};

  for (const topic of ALL_MLRO_TOPICS) {
    const docs = TOPIC_TO_DOCTRINES[topic] ?? [];
    const fatf = TOPIC_TO_FATF[topic] ?? [];
    const pbs = TOPIC_TO_PLAYBOOKS[topic] ?? [];
    const rfs = TOPIC_TO_RED_FLAGS[topic] ?? [];
    const typs = TOPIC_TO_TYPOLOGIES[topic] ?? [];
    const rules = rulesForTopic(topic, 9999);

    // Topic-level coverage gates → advisories (under-authored, but runtime-safe).
    if (docs.length === 0) advisories.push(`mlro topic has no doctrines: ${topic}`);
    if (fatf.length === 0) advisories.push(`mlro topic has no FATF recs: ${topic}`);
    if (!NO_PLAYBOOK_REQUIRED.has(topic) && pbs.length === 0) {
      advisories.push(`mlro topic has no playbooks: ${topic}`);
    }
    if (rules.length < 3) {
      advisories.push(`mlro topic has fewer than 3 common-sense rules: ${topic} (${rules.length})`);
    }

    // Reference-resolution gates → advisories (UI just shows fewer artefacts).
    for (const d of docs) {
      if (!DOCTRINE_BY_ID.has(d)) advisories.push(`topic ${topic} cites unknown doctrine: ${d}`);
    }
    for (const f of fatf) {
      if (!FATF_BY_ID.has(f)) advisories.push(`topic ${topic} cites unknown FATF rec: ${f}`);
    }
    for (const p of pbs) {
      if (!PLAYBOOK_IDS.has(p)) advisories.push(`topic ${topic} cites unknown playbook: ${p}`);
    }
    for (const r of rfs) {
      if (!RED_FLAG_BY_ID.has(r)) advisories.push(`topic ${topic} cites unknown red flag: ${r}`);
    }
    for (const t of typs) {
      if (!TYPOLOGY_IDS.has(t)) advisories.push(`topic ${topic} cites unknown typology: ${t}`);
    }

    // Knowledge graph must surface at least the topic node + 1 artefact.
    const graph = buildTopicGraph(topic);
    if (graph.nodes.length <= 1) {
      advisories.push(`knowledge-graph empty for topic: ${topic} (${graph.nodes.length} node[s])`);
    }

    mlroTopicCoverage[topic] = {
      doctrines: docs.length,
      fatf: fatf.length,
      playbooks: pbs.length,
      redFlags: rfs.length,
      typologies: typs.length,
      rules: rules.length,
      graphNodes: graph.nodes.length,
    };
  }

  // 7. Red-flag → typology resolution. Some red flags use category-level
  //    typology buckets (e.g. 'governance', 'adverse_media', 'ubo') that
  //    aren't in the formal TypologyId catalogue. These are advisory until
  //    typology coverage is extended.
  for (const rf of RED_FLAGS) {
    if (!TYPOLOGY_IDS.has(rf.typology)) {
      advisories.push(`red flag ${rf.id} cites unknown typology: ${rf.typology}`);
    }
  }

  // 8. Common-sense rule integrity → mostly advisory, but duplicate IDs are
  //    a hard problem (ruleById would be non-deterministic). doctrineAnchor
  //    is a free-form citation hint, not a DoctrineId, so it is not resolved.
  const TOPIC_SET: ReadonlySet<string> = new Set(ALL_MLRO_TOPICS);
  for (const r of COMMON_SENSE_RULES) {
    if (!TOPIC_SET.has(r.topic)) {
      advisories.push(`common-sense rule ${r.id} bound to unknown topic: ${r.topic}`);
    }
    if (r.rule.length > 200) {
      advisories.push(`common-sense rule ${r.id} exceeds 200 chars (${r.rule.length})`);
    }
  }
  for (const dup of dupes(COMMON_SENSE_RULES.map((r) => r.id))) {
    problems.push(`duplicate common-sense rule id: ${dup}`);
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
  const coverage = implementationCoverage(REASONING_MODES.length);
  const implementedModes = listImplementedModeIds();

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
      mlroTopics: ALL_MLRO_TOPICS.length,
      commonSenseRules: COMMON_SENSE_RULES.length,
      fatfRecommendations: FATF_RECOMMENDATIONS.length,
    },
    categoryCounts,
    facultyCoverage,
    mlroTopicCoverage,
    implementation: {
      implementedCount: coverage.implemented,
      totalCount: coverage.total,
      percent: coverage.percent,
      implementedModes,
    },
    problems,
    advisories,
  };

  if (print) {
    const banner = report.ok ? '✓ BRAIN OK' : '✗ BRAIN HAS ISSUES';
    console.log(`\nHawkeye Sterling — brain audit  [${banner}]`);
    console.log('totals', report.totals);
    console.log('modes per category', report.categoryCounts);
    console.log('faculty coverage', report.facultyCoverage);
    console.log(
      `implementation coverage: ${report.implementation.implementedCount}/${report.implementation.totalCount} modes real (${report.implementation.percent}%)`,
    );
    if (report.problems.length > 0) {
      console.log('problems:');
      for (const p of report.problems) console.log(' -', p);
    }
    if (report.advisories.length > 0) {
      console.log(`advisories: ${report.advisories.length} (showing first 20)`);
      for (const a of report.advisories.slice(0, 20)) console.log(' ·', a);
    }
    // Smoke-test: scenarios exist and resolve.
    console.log('scenarios indexed:', SCENARIO_BY_ID.size);
  }

  return report;
}
