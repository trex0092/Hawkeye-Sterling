import { describe, expect, it } from 'vitest';
import { fatfAdapter } from '../sources/fatf.js';
import { SOURCE_ADAPTERS } from '../index.js';

describe('fatf adapter', () => {
  it('is registered in SOURCE_ADAPTERS', () => {
    expect(SOURCE_ADAPTERS.some((a) => a.id === 'fatf')).toBe(true);
  });

  it('returns at least the static fallback when network is unavailable', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const { entities, sourceVersion } = await fatfAdapter.fetch();
      expect(entities.length).toBeGreaterThan(0);
      expect(sourceVersion).toMatch(/^static-/);
      // Black-list canonical members.
      const isos = new Set(entities.map((e) => e.identifiers['iso2']));
      expect(isos.has('KP')).toBe(true);
      expect(isos.has('IR')).toBe(true);
      expect(isos.has('MM')).toBe(true);
      // Each entity carries exactly one FATF listing with a program label.
      for (const e of entities) {
        expect(e.source).toBe('fatf');
        expect(e.listings).toHaveLength(1);
        expect(e.listings[0]!.program).toMatch(/FATF /);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
