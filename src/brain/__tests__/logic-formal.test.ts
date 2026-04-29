import { describe, expect, it } from 'vitest';
import { LOGIC_FORMAL_MODE_APPLIES } from '../modes/logic_formal.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return { run: { id: 'r-lf', startedAt: Date.now() }, subject: { name: 'Test', type: 'entity' }, evidence: evidence as BrainContext['evidence'], priorFindings: [], domains: ['cdd'] };
}

describe('syllogistic', () => {
  it('inconclusive without syllogism', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.syllogistic!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing middle term', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.syllogistic!(makeCtx({
      syllogism: { majorPremise: 'All X are Y', minorPremise: 'All Z are W', conclusion: 'therefore X', middleTermPresent: false, figureValid: false, sourceRef: 's-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags invalid figure', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.syllogistic!(makeCtx({
      syllogism: { majorPremise: 'All M are P', minorPremise: 'All M are S', conclusion: 'All S are P', middleTermPresent: true, figureValid: false, sourceRef: 's-2' },
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on valid syllogism', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.syllogistic!(makeCtx({
      syllogism: { majorPremise: 'All PEPs are high risk', minorPremise: 'Subject is a PEP', conclusion: 'Subject is high risk', middleTermPresent: true, figureValid: true, sourceRef: 's-3' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('propositional_logic', () => {
  it('inconclusive without set', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.propositional_logic!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on contradiction', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.propositional_logic!(makeCtx({
      propositionalSet: {
        propositions: [{ id: 'P1', statement: 'Entity is sanctioned', value: true }, { id: 'P2', statement: 'Entity is not sanctioned', value: false }],
        contradictionPairs: [['P1', 'P2']],
        sourceRef: 'pl-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on consistent propositions', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.propositional_logic!(makeCtx({
      propositionalSet: { propositions: [{ id: 'P1', statement: 'Entity is clear', value: true }], contradictionPairs: [], sourceRef: 'pl-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('probabilistic_logic', () => {
  it('inconclusive without probe', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.probabilistic_logic!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when AND upper bound exceeds threshold', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.probabilistic_logic!(makeCtx({
      probLogicProbe: { events: [{ id: 'E1', probability: 0.9, label: 'A' }, { id: 'E2', probability: 0.95, label: 'B' }], jointQuery: 'AND', thresholdMin: 0.1, thresholdMax: 0.5, sourceRef: 'prob-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when AND upper bound within threshold', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.probabilistic_logic!(makeCtx({
      // P(A)=0.7, P(B)=0.8 → AND lower=0.5, upper=0.7 — both within [0.05, 0.8]
      probLogicProbe: { events: [{ id: 'E1', probability: 0.7, label: 'A' }, { id: 'E2', probability: 0.8, label: 'B' }], jointQuery: 'AND', thresholdMin: 0.05, thresholdMax: 0.8, sourceRef: 'prob-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('modal_logic', () => {
  it('inconclusive without claims', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.modal_logic!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags unjustified necessity claim', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.modal_logic!(makeCtx({
      modalClaims: [{ claim: 'This must be money laundering', modality: 'necessary', justification: null, evidenceBasis: 'none', sourceRef: 'm-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on well-evidenced modality', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.modal_logic!(makeCtx({
      modalClaims: [{ claim: 'The transfer is possibly legitimate', modality: 'possible', justification: 'trade docs present', evidenceBasis: 'strong', sourceRef: 'm-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('deontic_logic', () => {
  it('inconclusive without norms', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.deontic_logic!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on obligation violation', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.deontic_logic!(makeCtx({
      deonticNorms: [{ id: 'N1', normType: 'obligation', subject: 'MLRO', action: 'file STR within 30 days', satisfied: false, conflictsWith: [], sourceRef: 'd-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags normative conflict', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.deontic_logic!(makeCtx({
      deonticNorms: [
        { id: 'N1', normType: 'obligation', subject: 'bank', action: 'share data', satisfied: true, conflictsWith: ['N2'], sourceRef: 'd-2' },
        { id: 'N2', normType: 'prohibition', subject: 'bank', action: 'share data', satisfied: null, conflictsWith: ['N1'], sourceRef: 'd-3' },
      ],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears when all norms satisfied', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.deontic_logic!(makeCtx({
      deonticNorms: [{ id: 'N1', normType: 'obligation', subject: 'MLRO', action: 'file STR', satisfied: true, conflictsWith: [], sourceRef: 'd-4' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('rogerian', () => {
  it('inconclusive without argument', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.rogerian!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when most elements missing', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.rogerian!(makeCtx({
      rogerianArgument: { opponentPositionAcknowledged: false, commonGroundIdentified: false, commonGroundItems: [], ownPositionStatement: null, proposedSolution: null, sourceRef: 'r-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on complete Rogerian structure', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.rogerian!(makeCtx({
      rogerianArgument: { opponentPositionAcknowledged: true, commonGroundIdentified: true, commonGroundItems: ['data accuracy', 'client protection'], ownPositionStatement: 'EDD required', proposedSolution: 'phased EDD with client', sourceRef: 'r-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('stare_decisis', () => {
  it('inconclusive without bindings', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.stare_decisis!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on mandatory precedent not followed', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.stare_decisis!(makeCtx({
      precedentBindings: [{ caseRef: 'XYZ v FIU [2023]', bindingType: 'mandatory', followed: false, distinguished: false, sourceRef: 'sd-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on followed mandatory precedent', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.stare_decisis!(makeCtx({
      precedentBindings: [{ caseRef: 'XYZ v FIU [2023]', bindingType: 'mandatory', followed: true, distinguished: false, sourceRef: 'sd-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('gray_zone_resolution', () => {
  it('inconclusive without scenario', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.gray_zone_resolution!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on high conflict with no rationale', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.gray_zone_resolution!(makeCtx({
      grayZoneScenario: { question: 'Is this a DPMS?', applicableRules: ['FDL 20/2018', 'CBUAE circular'], conflictingInterpretations: ['yes', 'no', 'partial'], regulatoryGuidanceAvailable: false, resolvedByAnalogy: false, resolutionRationale: null, sourceRef: 'gz-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when resolved with rationale', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.gray_zone_resolution!(makeCtx({
      grayZoneScenario: { question: 'Is this a DPMS?', applicableRules: ['FDL 20/2018'], conflictingInterpretations: [], regulatoryGuidanceAvailable: true, resolvedByAnalogy: false, resolutionRationale: 'CBUAE guidance note 2023 applies', sourceRef: 'gz-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('craac', () => {
  it('inconclusive without memo', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.craac!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing contention and rule', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.craac!(makeCtx({
      craacMemo: { contention: null, rule: null, analysis: 'some analysis', application: 'some app', conclusion: 'yes', sourceRef: 'cr-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on complete CRAAC', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.craac!(makeCtx({
      craacMemo: { contention: 'EDD required', rule: 'Art.13 FDL', analysis: 'PEP triggers EDD', application: 'Subject is PEP', conclusion: 'EDD required', sourceRef: 'cr-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('pestle', () => {
  it('inconclusive without items', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.pestle!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on critical factor', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.pestle!(makeCtx({
      pestleItems: [{ dimension: 'legal', factor: 'pending enforcement action', riskLevel: 'critical', sourceRef: 'pe-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on all low-risk factors', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.pestle!(makeCtx({
      pestleItems: [
        { dimension: 'political', factor: 'stable govt', riskLevel: 'low', sourceRef: 'pe-2' },
        { dimension: 'economic', factor: 'growing GDP', riskLevel: 'low', sourceRef: 'pe-3' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('steep', () => {
  it('inconclusive without items', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.steep!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on critical factor', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.steep!(makeCtx({
      steepItems: [{ dimension: 'political', factor: 'sanctions regime shift', riskLevel: 'critical', sourceRef: 'st-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on all low risk', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.steep!(makeCtx({
      steepItems: [{ dimension: 'social', factor: 'stable demographics', riskLevel: 'low', sourceRef: 'st-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('lens_shift', () => {
  it('inconclusive without views', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.lens_shift!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when ≥2 lenses escalate', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.lens_shift!(makeCtx({
      lensViews: [
        { lens: 'regulatory', verdict: 'escalate', rationale: 'sanctions hit', sourceRef: 'lv-1' },
        { lens: 'reputational', verdict: 'escalate', rationale: 'adverse media', sourceRef: 'lv-2' },
        { lens: 'financial', verdict: 'flag', rationale: 'unusual flows', sourceRef: 'lv-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all lenses clear', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.lens_shift!(makeCtx({
      lensViews: [
        { lens: 'regulatory', verdict: 'clear', rationale: 'no hit', sourceRef: 'lv-4' },
        { lens: 'financial', verdict: 'clear', rationale: 'normal flows', sourceRef: 'lv-5' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('stakeholder_map', () => {
  it('inconclusive without stakeholders', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.stakeholder_map!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on 2+ unengaged key players', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.stakeholder_map!(makeCtx({
      stakeholders: [
        { name: 'Regulator A', power: 0.9, interest: 0.9, engaged: false, stance: 'unknown', sourceRef: 'sk-1' },
        { name: 'Regulator B', power: 0.8, interest: 0.7, engaged: false, stance: 'neutral', sourceRef: 'sk-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all key players engaged', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.stakeholder_map!(makeCtx({
      stakeholders: [{ name: 'Regulator A', power: 0.9, interest: 0.9, engaged: true, stance: 'supporter', sourceRef: 'sk-3' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('typology_catalogue', () => {
  it('inconclusive without matches', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.typology_catalogue!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on 2+ strong typology matches', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.typology_catalogue!(makeCtx({
      typologyMatches: [
        { typologyId: 'TYP-001', typologyName: 'Trade-Based ML', matchScore: 0.85, indicatorsMatched: 7, indicatorsTotal: 8, sourceRef: 'tc-1' },
        { typologyId: 'TYP-002', typologyName: 'Shell Company', matchScore: 0.75, indicatorsMatched: 5, indicatorsTotal: 6, sourceRef: 'tc-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on weak matches only', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.typology_catalogue!(makeCtx({
      typologyMatches: [{ typologyId: 'TYP-003', typologyName: 'Cash Intensive', matchScore: 0.25, indicatorsMatched: 2, indicatorsTotal: 10, sourceRef: 'tc-3' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('oecd_ddg_annex', () => {
  it('inconclusive without steps', async () => {
    expect((await LOGIC_FORMAL_MODE_APPLIES.oecd_ddg_annex!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on not-started step', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.oecd_ddg_annex!(makeCtx({
      oecdDdgSteps: [
        { annex: 'A', step: 'risk-profile', status: 'complete', findings: [], sourceRef: 'od-1' },
        { annex: 'B', step: 'general-due-diligence', status: 'not_started', findings: [], sourceRef: 'od-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all steps complete', async () => {
    const out = await LOGIC_FORMAL_MODE_APPLIES.oecd_ddg_annex!(makeCtx({
      oecdDdgSteps: [
        { annex: 'A', step: 'risk-profile', status: 'complete', findings: [], sourceRef: 'od-3' },
        { annex: 'B', step: 'general-due-diligence', status: 'complete', findings: [], sourceRef: 'od-4' },
        { annex: 'C', step: 'enhanced-dd', status: 'complete', findings: [], sourceRef: 'od-5' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});
