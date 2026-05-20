import { describe, expect, it } from 'vitest';
import casinoChipDumpingApply from './wave3-casino-chip-dumping.js';
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

describe('wave3-casino-chip-dumping', () => {
  it('returns inconclusive when no casinoSessions supplied', async () => {
    const r = await casinoChipDumpingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('casino_chip_dumping');
  });

  it('returns inconclusive when casinoSessions is empty', async () => {
    const r = await casinoChipDumpingApply(makeCtx({ casinoSessions: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's1',
        customerId: 'cust1',
        chipPurchaseAed: 10000,
        chipsPlayedAed: 5000,
        chipsCashedOutAed: 4000,
        durationMinutes: 120,
        identityFullyVerified: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags minimal_play_ratio when purchase >= 50k and played/purchase < 0.1', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's2',
        customerId: 'cust2',
        chipPurchaseAed: 50000,
        chipsPlayedAed: 4999, // < 10%
        chipsCashedOutAed: 0,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag minimal_play_ratio when purchase < 50k', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's3',
        customerId: 'cust3',
        chipPurchaseAed: 49999,
        chipsPlayedAed: 100,
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag minimal_play_ratio when played/purchase >= 0.1', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's4',
        customerId: 'cust4',
        chipPurchaseAed: 50000,
        chipsPlayedAed: 5000, // exactly 10%
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag minimal_play_ratio when played = 0', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's5',
        customerId: 'cust5',
        chipPurchaseAed: 50000,
        chipsPlayedAed: 0, // played > 0 condition fails
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags high_cashout_ratio when purchase >= 25k and cashedOut/purchase >= 0.85', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's6',
        customerId: 'cust6',
        chipPurchaseAed: 25000,
        chipsPlayedAed: 1000,
        chipsCashedOutAed: 21250, // 85%
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag high_cashout_ratio when purchase < 25k', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's7',
        customerId: 'cust7',
        chipPurchaseAed: 24999,
        chipsCashedOutAed: 24000,
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag high_cashout_ratio when cashout/purchase < 0.85', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's8',
        customerId: 'cust8',
        chipPurchaseAed: 25000,
        chipsCashedOutAed: 20000, // 80% < 85%
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag high_cashout_ratio when cashedOut = 0', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's8b',
        customerId: 'cust8b',
        chipPurchaseAed: 25000,
        chipsCashedOutAed: 0,
        durationMinutes: 60,
        identityFullyVerified: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags short_session when purchase >= 10k and durationMinutes <= 15', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's9',
        customerId: 'cust9',
        chipPurchaseAed: 10000,
        durationMinutes: 15,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag short_session when purchase < 10k', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's10',
        customerId: 'cust10',
        chipPurchaseAed: 9999,
        durationMinutes: 5,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag short_session when durationMinutes > 15', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's11',
        customerId: 'cust11',
        chipPurchaseAed: 50000,
        durationMinutes: 16,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags unverified_high_value when identityFullyVerified = false and purchase >= 5k', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's12',
        customerId: 'cust12',
        chipPurchaseAed: 5000,
        identityFullyVerified: false,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag unverified when purchase < 5k', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's13',
        customerId: 'cust13',
        chipPurchaseAed: 4999,
        identityFullyVerified: false,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals fire', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's14',
        customerId: 'cust14',
        chipPurchaseAed: 100000,
        chipsPlayedAed: 1000, // < 10%
        chipsCashedOutAed: 90000, // 90% >= 85%
        durationMinutes: 5, // <= 15
        identityFullyVerified: false,
      }],
    }));
    // All 4 signals fire: 0.4 + 0.3 + 0.2 + 0.3 = 1.2 → clamped to escalate
    expect(r.verdict).toBe('escalate');
  });

  it('flags verdict when score >= 0.3 but < 0.6', async () => {
    const r = await casinoChipDumpingApply(makeCtx({
      casinoSessions: [{
        sessionId: 's15',
        customerId: 'cust15',
        chipPurchaseAed: 50000,
        chipsPlayedAed: 1000, // < 10% → minimal_play_ratio 0.4
        chipsCashedOutAed: 0,
        identityFullyVerified: true,
        durationMinutes: 60,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });
});
