// Hawkeye Sterling — liveAdapters unit tests.
// Covers adapter factory functions, env-gating, and the lookup/reference logic.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIG_ENV = { ...process.env };

function clearAdapterKeys() {
  delete process.env['CHAINALYSIS_API_KEY'];
  delete process.env['TRM_API_KEY'];
  delete process.env['ELLIPTIC_API_KEY'];
  delete process.env['CRYSTAL_API_KEY'];
  delete process.env['COINFIRM_API_KEY'];
  delete process.env['MERKLESCIENCE_API_KEY'];
  delete process.env['SCORECHAIN_API_KEY'];
  delete process.env['ANCHAIN_API_KEY'];
  delete process.env['CIPHERTRACE_API_KEY'];
  delete process.env['LUKKA_API_KEY'];
  delete process.env['SOLIDUS_LABS_API_KEY'];
  delete process.env['BLOCKTRACE_API_KEY'];
}

describe('LIVE_GLEIF_ADAPTER', () => {

  it('isAvailable always returns true', async () => {
    const mod = await import('../liveAdapters.js');
    expect(mod.LIVE_GLEIF_ADAPTER.isAvailable()).toBe(true);
  });

  it('returns [] for empty name', async () => {
    const mod = await import('../liveAdapters.js');
    const results = await mod.LIVE_GLEIF_ADAPTER.lookupByName('   ');
    expect(results).toEqual([]);
  });

  it('returns [] on fetch error (network failure)', async () => {
    const mod = await import('../liveAdapters.js');
    // Override global fetch to reject
    const orig = global.fetch;
    global.fetch = () => Promise.reject(new Error('network error'));
    try {
      const results = await mod.LIVE_GLEIF_ADAPTER.lookupByName('Acme Corp');
      expect(results).toEqual([]);
    } finally {
      global.fetch = orig;
    }
  });

  it('returns [] on non-OK response', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response('', { status: 429 }));
    try {
      const results = await mod.LIVE_GLEIF_ADAPTER.lookupByName('Acme Corp');
      expect(results).toEqual([]);
    } finally {
      global.fetch = orig;
    }
  });

  it('maps API data records to LeiRecord shape', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response(JSON.stringify({
      data: [
        {
          attributes: {
            lei: 'ABCDEF1234567890WXYZ',
            entity: {
              legalName: { name: 'Test Corp' },
              legalForm: { id: 'PRIV' },
              status: 'ACTIVE',
              legalAddress: { country: 'AE' },
            },
          },
        },
        {
          // missing lei — should be filtered out
          attributes: {
            entity: { legalName: { name: 'No-LEI Corp' } },
          },
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const results = await mod.LIVE_GLEIF_ADAPTER.lookupByName('Test Corp');
      expect(results).toHaveLength(1);
      expect(results[0]!.lei).toBe('ABCDEF1234567890WXYZ');
      expect(results[0]!.legalName).toBe('Test Corp');
      expect(results[0]!.countryIso2).toBe('AE');
    } finally {
      global.fetch = orig;
    }
  });
});

describe('LIVE_OPENSANCTIONS_ADAPTER', () => {
  it('isAvailable always returns true', async () => {
    const mod = await import('../liveAdapters.js');
    expect(mod.LIVE_OPENSANCTIONS_ADAPTER.isAvailable()).toBe(true);
  });

  it('returns [] for empty name', async () => {
    const mod = await import('../liveAdapters.js');
    expect(await mod.LIVE_OPENSANCTIONS_ADAPTER.lookup('  ')).toEqual([]);
  });

  it('returns [] on fetch error', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.reject(new Error('network'));
    try {
      expect(await mod.LIVE_OPENSANCTIONS_ADAPTER.lookup('Acme')).toEqual([]);
    } finally {
      global.fetch = orig;
    }
  });

  it('returns [] on non-OK response', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response('', { status: 503 }));
    try {
      expect(await mod.LIVE_OPENSANCTIONS_ADAPTER.lookup('Acme')).toEqual([]);
    } finally {
      global.fetch = orig;
    }
  });

  it('maps results with jurisdiction and registrationNumber', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response(JSON.stringify({
      responses: {
        q1: {
          results: [
            {
              properties: {
                name: ['Acme Holdings'],
                jurisdiction: ['AE'],
                registrationNumber: ['CR-001'],
                status: ['active'],
                incorporationDate: ['2020-01-01'],
              },
            },
            {
              properties: {
                // no name - should be filtered
                jurisdiction: ['AE'],
              },
            },
          ],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const results = await mod.LIVE_OPENSANCTIONS_ADAPTER.lookup('Acme', 'AE');
      expect(results).toHaveLength(1);
      expect(results[0]!.legalName).toBe('Acme Holdings');
      expect(results[0]!.jurisdiction).toBe('AE');
      expect(results[0]!.registrationNumber).toBe('CR-001');
    } finally {
      global.fetch = orig;
    }
  });

  it('falls back to country property when jurisdiction is absent', async () => {
    const mod = await import('../liveAdapters.js');
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response(JSON.stringify({
      responses: {
        q1: {
          results: [
            {
              properties: {
                name: ['Test Co'],
                country: ['GB'],
              },
            },
          ],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const results = await mod.LIVE_OPENSANCTIONS_ADAPTER.lookup('Test Co');
      expect(results[0]!.jurisdiction).toBe('GB');
    } finally {
      global.fetch = orig;
    }
  });
});

describe('LIVE_HS_CODE_ADAPTER', () => {
  it('isAvailable always returns true', async () => {
    const mod = await import('../liveAdapters.js');
    expect(mod.LIVE_HS_CODE_ADAPTER.isAvailable()).toBe(true);
  });

  it('returns null for empty hsCode', async () => {
    const mod = await import('../liveAdapters.js');
    expect(await mod.LIVE_HS_CODE_ADAPTER.reference('', 'AE')).toBeNull();
  });

  it('returns null for unknown HS code', async () => {
    const mod = await import('../liveAdapters.js');
    expect(await mod.LIVE_HS_CODE_ADAPTER.reference('9999', 'AE')).toBeNull();
  });

  it('returns gold reference for HS code 7108', async () => {
    const mod = await import('../liveAdapters.js');
    const ref = await mod.LIVE_HS_CODE_ADAPTER.reference('7108', 'AE');
    expect(ref).not.toBeNull();
    expect(ref!.hsCode).toBe('7108');
    expect(ref!.jurisdictionFlags).toContain('LBMA-required');
  });

  it('returns crude oil reference with RU price cap flag', async () => {
    const mod = await import('../liveAdapters.js');
    const ref = await mod.LIVE_HS_CODE_ADAPTER.reference('2709', 'RU');
    expect(ref).not.toBeNull();
    expect(ref!.jurisdictionFlags).toContain('RU-price-cap');
  });

  it('returns nuclear reactor reference with IR-NPWMD flag', async () => {
    const mod = await import('../liveAdapters.js');
    const ref = await mod.LIVE_HS_CODE_ADAPTER.reference('8401', 'IR');
    expect(ref!.jurisdictionFlags).toContain('IR-NPWMD');
  });
});

describe('bestOnChainAdapter + activeOnChainProvider', () => {
  beforeEach(() => { clearAdapterKeys(); });
  afterEach(() => { Object.assign(process.env, ORIG_ENV); clearAdapterKeys(); });

  it('returns NULL adapter when no keys are set', async () => {
    const mod = await import('../liveAdapters.js');
    const adapter = mod.bestOnChainAdapter();
    expect(adapter.isAvailable()).toBe(false);
  });

  it('returns "none" from activeOnChainProvider when no keys set', async () => {
    const mod = await import('../liveAdapters.js');
    expect(mod.activeOnChainProvider()).toBe('none');
  });

  it('returns chainalysis provider when CHAINALYSIS_API_KEY is set', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'test-key';
    const mod = await import('../liveAdapters.js');
    expect(mod.activeOnChainProvider()).toBe('chainalysis');
    const adapter = mod.bestOnChainAdapter();
    expect(adapter.isAvailable()).toBe(true);
    delete process.env['CHAINALYSIS_API_KEY'];
  });

  it('activeOnChainProviders returns all configured providers', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'key1';
    process.env['TRM_API_KEY'] = 'key2';
    const mod = await import('../liveAdapters.js');
    const providers = mod.activeOnChainProviders();
    expect(providers).toContain('chainalysis');
    expect(providers).toContain('trm');
    delete process.env['CHAINALYSIS_API_KEY'];
    delete process.env['TRM_API_KEY'];
  });

  it('returns trm provider when only TRM_API_KEY is set', async () => {
    process.env['TRM_API_KEY'] = 'trm-key';
    const mod = await import('../liveAdapters.js');
    expect(mod.activeOnChainProvider()).toBe('trm');
    delete process.env['TRM_API_KEY'];
  });

  it('returns elliptic provider when only ELLIPTIC_API_KEY is set', async () => {
    process.env['ELLIPTIC_API_KEY'] = 'elliptic-key';
    const mod = await import('../liveAdapters.js');
    expect(mod.activeOnChainProvider()).toBe('elliptic');
    delete process.env['ELLIPTIC_API_KEY'];
  });

  it('chainalysis analyse returns null on non-OK response', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'test-key';
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response('', { status: 404 }));
    try {
      const mod = await import('../liveAdapters.js');
      const adapter = mod.bestOnChainAdapter();
      const result = await adapter.analyse('0xabc', 'eth');
      expect(result).toBeNull();
    } finally {
      global.fetch = orig;
      delete process.env['CHAINALYSIS_API_KEY'];
    }
  });

  it('chainalysis analyse returns null for empty address', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'test-key';
    try {
      const mod = await import('../liveAdapters.js');
      const adapter = mod.bestOnChainAdapter();
      const result = await adapter.analyse('', 'eth');
      expect(result).toBeNull();
    } finally {
      delete process.env['CHAINALYSIS_API_KEY'];
    }
  });

  it('chainalysis analyse maps API response correctly', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'test-key';
    const orig = global.fetch;
    global.fetch = () => Promise.resolve(new Response(JSON.stringify({
      riskScore: 75,
      cluster: 'darknet-market',
      summary: 'High risk entity',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const mod = await import('../liveAdapters.js');
      const adapter = mod.bestOnChainAdapter();
      const result = await adapter.analyse('0xabc', 'eth');
      expect(result).not.toBeNull();
      expect(result!.riskScore).toBe(75);
      expect(result!.cluster).toBe('darknet-market');
    } finally {
      global.fetch = orig;
      delete process.env['CHAINALYSIS_API_KEY'];
    }
  });

  it('chainalysis analyse returns null on network error', async () => {
    process.env['CHAINALYSIS_API_KEY'] = 'test-key';
    const orig = global.fetch;
    global.fetch = () => Promise.reject(new Error('network'));
    try {
      const mod = await import('../liveAdapters.js');
      const adapter = mod.bestOnChainAdapter();
      const result = await adapter.analyse('0xabc', 'eth');
      expect(result).toBeNull();
    } finally {
      global.fetch = orig;
      delete process.env['CHAINALYSIS_API_KEY'];
    }
  });
});

describe('other on-chain providers (env-gated)', () => {
  beforeEach(() => { clearAdapterKeys(); });
  afterEach(() => { clearAdapterKeys(); });

  const providers: Array<[string, string]> = [
    ['CRYSTAL_API_KEY', 'crystal'],
    ['COINFIRM_API_KEY', 'coinfirm'],
    ['MERKLESCIENCE_API_KEY', 'merklescience'],
    ['SCORECHAIN_API_KEY', 'scorechain'],
    ['ANCHAIN_API_KEY', 'anchain'],
    ['CIPHERTRACE_API_KEY', 'ciphertrace'],
    ['LUKKA_API_KEY', 'lukka'],
    ['SOLIDUS_LABS_API_KEY', 'solidus-labs'],
    ['BLOCKTRACE_API_KEY', 'blocktrace'],
  ];

  for (const [envKey, providerName] of providers) {
    it(`${providerName} adapter is available when ${envKey} is set`, async () => {
      process.env[envKey] = 'test-key';
      const mod = await import('../liveAdapters.js');
      expect(mod.activeOnChainProvider()).toBe(providerName);
      delete process.env[envKey];
    });
  }
});
