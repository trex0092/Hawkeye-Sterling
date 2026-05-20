import { describe, expect, it } from 'vitest';
import childLabourIndicatorApply from './wave3-child-labour.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-child-labour', () => {
  it('returns inconclusive when no childLabourSuppliers supplied', async () => {
    const r = await childLabourIndicatorApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('child_labour_indicator');
  });

  it('returns inconclusive when childLabourSuppliers is empty', async () => {
    const r = await childLabourIndicatorApply(makeCtx({ childLabourSuppliers: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when supplier has no red flags', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's1',
        sector: 'electronics',
        minAgeOfWorkers: 18,
        hasIloC182Ratification: true,
        hasAgeVerificationProcedure: true,
        isOnTvpraList: false,
        reportedChildLabourIncidents: 0,
        hasIndependentAudit: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('blocks when minAgeOfWorkers < 14 (absolute minimum)', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's2',
        minAgeOfWorkers: 12,
      }],
    }));
    expect(r.verdict).toBe('block');
  });

  it('escalates when minAgeOfWorkers >= 14 but < 15 (below standard)', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's3',
        minAgeOfWorkers: 14,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag age when minAgeOfWorkers >= 15', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's4',
        minAgeOfWorkers: 15,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('uses 18 as default minAgeOfWorkers when not provided', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's5',
        // minAgeOfWorkers not set → defaults to 18
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when sector is on TVPRA list and no independent audit', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's6',
        sector: 'cocoa',
        hasIndependentAudit: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag tvpra_no_audit when sector NOT on TVPRA list', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's7',
        sector: 'electronics',
        hasIndependentAudit: false,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag tvpra_no_audit when audit IS performed', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's8',
        sector: 'cotton',
        hasIndependentAudit: true,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when isOnTvpraList and no age verification procedure', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's9',
        isOnTvpraList: true,
        hasAgeVerificationProcedure: false,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag tvpra_no_age_verification when isOnTvpraList is false', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's10',
        isOnTvpraList: false,
        hasAgeVerificationProcedure: false,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when reportedChildLabourIncidents >= 1', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's11',
        reportedChildLabourIncidents: 1,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag reported_incidents when count = 0', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's12',
        reportedChildLabourIncidents: 0,
        hasIloC182Ratification: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags no_c182_ratification when hasIloC182Ratification is false', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 's13',
        hasIloC182Ratification: false,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('uses supplierId as ref', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierId: 'MY_SUPPLIER',
        hasIloC182Ratification: false,
      }],
    }));
    expect(r.evidence).toContain('MY_SUPPLIER');
  });

  it('uses supplierName as ref when supplierId missing', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{
        supplierName: 'ACME Corp',
        hasIloC182Ratification: false,
      }],
    }));
    expect(r.evidence).toContain('ACME Corp');
  });

  it('uses (unidentified) when both ids missing', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [{ hasIloC182Ratification: false }],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('block verdict takes priority over escalate', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [
        {
          supplierId: 's14',
          minAgeOfWorkers: 12, // block
          reportedChildLabourIncidents: 3, // escalate
        },
      ],
    }));
    expect(r.verdict).toBe('block');
  });

  it('scores are clamped to 1', async () => {
    const r = await childLabourIndicatorApply(makeCtx({
      childLabourSuppliers: [
        {
          supplierId: 's15',
          minAgeOfWorkers: 10, // block (0.7)
          isOnTvpraList: true,
          hasAgeVerificationProcedure: false, // escalate (0.45)
          reportedChildLabourIncidents: 5, // escalate (0.5)
          hasIloC182Ratification: false, // flag (0.25)
          sector: 'gold_mining',
          hasIndependentAudit: false, // escalate (0.4)
        },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.verdict).toBe('block');
  });
});
