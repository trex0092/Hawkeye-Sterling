import { describe, expect, it } from 'vitest';
import { UAE_ADVANCED_MODE_APPLIES } from '../modes/uae_advanced.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = ['cdd']): BrainContext {
  return {
    run: { id: 'r-uae', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('uae_advanced — cabinet_res_walk', () => {
  it('inconclusive without citations', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.cabinet_res_walk!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
    expect(out.score).toBe(0);
  });

  it('escalates on unsatisfied obligation', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.cabinet_res_walk!(makeCtx({
      cabinetCitations: [
        { resolution: 'Cabinet Res 74/2020', article: 'Art.4(1)', obligation: 'TFS without delay', satisfied: false, sourceRef: 'src-1' },
        { resolution: 'Cabinet Res 10/2019', article: 'Art.6', obligation: 'REAR filing', satisfied: true, sourceRef: 'src-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
    expect(out.evidence).toEqual(['src-1', 'src-2']);
  });

  it('flags on undetermined satisfaction', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.cabinet_res_walk!(makeCtx({
      cabinetCitations: [
        { resolution: 'Cabinet Res 74/2020', article: 'Art.4', obligation: 'TFS', satisfied: null, sourceRef: 'src-1' },
      ],
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('uae_advanced — emirate_jurisdiction', () => {
  it('inconclusive without attachments', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.emirate_jurisdiction!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on multi-supervisor + high-risk free zone', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.emirate_jurisdiction!(makeCtx({
      emirateAttachments: [
        { emirate: 'DU', freeZone: 'JAFZA', supervisor: 'CBUAE', sourceRef: 'src-1' },
        { emirate: 'AD', freeZone: 'RAKEZ', supervisor: 'FSRA', sourceRef: 'src-2' },
        { emirate: 'unknown', supervisor: 'MoE', sourceRef: 'src-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — entity_resolution', () => {
  it('inconclusive without candidates', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.entity_resolution!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('flags on multi-LEI ambiguity', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.entity_resolution!(makeCtx({
      entityCandidates: [
        { source: 'GLEIF', lei: '529900AAAA', registration: 'AE-12345', matchConfidence: 0.9, sourceRef: 'src-1' },
        { source: 'CBUAE_REG', lei: '529900BBBB', registration: 'AE-99999', matchConfidence: 0.85, sourceRef: 'src-2' },
      ],
    }));
    expect(out.verdict).toBe('flag');
  });

  it('clears on consistent high-confidence candidates', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.entity_resolution!(makeCtx({
      entityCandidates: [
        { source: 'GLEIF', lei: '529900XXXX', registration: 'AE-1', matchConfidence: 0.95, sourceRef: 'src-1' },
        { source: 'CBUAE_REG', lei: '529900XXXX', registration: 'AE-1', matchConfidence: 0.92, sourceRef: 'src-2' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('uae_advanced — kyb_strict', () => {
  it('inconclusive without snapshot', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kyb_strict!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on revoked licence', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kyb_strict!(makeCtx({
      kybSnapshot: {
        licenceStatus: 'revoked',
        officersScreened: 0,
        officersTotal: 3,
        sourceRef: 'kyb-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });

  it('clears on full coverage', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kyb_strict!(makeCtx({
      kybSnapshot: {
        licenceStatus: 'active',
        licenceExpiryDays: 300,
        declaredActivity: 'gold-trading',
        observedActivity: 'gold-trading',
        officersScreened: 4,
        officersTotal: 4,
        sourceRef: 'kyb-1',
      },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('uae_advanced — audit_trail_reconstruction', () => {
  it('inconclusive without entries', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.audit_trail_reconstruction!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('clears on unbroken chain', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.audit_trail_reconstruction!(makeCtx({
      auditEntries: [
        { at: '2026-01-01T00:00:00Z', entryHash: 'h1', action: 'open', actor: 'u1', sourceRef: 'a-1' },
        { at: '2026-01-02T00:00:00Z', prevHash: 'h1', entryHash: 'h2', action: 'edit', actor: 'u1', sourceRef: 'a-2' },
        { at: '2026-01-03T00:00:00Z', prevHash: 'h2', entryHash: 'h3', action: 'close', actor: 'u2', sourceRef: 'a-3' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });

  it('escalates on hash break', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.audit_trail_reconstruction!(makeCtx({
      auditEntries: [
        { at: '2026-01-01T00:00:00Z', entryHash: 'h1', action: 'open', actor: 'u1', sourceRef: 'a-1' },
        { at: '2026-01-02T00:00:00Z', prevHash: 'BAD', entryHash: 'h2', action: 'edit', actor: 'u1', sourceRef: 'a-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — fatf_effectiveness', () => {
  it('inconclusive without snapshot', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.fatf_effectiveness!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on >=2 low IO ratings', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.fatf_effectiveness!(makeCtx({
      fatfEffectiveness: {
        jurisdictionIso2: 'XX',
        immediateOutcomes: [
          { id: 'IO.1', rating: 'low' },
          { id: 'IO.2', rating: 'low' },
          { id: 'IO.3', rating: 'moderate' },
          { id: 'IO.4', rating: 'substantial' },
        ],
        asOf: '2026-01-01',
        sourceRef: 'fatf-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — de_minimis', () => {
  it('inconclusive without probe', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.de_minimis!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on heavy clustering just below threshold', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.de_minimis!(makeCtx({
      deMinimisProbe: {
        thresholdAed: 55000,
        observations: [54000, 54500, 53000, 52000, 51000, 50500, 49500, 1000],
        windowDays: 30,
        sourceRef: 'p-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — defi_smart_contract', () => {
  it('inconclusive without posture', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.defi_smart_contract!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on upgradeable + thin admin-key + no audit', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.defi_smart_contract!(makeCtx({
      defiPosture: {
        protocolName: 'XYZ',
        audited: false,
        upgradeable: true,
        adminKeyMultisigOf: 1,
        adminKeyTotal: 1,
        sourceRef: 'd-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — family_office_signal', () => {
  it('inconclusive without profile', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.family_office_signal!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on deep trust layers + multi-jurisdictions + MFO', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.family_office_signal!(makeCtx({
      familyOfficeProfile: {
        declaredType: 'mfo',
        jurisdictions: ['AE', 'CH', 'KY', 'BVI'],
        trustLayersCount: 4,
        beneficiaryCount: 60,
        asPublicEntity: false,
        sourceRef: 'fo-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — insurance_wrap', () => {
  it('inconclusive without events', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.insurance_wrap!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on rapid-surrender + third-party funder', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.insurance_wrap!(makeCtx({
      insuranceWrapEvents: [
        {
          policyId: 'P1',
          premiumAed: 2_000_000,
          surrenderWithinDays: 90,
          thirdPartyFunder: true,
          beneficiaryChanges: 4,
          sourceRef: 'i-1',
        },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('uae_advanced — ghost_employees', () => {
  it('inconclusive without recipients', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.ghost_employees!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on shared bank accounts', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.ghost_employees!(makeCtx({
      payrollRecipients: [
        { recipientId: 'A', monthlySalaryAed: 5000, hasHrFile: true, hasTimeAttendance: true, bankAccount: 'ACC-1', sourceRef: 'r-1' },
        { recipientId: 'B', monthlySalaryAed: 6000, hasHrFile: true, hasTimeAttendance: true, bankAccount: 'ACC-1', sourceRef: 'r-2' },
        { recipientId: 'C', monthlySalaryAed: 4000, hasHrFile: true, hasTimeAttendance: true, bankAccount: 'ACC-2', sourceRef: 'r-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });

  it('clears with full HR + time-attendance and unique accounts', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.ghost_employees!(makeCtx({
      payrollRecipients: [
        { recipientId: 'A', monthlySalaryAed: 5000, hasHrFile: true, hasTimeAttendance: true, bankAccount: 'ACC-1', sourceRef: 'r-1' },
        { recipientId: 'B', monthlySalaryAed: 6000, hasHrFile: true, hasTimeAttendance: true, bankAccount: 'ACC-2', sourceRef: 'r-2' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('uae_advanced — kri_alignment', () => {
  it('inconclusive without observations', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kri_alignment!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on red breach NOT escalated', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kri_alignment!(makeCtx({
      kriObservations: [
        { kriId: 'KRI-1', observed: 12, amberThreshold: 5, redThreshold: 10, escalated: false, sourceRef: 'k-1' },
        { kriId: 'KRI-2', observed: 4, amberThreshold: 5, redThreshold: 10, escalated: false, sourceRef: 'k-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });

  it('clears on values within tolerance', async () => {
    const out = await UAE_ADVANCED_MODE_APPLIES.kri_alignment!(makeCtx({
      kriObservations: [
        { kriId: 'KRI-1', observed: 2, amberThreshold: 5, redThreshold: 10, escalated: false, sourceRef: 'k-1' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});
