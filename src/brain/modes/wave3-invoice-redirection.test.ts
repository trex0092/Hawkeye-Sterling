import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import invoiceRedirectionTraceApply from './wave3-invoice-redirection.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('invoice_redirection_trace', () => {
  it('returns inconclusive when no invoicePaymentEvents provided', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('invoice_redirection_trace');
  });

  it('returns inconclusive when invoicePaymentEvents is empty', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({ invoicePaymentEvents: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', vendorId: 'V1', ibanDifferentFromVendorOnFile: false, bankCountryDifferentFromVendorJurisdiction: false, changeRequestVerifiedOutOfBand: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires iban_change when ibanDifferentFromVendorOnFile is true', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', ibanDifferentFromVendorOnFile: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires bank_country_mismatch when bankCountryDifferentFromVendorJurisdiction is true', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', bankCountryDifferentFromVendorJurisdiction: true, destinationBankCountry: 'RU', approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires fresh_account_critical when destinationAccountAgeDays < 7', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountAgeDays: 3, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('block');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires fresh_account when 7 <= destinationAccountAgeDays < 30', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountAgeDays: 15, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire fresh_account when destinationAccountAgeDays >= 30', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountAgeDays: 30, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('fresh_account');
  });

  it('does NOT fire fresh_account when destinationAccountAgeDays is undefined', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('fresh_account');
  });

  it('fires email_change_no_callback when changeRequestChannel is email and not verified out of band', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', changeRequestChannel: 'email', changeRequestVerifiedOutOfBand: false, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('block');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire email_change_no_callback when verified out of band', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', changeRequestChannel: 'email', changeRequestVerifiedOutOfBand: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('email_change_no_callback');
  });

  it('does NOT fire email_change_no_callback for phone channel', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', changeRequestChannel: 'phone', changeRequestVerifiedOutOfBand: false, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('email_change_no_callback');
  });

  it('fires urgency_plus_iban_change when both urgency and IBAN change', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', invoiceUrgencyTone: true, ibanDifferentFromVendorOnFile: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire urgency_plus_iban_change when ibanDifferentFromVendorOnFile is false', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', invoiceUrgencyTone: true, ibanDifferentFromVendorOnFile: false, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('urgency_plus_iban_change');
  });

  it('fires no_dual_control_high_value when no dual control and amount >= 100000', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', approvedByDualControl: false, amountAed: 100000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire no_dual_control_high_value when amount < 100000', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', approvedByDualControl: false, amountAed: 99999 },
      ],
    }));
    expect(result.rationale).not.toContain('no_dual_control_high_value');
  });

  it('does NOT fire no_dual_control_high_value when approvedByDualControl is true', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', approvedByDualControl: true, amountAed: 200000 },
      ],
    }));
    expect(result.rationale).not.toContain('no_dual_control_high_value');
  });

  it('fires account_holder_name_mismatch when account holder name does not match vendor', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountHolderName: 'John Doe', vendorName: 'Acme Corp', approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire account_holder_name_mismatch when name matches', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountHolderName: 'Acme Solutions Ltd', vendorName: 'Acme Corp', approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('account_holder_name_mismatch');
  });

  it('does NOT fire account_holder_name_mismatch when either name is missing', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', destinationAccountHolderName: 'John Doe', approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.rationale).not.toContain('account_holder_name_mismatch');
  });

  it('block verdict takes priority over escalate', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', changeRequestChannel: 'email', changeRequestVerifiedOutOfBand: false, ibanDifferentFromVendorOnFile: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('block');
  });

  it('uses unidentified fallback for invoiceId', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { ibanDifferentFromVendorOnFile: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('confidence increases with hits', async () => {
    const result = await invoiceRedirectionTraceApply(makeCtx({
      invoicePaymentEvents: [
        { invoiceId: 'INV1', ibanDifferentFromVendorOnFile: true, bankCountryDifferentFromVendorJurisdiction: true, approvedByDualControl: true, amountAed: 50000 },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
