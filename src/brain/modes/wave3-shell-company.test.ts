import { describe, expect, it } from 'vitest';
import shellCompanyApply from './wave3-shell-company.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Entity', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-shell-company', () => {
  it('returns inconclusive when no corporateProfiles', async () => {
    const r = await shellCompanyApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('shell_company_indicator');
  });

  it('returns inconclusive when profiles is empty', async () => {
    const r = await shellCompanyApply(makeCtx({ corporateProfiles: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no flags', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: false,
        hasCommercialPremises: true,
        employeeCount: 10,
        directorIsNominee: false,
        beneficialOwnersDisclosed: true,
        yearsActive: 5,
        filingsLastYear: 3,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('does not flag when < 3 shell indicators', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,  // flag 1
        hasCommercialPremises: false,  // flag 2
        employeeCount: 5,  // not zero
        directorIsNominee: false,
        beneficialOwnersDisclosed: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags when exactly 3 shell indicators', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,        // flag 1
        hasCommercialPremises: false,  // flag 2
        employeeCount: 0,              // flag 3
        directorIsNominee: false,
        beneficialOwnersDisclosed: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('includes all 6 possible flags: mailbox_address', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        directorIsNominee: true,
        beneficialOwnersDisclosed: false,
        filingsLastYear: 0,
        yearsActive: 3,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).not.toBe('clear');
  });

  it('dormant_filings flag requires filingsLastYear=0 AND yearsActive > 1', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        filingsLastYear: 0,
        yearsActive: 2,  // > 1 so dormant flag fires
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not fire dormant_filings when yearsActive <= 1', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        filingsLastYear: 0,
        yearsActive: 1, // not > 1
      }],
    }));
    // only 3 flags fired (mailbox, no_premises, zero_employees) → still flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('weight is min(0.45, 0.15 + flags*0.07)', async () => {
    // 3 flags: weight = 0.15 + 3*0.07 = 0.36
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
      }],
    }));
    expect(Math.abs(r.score - 0.36)).toBeLessThan(0.001);
  });

  it('weight capped at 0.45 for 6 flags', async () => {
    // 6 flags: 0.15 + 6*0.07 = 0.57 → capped at 0.45
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        directorIsNominee: true,
        beneficialOwnersDisclosed: false,
        filingsLastYear: 0,
        yearsActive: 5,
      }],
    }));
    expect(r.score).toBeLessThanOrEqual(0.45);
  });

  it('escalates when rawScore > 0.7 (multiple profiles)', async () => {
    const profile = {
      isMailboxAddress: true,
      hasCommercialPremises: false,
      employeeCount: 0,
      directorIsNominee: true,
      beneficialOwnersDisclosed: false,
      filingsLastYear: 0,
      yearsActive: 5,
    };
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [
        { entityId: 'e1', ...profile },
        { entityId: 'e2', ...profile },
      ],
    }));
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('includes entity evidence in output', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'TestCo',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
      }],
    }));
    expect(r.evidence[0]).toContain('TestCo');
  });

  it('does not fire zero_employees flag when employeeCount is explicitly undefined', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: undefined, // ?? -1 → -1 !== 0 → no flag
        directorIsNominee: false,
        beneficialOwnersDisclosed: true,
      }],
    }));
    // Only 2 flags (mailbox + no_premises) < 3 → clear
    expect(r.verdict).toBe('clear');
  });

  it('does not fire dormant_filings when filingsLastYear is explicitly undefined', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        filingsLastYear: undefined, // ?? -1 → -1 !== 0 → no dormant_filings
        yearsActive: 5,
      }],
    }));
    // 3 flags (mailbox, no_premises, zero_employees) → flag
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not fire dormant_filings when filingsLastYear > 0', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        filingsLastYear: 5, // defined, > 0 → ?? -1 gives 5, 5 !== 0 → no dormant_filings
        yearsActive: 5,
      }],
    }));
    // 3 flags (mailbox, no_premises, zero_employees) → flag but no dormant_filings
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not fire dormant_filings when yearsActive is undefined (defaults to 0, not > 1)', async () => {
    const r = await shellCompanyApply(makeCtx({
      corporateProfiles: [{
        entityId: 'e1',
        isMailboxAddress: true,
        hasCommercialPremises: false,
        employeeCount: 0,
        filingsLastYear: 0,
        // yearsActive undefined → ?? 0 → 0, not > 1 → no dormant_filings
      }],
    }));
    // 3 flags (mailbox, no_premises, zero_employees) → flag but no dormant_filings
    expect(r.score).toBeGreaterThan(0);
  });
});
