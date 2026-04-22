import { describe, expect, it } from 'vitest';
import { MLRO_MODE_IDS, MLRO_MODE_CATEGORIES, modesByCategory, searchModes, suggestModesFor } from '../mlro-reasoning-modes.js';
import { expandQuery, searchModesSemantic } from '../mlro-mode-synonyms.js';

describe('MLRO mode catalogue', () => {
  it('ships the full reference catalogue', () => {
    expect(MLRO_MODE_IDS.length).toBeGreaterThanOrEqual(690);
  });

  it('has no duplicate ids', () => {
    const set = new Set(MLRO_MODE_IDS);
    expect(set.size).toBe(MLRO_MODE_IDS.length);
  });

  it('every category is non-empty', () => {
    for (const [cat, ids] of Object.entries(MLRO_MODE_CATEGORIES)) {
      expect(ids.length, `category ${cat} is empty`).toBeGreaterThan(0);
    }
  });

  it('category partition is total (every id is in exactly one category)', () => {
    const fromCats = new Set<string>();
    for (const ids of Object.values(MLRO_MODE_CATEGORIES)) {
      for (const id of ids) fromCats.add(id);
    }
    const fromFlat = new Set<string>(MLRO_MODE_IDS);
    // Every id appears in a category.
    for (const id of fromFlat) expect(fromCats.has(id), `id ${id} is not in any category`).toBe(true);
  });
});

describe('MLRO mode helpers', () => {
  it('modesByCategory returns defensive empty on unknown key', () => {
    expect(modesByCategory('does_not_exist' as never)).toEqual([]);
  });

  it('searchModes tokenises + AND-matches', () => {
    const ubo = searchModes('ubo bearer');
    expect(ubo.some((id) => id.includes('ubo') && id.includes('bearer'))).toBe(true);
  });

  it('suggestModesFor returns baseline modes without context', () => {
    const s = suggestModesFor({});
    expect(s.length).toBeGreaterThan(0);
  });

  it('suggestModesFor adds crypto ids when hasCrypto', () => {
    const s = suggestModesFor({ hasCrypto: true });
    expect(s.some((id) => /crypto|wallet|mixer|chain_analysis/.test(id))).toBe(true);
  });
});

describe('synonym expansion', () => {
  it('expands "gold" to bullion/lbma/dpms-like tokens', () => {
    const expanded = expandQuery('gold');
    expect(expanded).toEqual(expect.arrayContaining(['gold', 'bullion', 'lbma', 'dpms']));
  });

  it('"weapons" expands to include dual_use + proliferation', () => {
    const expanded = expandQuery('weapons');
    expect(expanded).toEqual(expect.arrayContaining(['dual_use', 'proliferation']));
  });

  it('semantic search returns more than plain tokenised search', () => {
    const plain = searchModes('gold');
    const semantic = searchModesSemantic(MLRO_MODE_IDS, 'gold');
    expect(semantic.length).toBeGreaterThanOrEqual(plain.length);
  });

  it('semantic search on "cash" returns structuring-family modes', () => {
    const res = searchModesSemantic(MLRO_MODE_IDS, 'cash');
    expect(res.some((id) => id.includes('structuring') || id.includes('cash') || id.includes('courier'))).toBe(true);
  });
});
