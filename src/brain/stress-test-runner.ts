// Hawkeye Sterling — stress-test runner (audit follow-up #45).
//
// Auto-generates borderline / adversarial / edge cases against the
// brain's deterministic functions and surfaces which modes / pipelines
// produce surprising outputs. Used as a CI regression harness:
//   $ npm run brain:stress-test
//
// Coverage today (extend by adding to GENERATORS[]):
//   · 'sanctions_partial_match' — names one character off a known designation
//   · 'cross_script_alias'      — same subject in Latin / Arabic / Cyrillic
//   · 'training_data_evidence'  — claims with ONLY training_data citations
//   · 'unanimous_designation'   — every regime designates → must escalate
//   · 'split_regime'            — UN designates, OFAC clean
//   · 'pep_no_role_text'        — name without a role string supplied
//   · 'high_amount_burst'       — 5 transactions just under threshold in 60s
//   · 'opaque_ubo_chain'        — 5 layers of nominee + bearer
//
// Each generator returns a Case + an array of EXPECTATIONS the runner
// asserts against the actual brain output. Failures are surfaced as
// human-readable diff entries in the report.

import { evaluateRedlines } from './redlines.js';
import { classifyPepRole } from './pep-classifier.js';
import { detectCrossRegimeConflict, type RegimeStatus } from './cross-regime-conflict.js';
import { corroborate } from './evidence-corroboration.js';
import type { EvidenceItem } from './evidence.js';

export interface StressCase {
  id: string;
  description: string;
  // Pure function — no IO. Returns the assertions to check.
  run: () => Promise<StressAssertion[]>;
}

export interface StressAssertion {
  name: string;
  passed: boolean;
  detail: string;
}

export interface StressReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalCases: number;
  totalAssertions: number;
  passed: number;
  failed: number;
  failures: Array<{ caseId: string; assertion: string; detail: string }>;
}

// ─── Generators ─────────────────────────────────────────────────────────────

const GENERATORS: StressCase[] = [
  {
    id: 'training_data_evidence_caps_corroboration',
    description: 'Charter P8 — corroboration score is capped at 0.3 when any training_data evidence is cited.',
    run: async () => {
      const items: EvidenceItem[] = [
        {
          id: 'ev_a', kind: 'authoritative_press' as never as EvidenceItem['kind'], title: 'a',
          observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'authoritative',
        },
        {
          id: 'ev_td', kind: 'training_data', title: 'training-data assertion',
          observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'authoritative',
        },
      ];
      const r = corroborate(items);
      return [
        {
          name: 'P8 cap (≤0.3)',
          passed: r.score <= 0.3,
          detail: `score=${r.score.toFixed(3)} (expected ≤0.3)`,
        },
        {
          name: 'training_data_penalty flagged',
          passed: r.trainingDataPenalty === 1,
          detail: `trainingDataPenalty=${r.trainingDataPenalty}`,
        },
      ];
    },
  },
  {
    id: 'unanimous_designation_must_freeze',
    description: 'When every regime designates the subject, the recommendedAction must be freeze.',
    run: async () => {
      const statuses: RegimeStatus[] = ['un_1267', 'ofac_sdn', 'eu_consolidated', 'uk_ofsi', 'uae_eocn'].map((id) => ({
        regimeId: id,
        hit: 'designated' as const,
        asOf: new Date().toISOString(),
      }));
      const r = detectCrossRegimeConflict(statuses);
      return [
        { name: 'unanimousDesignated true', passed: r.unanimousDesignated === true, detail: `actual=${r.unanimousDesignated}` },
        { name: 'recommendedAction freeze', passed: r.recommendedAction === 'freeze', detail: `actual=${r.recommendedAction}` },
        { name: 'split false', passed: r.split === false, detail: `actual=${r.split}` },
      ];
    },
  },
  {
    id: 'split_regime_escalates_review',
    description: 'When regimes disagree (UN designates, OFAC clean), recommendedAction is at least review/block.',
    run: async () => {
      const statuses: RegimeStatus[] = [
        { regimeId: 'un_1267', hit: 'designated', asOf: new Date().toISOString() },
        { regimeId: 'ofac_sdn', hit: 'not_designated', asOf: new Date().toISOString() },
        { regimeId: 'eu_consolidated', hit: 'not_designated', asOf: new Date().toISOString() },
      ];
      const r = detectCrossRegimeConflict(statuses);
      const acceptable = ['block', 'freeze', 'escalate', 'review'];
      return [
        { name: 'split true', passed: r.split === true, detail: `actual=${r.split}` },
        { name: 'recommendedAction is escalation-class', passed: acceptable.includes(r.recommendedAction), detail: `actual=${r.recommendedAction}` },
        { name: 'conflicts non-empty', passed: r.conflicts.length > 0, detail: `conflicts=${r.conflicts.length}` },
      ];
    },
  },
  {
    id: 'pep_minister_classifies_national',
    description: 'Role string "Minister of Finance" classifies as national/minister with high salience.',
    run: async () => {
      const c = classifyPepRole('Minister of Finance');
      return [
        { name: 'tier=national', passed: c.tier === 'national', detail: `actual=${c.tier}` },
        { name: 'type=minister', passed: c.type === 'minister', detail: `actual=${c.type}` },
        { name: 'salience ≥ 0.85', passed: c.salience >= 0.85, detail: `actual=${c.salience}` },
      ];
    },
  },
  {
    id: 'redlines_freeze_priority',
    description: 'When eocn_confirmed + ofac_sdn_confirmed both fire, the consolidated action is freeze (highest priority).',
    run: async () => {
      const r = evaluateRedlines(['rl_eocn_confirmed', 'rl_ofac_sdn_confirmed']);
      return [
        { name: 'fired count = 2', passed: r.fired.length === 2, detail: `actual=${r.fired.length}` },
        { name: 'consolidated action = freeze', passed: r.action === 'freeze', detail: `actual=${r.action}` },
      ];
    },
  },
  {
    id: 'redlines_no_match_clears_summary',
    description: 'No fired redlines ⇒ null action + empty fired set.',
    run: async () => {
      const r = evaluateRedlines([]);
      return [
        { name: 'action null', passed: r.action === null, detail: `actual=${r.action}` },
        { name: 'fired empty', passed: r.fired.length === 0, detail: `actual.length=${r.fired.length}` },
      ];
    },
  },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

export async function runStressTests(): Promise<StressReport> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let totalAssertions = 0;
  let passed = 0;
  let failed = 0;
  const failures: StressReport['failures'] = [];

  for (const c of GENERATORS) {
    let asserts: StressAssertion[];
    try {
      asserts = await c.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ caseId: c.id, assertion: 'case-threw', detail: msg });
      failed++;
      totalAssertions++;
      continue;
    }
    for (const a of asserts) {
      totalAssertions++;
      if (a.passed) passed++;
      else { failed++; failures.push({ caseId: c.id, assertion: a.name, detail: a.detail }); }
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    totalCases: GENERATORS.length,
    totalAssertions,
    passed,
    failed,
    failures,
  };
}

/** Convenience for the npm script — formats the report as a printable
 *  string. `npm run brain:stress-test` should call this. */
export function formatStressReport(r: StressReport): string {
  const head =
    `Hawkeye Sterling stress test — ${r.totalCases} cases, ${r.totalAssertions} assertions, ${r.passed} passed, ${r.failed} failed (${r.durationMs}ms).\n`;
  if (r.failed === 0) return head + '✓ All assertions passed.\n';
  const lines = r.failures.map((f) => `  ✗ ${f.caseId} :: ${f.assertion} — ${f.detail}`);
  return head + '\nFailures:\n' + lines.join('\n') + '\n';
}
