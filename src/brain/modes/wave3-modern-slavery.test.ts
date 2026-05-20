import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import modernSlaveryIndicatorApply from './wave3-modern-slavery.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('modern_slavery_indicator', () => {
  it('returns inconclusive when no supplyChainSuppliers provided', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('modern_slavery_indicator');
  });

  it('returns inconclusive when supplyChainSuppliers is empty', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({ supplyChainSuppliers: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', ilo_forcedLabour_indicators: 0, hasModernSlaveryStatement: true, hasAuditedSupplyChain: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires ilo_critical when ilo_forcedLabour_indicators >= 5', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', ilo_forcedLabour_indicators: 5 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires ilo_flag when 3 <= ilo_forcedLabour_indicators < 5', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', ilo_forcedLabour_indicators: 4 },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire ILO signals when indicators < 3', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', ilo_forcedLabour_indicators: 2 },
      ],
    }));
    expect(result.rationale).not.toContain('ilo_flag');
    expect(result.rationale).not.toContain('ilo_critical');
  });

  it('fires high_risk_sector_jurisdiction when high-risk sector in high-risk jurisdiction', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'garments', jurisdiction: 'CN' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire high_risk_sector_jurisdiction for low-risk jurisdiction', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'garments', jurisdiction: 'DE' },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_sector_jurisdiction');
  });

  it('does NOT fire high_risk_sector_jurisdiction for low-risk sector', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'KP' },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_sector_jurisdiction');
  });

  it('fires high_risk_no_msa_statement when high-risk sector without MSA statement', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'mining', jurisdiction: 'US', hasModernSlaveryStatement: false },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire high_risk_no_msa_statement for non high-risk sector', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', hasModernSlaveryStatement: false },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_no_msa_statement');
  });

  it('fires reported_incidents when reportedIncidents >= 1', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', reportedIncidents: 1 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire reported_incidents when reportedIncidents is 0', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', reportedIncidents: 0 },
      ],
    }));
    expect(result.rationale).not.toContain('reported_incidents');
  });

  it('fires worker_complaints when workerComplaintsLastYear >= 5', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', workerComplaintsLastYear: 5 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire worker_complaints when < 5', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'software', jurisdiction: 'US', workerComplaintsLastYear: 4 },
      ],
    }));
    expect(result.rationale).not.toContain('worker_complaints');
  });

  it('handles uppercase sector input', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'GARMENTS', jurisdiction: 'CN' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles lowercase jurisdiction input', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'garments', jurisdiction: 'cn' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('uses supplierName fallback when supplierId is missing', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierName: 'ABC Corp', sector: 'garments', jurisdiction: 'CN' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.evidence).toContain('ABC Corp');
  });

  it('confidence increases with hits', async () => {
    const result = await modernSlaveryIndicatorApply(makeCtx({
      supplyChainSuppliers: [
        { supplierId: 'S1', sector: 'garments', jurisdiction: 'KP', ilo_forcedLabour_indicators: 6, reportedIncidents: 2, workerComplaintsLastYear: 8 },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
