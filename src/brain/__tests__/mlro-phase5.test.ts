import { describe, expect, it } from 'vitest';
import { diffResults } from '../mlro-reasoning-diff.js';
import { proposeDisposition } from '../mlro-auto-dispositioner.js';
import { composeSystemPrompt } from '../mlro-prefix-composer.js';
import { buildContext } from '../mlro-context-builder.js';
import { charterDiff } from '../mlro-charter-diff.js';
import { buildTelemetryEvent, InMemorySink, emitTelemetry } from '../mlro-telemetry.js';
import { benchmarkCase } from '../mlro-peer-benchmark.js';

const baseline = {
  narrative: '== FINDINGS ==\nNo confirmed hits against UN or OFAC.\nCite FDL 10/2025 Art.20.',
  sections: {
    FINDINGS: 'No confirmed hits against UN or OFAC.',
    SCOPE_DECLARATION: 'UN EOCN OFAC as of 2026-04-22.',
  },
  stepResults: [
    { modeId: 'data', text: 'data draft', ok: true, partial: false, elapsedMs: 800 },
    { modeId: 'reflective', text: 'reflective pass', ok: true, partial: false, elapsedMs: 1200 },
  ],
};

describe('mlro-reasoning-diff', () => {
  it('reports unchanged when inputs match', () => {
    const d = diffResults(baseline, baseline);
    expect(d.materialChange).toBe(false);
    expect(d.sections.every((s) => s.status === 'unchanged')).toBe(true);
  });

  it('detects changed section, citation delta, and reorder', () => {
    const b2 = {
      ...baseline,
      narrative: '== FINDINGS ==\nPartial match against EOCN. Cite FDL 10/2025 Art.21 and CR 74/2020.',
      sections: {
        FINDINGS: 'Partial match against EOCN.',
        SCOPE_DECLARATION: 'UN EOCN OFAC as of 2026-04-22.',
      },
      stepResults: [
        { modeId: 'reflective', text: 'new', ok: true, partial: false, elapsedMs: 1400 },
        { modeId: 'data', text: 'new', ok: true, partial: false, elapsedMs: 900 },
      ],
    };
    const d = diffResults(baseline, b2);
    expect(d.materialChange).toBe(true);
    expect(d.modes.reordered).toBe(true);
    expect(d.citations.added.length + d.citations.removed.length).toBeGreaterThan(0);
    expect(d.sections.find((s) => s.section === 'FINDINGS')!.status).toBe('changed');
  });
});

describe('mlro-auto-dispositioner', () => {
  it('tipping-off signal maps to D08 (exit)', () => {
    const p = proposeDisposition({
      partial: false, charterAllowed: false, tippingOffMatches: 1, structuralIssues: [],
      narrative: '', firedRedlineIds: ['rl_tipping_off_draft'],
    });
    expect(p.code).toBe('D08_exit_relationship');
  });

  it('confirmed EOCN redline maps to D05 (FFR)', () => {
    const p = proposeDisposition({
      partial: false, charterAllowed: true, tippingOffMatches: 0, structuralIssues: [],
      narrative: 'Confirmed EOCN match. Freeze.', firedRedlineIds: ['rl_eocn_confirmed'],
    });
    expect(p.code).toBe('D05_frozen_ffr');
  });

  it('partial pipeline maps to D03 (EDD)', () => {
    const p = proposeDisposition({
      partial: true, charterAllowed: true, tippingOffMatches: 0, structuralIssues: [],
      narrative: '', firedRedlineIds: [],
    });
    expect(p.code).toBe('D03_edd_required');
  });

  it('no-match narrative maps to D00', () => {
    const p = proposeDisposition({
      partial: false, charterAllowed: true, tippingOffMatches: 0, structuralIssues: [],
      narrative: 'No match against declared scope UN + OFAC + EOCN.', firedRedlineIds: [],
    });
    expect(p.code).toBe('D00_no_match');
  });
});

describe('mlro-prefix-composer', () => {
  it('includes the charter + chained prefixes for known modes', () => {
    const c = composeSystemPrompt(['bayesian', 'reflective'], { taskRole: 'Review this subject.', audience: 'regulator' });
    expect(c.system).toMatch(/COMPLIANCE & OPERATIONAL ADVISORY INTELLIGENCE/);
    expect(c.system).toMatch(/CHAINED REASONING MODES/);
    expect(c.modesApplied).toEqual(expect.arrayContaining(['bayesian', 'reflective']));
    expect(c.charterHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('surfaces missing prefixes for unknown mode ids', () => {
    const c = composeSystemPrompt(['definitely_not_a_real_mode']);
    expect(c.modesMissingPrefix).toEqual(['definitely_not_a_real_mode']);
  });
});

describe('mlro-context-builder', () => {
  it('detects PEP from roles + crypto from wallets', () => {
    const ctx = buildContext({
      caseId: 'HWK-01F-20260422-ABC12',
      subjectName: 'Test Subject',
      roles: ['Minister of Interior'],
      wallets: ['0x' + 'a'.repeat(40)],
      businessActivity: 'Precious metals retail',
    });
    expect(ctx.signals.hasPep).toBe(true);
    expect(ctx.signals.hasCrypto).toBe(true);
    expect(ctx.signals.sector).toBe('dpms');
    expect(ctx.scope.listsChecked).toEqual(expect.arrayContaining(['un_1267', 'uae_eocn']));
  });

  it('flags structuring when ≥3 transactions land in the 45–55k band', () => {
    const ctx = buildContext({
      caseId: 'x', subjectName: 'y',
      transactions: [
        { amountAed: 49000, channel: 'cash' },
        { amountAed: 51000, channel: 'cash' },
        { amountAed: 52000, channel: 'cash' },
      ],
    });
    expect(ctx.signals.structuring).toBe(true);
    expect(ctx.signals.hasCash).toBe(true);
  });
});

describe('mlro-charter-diff', () => {
  it('passes a clean narrative', () => {
    const d = charterDiff('FINDINGS: no confirmed hits against UN + OFAC + EOCN. Scope declared 2026-04-22.');
    expect(d.allowed).toBe(true);
    expect(d.failed.length).toBe(0);
  });

  it('catches tipping-off + legal-conclusion phrasing', () => {
    const d = charterDiff('We have filed an STR against you. Your conduct amounts to money laundering.');
    expect(d.allowed).toBe(false);
    expect(d.failed.some((f) => f.id === 'P4')).toBe(true);
    expect(d.failed.some((f) => f.id === 'P3')).toBe(true);
  });

  it('allows a "no match" verdict when scope is declared', () => {
    const d = charterDiff('SCOPE_DECLARATION: UN, EOCN, OFAC lists @ 2026-04-22.\n\nFINDINGS: No match.');
    expect(d.failed.find((f) => f.id === 'P7')).toBeUndefined();
  });
});

describe('mlro-telemetry', () => {
  it('buildTelemetryEvent computes ok/partial/failed counters', () => {
    const e = buildTelemetryEvent({
      caseId: 'c', runId: 'r', modes: ['data'], elapsedMs: 12000, budgetMs: 25000,
      partial: false,
      stepResults: [
        { ok: true, partial: false },
        { ok: false, partial: true },
        { ok: false, partial: false },
      ],
      charterAllowed: true, charterFailedProhibitions: [],
      tippingOffMatches: 0, structuralIssues: 0,
      charterHash: 'deadbeef',
    });
    expect(e.stepsOk).toBe(1);
    expect(e.stepsPartial).toBe(1);
    expect(e.stepsFailed).toBe(1);
    expect(e.budgetUtilisation).toBeCloseTo(12000 / 25000, 3);
  });

  it('InMemorySink records events and caps at capacity', async () => {
    const sink = new InMemorySink(3);
    for (let i = 0; i < 5; i++) {
      await emitTelemetry(sink.push, {
        at: '2026-04-22T00:00:00Z', caseId: 'c', runId: 'r' + i, modes: [], elapsedMs: 0, budgetMs: 0,
        budgetUtilisation: 0, partial: false, stepsTotal: 0, stepsOk: 0, stepsPartial: 0, stepsFailed: 0,
        charterAllowed: true, charterFailedProhibitions: [], tippingOffMatches: 0, structuralIssues: 0,
        charterHash: 'x',
      });
    }
    expect(sink.size()).toBe(3);
  });
});

describe('mlro-peer-benchmark', () => {
  it('flags extreme outliers in DPMS retail', () => {
    const r = benchmarkCase('dpms_retail', [
      { dimension: 'monthly_turnover_aed', observed: 50_000_000 }, // way above mean 1M
      { dimension: 'cash_share_pct', observed: 55 },               // at baseline
    ]);
    expect(r.rows.find((x) => x.dimension === 'monthly_turnover_aed')!.classification).toBe('extreme');
    expect(r.rows.find((x) => x.dimension === 'cash_share_pct')!.classification).toBe('normal');
    expect(r.extremeCount).toBeGreaterThanOrEqual(1);
  });

  it('marks unknown dimensions as unknown without crashing', () => {
    const r = benchmarkCase('vasp', [{ dimension: 'nonsense', observed: 42 }]);
    expect(r.rows[0]!.classification).toBe('unknown');
  });
});
