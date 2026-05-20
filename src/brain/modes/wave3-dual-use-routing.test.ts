import { describe, expect, it } from 'vitest';
import dualUseRoutingApply from './wave3-dual-use-routing.js';
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

describe('wave3-dual-use-routing', () => {
  it('returns inconclusive when no shipments supplied', async () => {
    const r = await dualUseRoutingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('dual_use_goods_routing');
  });

  it('returns inconclusive when shipments is empty', async () => {
    const r = await dualUseRoutingApply(makeCtx({ shipments: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when shipment is not dual-use', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S001',
        isDualUse: false,
        endUserCountryIso2: 'IR',
        endUserCertProvided: false,
        routedThrough: ['AE', 'TR', 'UA'],
      }],
    }));
    // isDualUse != true → skipped entirely
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('returns clear when dual-use but < 2 flags', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S002',
        isDualUse: true,
        endUserCountryIso2: 'DE',
        endUserCertProvided: true,
        declaredEndUseCategory: 'civilian',
        routedThrough: ['AE'],
        freeTradeZoneOrigin: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('fires signal when dual-use with 2+ flags: high_risk_end_user + no_end_user_cert', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S003',
        isDualUse: true,
        endUserCountryIso2: 'IR', // high_risk_end_user
        endUserCertProvided: false, // no_end_user_cert
      }],
    }));
    // 2 flags → weight = min(0.4, 0.15 + 2*0.06) = 0.27 < 0.3 threshold → clear (but score > 0)
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('clear');
  });

  it('flags when 3 intermediaries + no cert', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S004',
        isDualUse: true,
        routedThrough: ['AE', 'TR', 'UA'], // 3 intermediaries
        endUserCertProvided: false, // no_end_user_cert
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag routing with only 2 intermediaries', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S005',
        isDualUse: true,
        routedThrough: ['AE', 'TR'], // only 2 → not >= 3
        endUserCertProvided: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags unknown_end_use + no_end_user_cert', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S006',
        isDualUse: true,
        declaredEndUseCategory: 'unknown', // unknown_end_use
        endUserCertProvided: false, // no_end_user_cert
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags ftz_relayed + high_risk_end_user', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S007',
        isDualUse: true,
        freeTradeZoneOrigin: true,
        routedThrough: ['AE', 'TR'], // 2 intermediaries → ftz_relayed
        endUserCountryIso2: 'KP', // high_risk_end_user
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag ftz_relayed when routedThrough has < 2 intermediaries', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S008',
        isDualUse: true,
        freeTradeZoneOrigin: true,
        routedThrough: ['AE'], // only 1 → ftz_relayed not triggered
        endUserCertProvided: true,
        declaredEndUseCategory: 'civilian',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags high_risk_end_user for SY', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S009',
        isDualUse: true,
        endUserCountryIso2: 'SY', // Syria
        endUserCertProvided: false,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high_risk_end_user for lowercase code', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S010',
        isDualUse: true,
        endUserCountryIso2: 'ru', // Russia lowercase
        endUserCertProvided: false,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when endUserCountryIso2 is not high-risk', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S011',
        isDualUse: true,
        endUserCountryIso2: 'US',
        endUserCertProvided: false,
        routedThrough: [],
      }],
    }));
    // only no_end_user_cert flag → 1 flag < 2
    expect(r.score).toBe(0);
  });

  it('weight is capped at 0.4 per shipment', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [{
        shipmentId: 'S012',
        isDualUse: true,
        endUserCountryIso2: 'IR', // high_risk_end_user
        routedThrough: ['AE', 'TR', 'UA', 'KZ'], // 4 intermediaries
        endUserCertProvided: false, // no_end_user_cert
        declaredEndUseCategory: 'unknown', // unknown_end_use
        freeTradeZoneOrigin: true, // ftz_relayed (4 >= 2)
      }],
    }));
    // 5 flags: weight = min(0.4, 0.15 + 5*0.06) = min(0.4, 0.45) = 0.4
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('escalates when multiple shipments fire', async () => {
    const r = await dualUseRoutingApply(makeCtx({
      shipments: [
        {
          shipmentId: 'S013',
          isDualUse: true,
          endUserCountryIso2: 'KP',
          endUserCertProvided: false,
        },
        {
          shipmentId: 'S014',
          isDualUse: true,
          endUserCountryIso2: 'IR',
          endUserCertProvided: false,
          declaredEndUseCategory: 'unknown',
        },
        {
          shipmentId: 'S015',
          isDualUse: true,
          routedThrough: ['AE', 'TR', 'UA'],
          endUserCertProvided: false,
          endUserCountryIso2: 'BY',
        },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });
});
