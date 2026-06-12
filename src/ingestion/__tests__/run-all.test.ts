// runIngestionAll — two-tier execution tests.
//
// Production incident under test (2026-06-12 12:08:58 UTC): au_dfat's
// exceljs parse of the multi-MB DFAT XLSX blocked the event loop, so every
// PARALLEL adapter's wall-clock leash expired simultaneously — including
// normally-instant adapters. The fix splits execution into tier 1 (light,
// parallel) and tier 2 (HEAVY_ADAPTER_IDS, strictly sequential, after
// tier 1, own leash) and lets ~30 s callers skip the heavy tier entirely
// without emitting error logs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeAdapter {
  id: string;
  displayName: string;
  sourceUrl: string;
  isEnabled?: () => boolean;
  fetch: () => Promise<{ entities: Array<{ id: string; name: string }>; rawChecksum: string }>;
}

const h = vi.hoisted(() => ({
  state: {
    adapters: [] as unknown[],
    events: [] as string[],
    writes: new Map<string, unknown>(),
    logged: [] as Array<{ adapterId?: string; phase?: string; message?: string }>,
  },
}));

// run-all imports SOURCE_ADAPTERS from the barrel; mocking it keeps the
// real adapter modules (and their env/network coupling) out of the test.
vi.mock('../index.js', () => ({ SOURCE_ADAPTERS: h.state.adapters }));

vi.mock('../blobs-store.js', () => {
  class EmptyOverwriteRefusedError extends Error {
    priorEntityCount: number;
    constructor(priorEntityCount = 0) {
      super('empty overwrite refused');
      this.priorEntityCount = priorEntityCount;
    }
  }
  return {
    EmptyOverwriteRefusedError,
    getBlobsStore: async () => ({
      putDataset: async (listId: string, _entities: unknown[], report: unknown) => {
        h.state.writes.set(listId, report);
      },
      getReport: async (listId: string) => h.state.writes.get(listId) ?? null,
    }),
  };
});

vi.mock('../error-log.js', () => ({
  logIngestError: vi.fn(async (entry: { adapterId?: string; phase?: string; message?: string }) => {
    h.state.logged.push(entry);
  }),
}));

vi.mock('../safe-async.js', () => ({ installGlobalAsyncSafetyNet: () => {} }));

import { runIngestionAll, HEAVY_ADAPTER_IDS, BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS } from '../run-all.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mkAdapter(
  id: string,
  opts?: { delayMs?: number; enabled?: boolean; fail?: boolean },
): FakeAdapter {
  return {
    id,
    displayName: id,
    sourceUrl: `https://example.test/${id}`,
    ...(opts?.enabled === undefined ? {} : { isEnabled: () => opts.enabled === true }),
    fetch: async () => {
      h.state.events.push(`start:${id}`);
      if (opts?.delayMs) await sleep(opts.delayMs);
      h.state.events.push(`end:${id}`);
      if (opts?.fail) throw new Error(`boom ${id}`);
      return { entities: [{ id: `${id}-1`, name: id }], rawChecksum: `ck-${id}` };
    },
  };
}

function setAdapters(...adapters: FakeAdapter[]): void {
  h.state.adapters.length = 0;
  h.state.adapters.push(...adapters);
}

function idx(event: string): number {
  const i = h.state.events.indexOf(event);
  expect(i, `expected event "${event}" in [${h.state.events.join(', ')}]`).toBeGreaterThanOrEqual(0);
  return i;
}

let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.state.events.length = 0;
  h.state.writes.clear();
  h.state.logged.length = 0;
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HEAVY_ADAPTER_IDS registry', () => {
  it('classifies the event-loop-blocking adapters as heavy', () => {
    expect(HEAVY_ADAPTER_IDS.has('au_dfat')).toBe(true);   // exceljs multi-MB XLSX — the proven loop blocker
    expect(HEAVY_ADAPTER_IDS.has('ch_seco')).toBe(true);   // SESAM server-side XML generation + multi-MB regex parse
    expect(HEAVY_ADAPTER_IDS.has('jp_mof')).toBe(true);    // same exceljs pattern × N files (defensive; dormant)
  });

  it('keeps the intraday-critical large-XML adapters in the light tier', () => {
    for (const lightId of ['eu_fsf', 'ofac_sdn', 'un_consolidated', 'uk_ofsi', 'uae_eocn', 'uae_ltl']) {
      expect(HEAVY_ADAPTER_IDS.has(lightId), `${lightId} must stay light`).toBe(false);
    }
  });

  it('background heavy leash covers au_dfat download + parse', () => {
    expect(BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS).toBe(120_000);
  });
});

describe('runIngestionAll — tier ordering', () => {
  it('runs every heavy adapter only after ALL light adapters settled, strictly one at a time', async () => {
    setAdapters(
      mkAdapter('light_a', { delayMs: 5 }),
      mkAdapter('au_dfat', { delayMs: 15 }),
      mkAdapter('light_b', { delayMs: 10 }),
      mkAdapter('ch_seco', { delayMs: 5 }),
      mkAdapter('jp_mof', { enabled: false }),
    );

    const result = await runIngestionAll('test-order', {
      adapterTimeoutMs: 5_000,
      heavyAdapterTimeoutMs: 5_000,
    });

    // Tier 1 fully settles before any heavy adapter starts.
    expect(idx('end:light_a')).toBeLessThan(idx('start:au_dfat'));
    expect(idx('end:light_b')).toBeLessThan(idx('start:au_dfat'));
    // Heavy tier is strictly sequential, in registry order.
    expect(idx('end:au_dfat')).toBeLessThan(idx('start:ch_seco'));
    // Disabled heavy adapter is filtered before tiering — never started.
    expect(h.state.events).not.toContain('start:jp_mof');

    expect(result.ok).toBe(true);
    expect(result.ok_count).toBe(4);
    expect(result.failed_count).toBe(0);
    expect(result.summary.map((r) => r.listId)).toEqual(['light_a', 'light_b', 'au_dfat', 'ch_seco']);
    expect(result.skippedHeavy).toBeUndefined();
    // All four datasets written.
    expect([...h.state.writes.keys()].sort()).toEqual(['au_dfat', 'ch_seco', 'light_a', 'light_b']);
  });
});

describe('runIngestionAll — heavy skip (no heavyAdapterTimeoutMs)', () => {
  it('skips heavy adapters entirely, with no error logs and no failure accounting', async () => {
    setAdapters(
      mkAdapter('light_a', { delayMs: 1 }),
      mkAdapter('au_dfat', { delayMs: 1 }),
      mkAdapter('light_b', { delayMs: 1 }),
      mkAdapter('ch_seco', { delayMs: 1 }),
      mkAdapter('jp_mof', { enabled: false }),
    );

    const result = await runIngestionAll('test-skip', { adapterTimeoutMs: 5_000 });

    // Heavy adapters never started, never wrote.
    expect(h.state.events).not.toContain('start:au_dfat');
    expect(h.state.events).not.toContain('start:ch_seco');
    expect(h.state.writes.has('au_dfat')).toBe(false);
    expect(h.state.writes.has('ch_seco')).toBe(false);

    // Skipping is not a failure: counts, ok flag, and summary exclude them.
    expect(result.ok).toBe(true);
    expect(result.ok_count).toBe(2);
    expect(result.failed_count).toBe(0);
    expect(result.summary.map((r) => r.listId)).toEqual(['light_a', 'light_b']);
    // Disabled jp_mof is "disabled", not "skipped heavy".
    expect(result.skippedHeavy).toEqual(['au_dfat', 'ch_seco']);

    // Silence requirement: no console.error, no structured ingest-error
    // entries for the skipped adapters — only a single info line.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(h.state.logged).toEqual([]);
    const infoLines = infoSpy.mock.calls.map((c) => String(c[0]));
    expect(infoLines.some((l) => l.includes('heavy adapters skipped') && l.includes('au_dfat') && l.includes('ch_seco'))).toBe(true);
  });
});

describe('runIngestionAll — per-tier leashes', () => {
  it('bounds each heavy adapter with its own heavy leash without poisoning the next one', async () => {
    setAdapters(
      mkAdapter('light_a', { delayMs: 1 }),
      mkAdapter('au_dfat', { delayMs: 120 }), // exceeds the 40 ms heavy leash
      mkAdapter('ch_seco', { delayMs: 5 }),   // runs after, on a FRESH leash
    );

    const result = await runIngestionAll('test-heavy-leash', {
      adapterTimeoutMs: 1_000,
      heavyAdapterTimeoutMs: 40,
    });

    const dfat = result.summary.find((r) => r.listId === 'au_dfat');
    const seco = result.summary.find((r) => r.listId === 'ch_seco');
    expect(dfat?.errors).toEqual(['adapter au_dfat timed out after 40ms']);
    expect(seco?.errors).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.ok_count).toBe(2);
    expect(result.failed_count).toBe(1);
    // A genuinely attempted-and-failed heavy adapter DOES log (unlike a skip).
    expect(h.state.logged.some((e) => e.adapterId === 'au_dfat' && e.phase === 'fetch')).toBe(true);
    expect(h.state.logged.some((e) => e.adapterId === 'ch_seco')).toBe(false);
  });

  it('keeps the tier-1 leash for light adapters independent of the heavy leash', async () => {
    setAdapters(
      mkAdapter('light_slow', { delayMs: 120 }), // exceeds the 30 ms light leash
      mkAdapter('light_a', { delayMs: 1 }),
      mkAdapter('au_dfat', { delayMs: 5 }),
    );

    const result = await runIngestionAll('test-light-leash', {
      adapterTimeoutMs: 30,
      heavyAdapterTimeoutMs: 1_000,
    });

    const slow = result.summary.find((r) => r.listId === 'light_slow');
    const dfat = result.summary.find((r) => r.listId === 'au_dfat');
    expect(slow?.errors).toEqual(['adapter light_slow timed out after 30ms']);
    expect(dfat?.errors).toEqual([]);
    expect(result.failed_count).toBe(1);
    expect(result.ok_count).toBe(2);
  });
});
