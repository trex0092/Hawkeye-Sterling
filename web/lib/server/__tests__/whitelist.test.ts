import { describe, it, expect, vi } from 'vitest';

// The whitelist module imports from @/lib/server/store at top level.
// The root vitest config does not resolve the @/ alias (it points into
// the web tree). Mock the store with a no-op so the pure helpers can be
// exercised in isolation. The store-backed functions are not exercised
// here — they're covered by the integration suite.
vi.mock('@/lib/server/store', () => ({
  getJson: vi.fn(async () => null),
  setJson: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
  listKeys: vi.fn(async () => []),
}));

import { normaliseName, validateEntryId } from '../whitelist';

describe('normaliseName', () => {
  it('lowercases', () => {
    expect(normaliseName('John SMITH')).toBe('john smith');
  });

  it('collapses runs of whitespace', () => {
    expect(normaliseName('John   M.   Smith')).toBe('john m smith');
  });

  it('strips diacritics (UAE / international name normalisation)', () => {
    expect(normaliseName('Müller')).toBe('muller');
    expect(normaliseName('Æthelred')).toBe('æthelred');
    expect(normaliseName('Niño')).toBe('nino');
    expect(normaliseName('Aïscha')).toBe('aischa');
  });

  it('removes punctuation but keeps unicode letters', () => {
    expect(normaliseName("O'Brien, J.")).toBe('o brien j');
    expect(normaliseName('محمد الفلاني')).toBe('محمد الفلاني');
  });

  it('trims', () => {
    expect(normaliseName('   leading and trailing   ')).toBe('leading and trailing');
  });

  it('handles empty input', () => {
    expect(normaliseName('')).toBe('');
    expect(normaliseName('     ')).toBe('');
  });
});

describe('validateEntryId', () => {
  it('accepts the standard generated shape', () => {
    expect(validateEntryId('wl-1779260000000-abc123')).toBe(true);
  });

  it('accepts alphanumerics + permitted punctuation', () => {
    expect(validateEntryId('a')).toBe(true);
    expect(validateEntryId('A_b-c.d:e')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(validateEntryId('')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(validateEntryId('has space')).toBe(false);
    expect(validateEntryId(' leading')).toBe(false);
    expect(validateEntryId('trailing ')).toBe(false);
  });

  it('rejects forbidden punctuation', () => {
    expect(validateEntryId('a/b')).toBe(false);
    expect(validateEntryId('a\\b')).toBe(false);
    expect(validateEntryId('a;b')).toBe(false);
    expect(validateEntryId('a<b>')).toBe(false);
    expect(validateEntryId('a$b')).toBe(false);
  });

  it('rejects oversize ids (>128 chars)', () => {
    expect(validateEntryId('a'.repeat(128))).toBe(true);
    expect(validateEntryId('a'.repeat(129))).toBe(false);
  });
});
