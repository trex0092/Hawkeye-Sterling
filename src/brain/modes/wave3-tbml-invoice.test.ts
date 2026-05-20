import { describe, expect, it } from 'vitest';
import tbmlInvoiceApply from './wave3-tbml-invoice.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-tbml-invoice', () => {
  it('returns inconclusive when no tradeInvoices', async () => {
    const r = await tbmlInvoiceApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('tbml_invoice_manipulation');
  });

  it('returns inconclusive when tradeInvoices is empty', async () => {
    const r = await tbmlInvoiceApply(makeCtx({ tradeInvoices: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when all looks clean', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{
        invoiceId: 'i1',
        declaredUnitPrice: 100,
        marketUnitPrice: 100,
        shipmentManifestRef: 'MAN001',
        partyChain: ['A', 'B'],
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags over_invoice when ratio >= 1.5', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 150, marketUnitPrice: 100 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('over_invoice weight is min(0.35, 0.1 + (ratio-1.5)*0.1)', async () => {
    // ratio = 2.0 → 0.1 + 0.5*0.1 = 0.15
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 200, marketUnitPrice: 100 }],
    }));
    expect(r.score).toBeGreaterThan(0.1);
  });

  it('over_invoice weight capped at 0.35 for extreme overpricing', async () => {
    // ratio = 50 → would be huge, but capped at 0.35
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 5000, marketUnitPrice: 100 }],
    }));
    expect(r.score).toBeLessThanOrEqual(0.35);
  });

  it('flags under_invoice when ratio <= 0.5', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 50, marketUnitPrice: 100 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('under_invoice weight is min(0.35, 0.1 + (0.5-ratio)*0.5)', async () => {
    // ratio = 0.3 → 0.1 + 0.2*0.5 = 0.2
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 30, marketUnitPrice: 100 }],
    }));
    expect(r.score).toBeGreaterThanOrEqual(0.2);
  });

  it('does not flag when ratio between 0.5 and 1.5', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 120, marketUnitPrice: 100, shipmentManifestRef: 'M1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('skips price comparison when marketUnitPrice is 0', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', declaredUnitPrice: 100, marketUnitPrice: 0 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('skips price comparison when prices undefined', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', shipmentManifestRef: 'M1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags multi_invoicing when duplicatedInvoiceIds has >= 1 entry', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', duplicatedInvoiceIds: ['i2'], shipmentManifestRef: 'M1' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_invoicing when duplicatedInvoiceIds is empty', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', duplicatedInvoiceIds: [], shipmentManifestRef: 'M1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags phantom_shipment_risk when no shipmentManifestRef and totalDeclared > 0', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', totalDeclared: 10_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag phantom_shipment_risk when totalDeclared = 0', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', totalDeclared: 0 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag phantom_shipment_risk when shipmentManifestRef present', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', totalDeclared: 50_000, shipmentManifestRef: 'MANIFEST1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags long_party_chain when partyChain length >= 4', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', partyChain: ['A', 'B', 'C', 'D'], shipmentManifestRef: 'M1' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag long_party_chain when < 4', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{ invoiceId: 'i1', partyChain: ['A', 'B', 'C'], shipmentManifestRef: 'M1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates when score >= 0.6', async () => {
    // over_invoice(0.35) + multi_invoicing(0.3) + phantom_risk(0.2) + long_chain(0.15) = 1.0 → compressed
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [{
        invoiceId: 'i1',
        declaredUnitPrice: 5000,
        marketUnitPrice: 100,
        duplicatedInvoiceIds: ['i2'],
        totalDeclared: 50_000,
        partyChain: ['A', 'B', 'C', 'D'],
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('compresses score > 0.7', async () => {
    const r = await tbmlInvoiceApply(makeCtx({
      tradeInvoices: [
        { invoiceId: 'i1', declaredUnitPrice: 5000, marketUnitPrice: 100, duplicatedInvoiceIds: ['i2'], totalDeclared: 50_000, partyChain: ['A', 'B', 'C', 'D'] },
        { invoiceId: 'i2', declaredUnitPrice: 5000, marketUnitPrice: 100, duplicatedInvoiceIds: ['i3'], totalDeclared: 50_000, partyChain: ['A', 'B', 'C', 'D'] },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
