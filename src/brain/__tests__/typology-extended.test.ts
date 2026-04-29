import { describe, expect, it } from 'vitest';
import {
  tbmlOverlayApply, realEstateCashApply, invoiceFraudApply,
  phoenixCompanyApply, advanceFeeApply, maritimeStssApply,
} from '../modes/typology.js';
import type { BrainContext } from '../types.js';

function ctx(evidence: Record<string, unknown>): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains: [],
  };
}

describe('tbml_overlay', () => {
  it('flags over/under invoicing ≥25%', async () => {
    const f = await tbmlOverlayApply(ctx({
      trade: [
        { invoicedUnitPrice: 100, marketUnitPrice: 100 },
        { invoicedUnitPrice: 200, marketUnitPrice: 100 },  // 100% over
        { invoicedUnitPrice: 50,  marketUnitPrice: 100 },  // 50% under
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
    expect(f.likelihoodRatios?.length ?? 0).toBeGreaterThan(0);
  });
  it('inconclusive without trade data', async () => {
    const f = await tbmlOverlayApply(ctx({}));
    expect(f.verdict).toBe('inconclusive');
  });
});

describe('real_estate_cash', () => {
  it('flags cash-heavy + shell-buyer deals', async () => {
    const f = await realEstateCashApply(ctx({
      realEstate: [
        { cashPortionPct: 0.9, shellBuyer: true },
        { cashPortionPct: 0.8, shellBuyer: true, heldYearsBeforeFlip: 0.4 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

describe('invoice_fraud', () => {
  it('flags duplicate invoice numbers', async () => {
    const f = await invoiceFraudApply(ctx({
      invoices: [
        { invoiceNumber: 'A-1', invoicedAmount: 100, receivedAmount: 100 },
        { invoiceNumber: 'A-1', invoicedAmount: 100, receivedAmount: 100 },
        { invoiceNumber: 'A-1', invoicedAmount: 100, receivedAmount: 100 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

describe('phoenix_company', () => {
  it('detects dissolve/reincorporate with shared directors within 2 years', async () => {
    const f = await phoenixCompanyApply(ctx({
      corporateHistory: [
        { entityId: 'co-a', incorporatedAt: '2021-01-01', dissolvedAt: '2022-01-01', directors: ['alice','bob'] },
        { entityId: 'co-b', incorporatedAt: '2022-06-01', directors: ['alice','carol'] },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

describe('advance_fee', () => {
  it('flags classic 419 pattern', async () => {
    const f = await advanceFeeApply(ctx({
      advanceFeeSignals: {
        upfrontPaymentPct: 0.15,
        counterpartyCountryTier: 'high',
        claimedPayout: 1_000_000,
        unsolicited: true,
      },
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

describe('maritime STS', () => {
  it('escalates on STS near sanctioned port + flag churn', async () => {
    const f = await maritimeStssApply(ctx({
      maritime: { aisDarkHours: 48, flagChanges12m: 3, nameChanges12m: 2, stsNearSanctionedPort: true },
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.hypothesis).toBe('sanctioned');
  });
});
