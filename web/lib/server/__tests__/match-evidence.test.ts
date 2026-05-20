import { describe, it, expect, vi } from 'vitest';
import {
  captureMatchEvidence,
  findEntityByListRef,
  projectEntity,
  type MatchEvidenceStore,
} from '../match-evidence';

function makeStore(map: Record<string, unknown>): MatchEvidenceStore {
  return { get: vi.fn(async (key: string) => map[key] ?? null) };
}

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ofac_sdn:12345',
    name: 'Acme Trading LLC',
    aliases: ['Acme Trading', 'A.T. LLC'],
    type: 'entity',
    nationalities: ['IR'],
    dateOfBirth: '',
    identifiers: { swift: 'ACMEAEAD' },
    addresses: ['Dubai, UAE'],
    listings: [{ source: 'ofac_sdn', program: 'IRAN', reference: '12345', authorityUrl: 'https://example' }],
    ...overrides,
  };
}

describe('projectEntity', () => {
  it('projects a well-formed entity into the canonical audit shape', () => {
    const out = projectEntity(makeEntity());
    expect(out).toEqual({
      id: 'ofac_sdn:12345',
      name: 'Acme Trading LLC',
      aliases: ['Acme Trading', 'A.T. LLC'],
      type: 'entity',
      nationalities: ['IR'],
      identifiers: { swift: 'ACMEAEAD' },
      addresses: ['Dubai, UAE'],
      listings: [{ source: 'ofac_sdn', program: 'IRAN', reference: '12345', authorityUrl: 'https://example' }],
    });
  });

  it('omits empty-string fields (defensive against partial blobs)', () => {
    const out = projectEntity({ name: 'X', dateOfBirth: '', id: '' });
    expect(out).toEqual({ name: 'X' });
  });

  it('omits empty arrays', () => {
    const out = projectEntity({ name: 'X', aliases: [], nationalities: [], addresses: [] });
    expect(out).toEqual({ name: 'X' });
  });

  it('filters non-string entries from string arrays', () => {
    const out = projectEntity({ name: 'X', aliases: ['ok', '', null, undefined, 42, 'fine'] });
    expect(out?.aliases).toEqual(['ok', 'fine']);
  });

  it('keeps only string-valued identifier entries', () => {
    const out = projectEntity({ name: 'X', identifiers: { swift: 'ABC', bad: null, n: 1, ok: 'yes' } });
    expect(out?.identifiers).toEqual({ swift: 'ABC', ok: 'yes' });
  });

  it('omits identifiers when all values are non-string', () => {
    const out = projectEntity({ name: 'X', identifiers: { a: null, b: 1 } });
    expect(out?.identifiers).toBeUndefined();
  });

  it('keeps listings with at least one meaningful field', () => {
    const out = projectEntity({
      name: 'X',
      listings: [
        { source: 'ofac_sdn', reference: '1' },
        {}, // empty listing — dropped
        { program: 'IRAN' },
      ],
    });
    expect(out?.listings).toEqual([{ source: 'ofac_sdn', reference: '1' }, { program: 'IRAN' }]);
  });

  it('returns null for non-object input', () => {
    expect(projectEntity(null)).toBeNull();
    expect(projectEntity(undefined)).toBeNull();
    expect(projectEntity('string')).toBeNull();
    expect(projectEntity(123)).toBeNull();
    expect(projectEntity([])).toBeNull();
  });

  it('returns null for an object with no extractable fields', () => {
    expect(projectEntity({})).toBeNull();
    expect(projectEntity({ name: '', id: '', aliases: [] })).toBeNull();
  });
});

describe('findEntityByListRef', () => {
  const blob = {
    entities: [
      { id: 'ofac_sdn:111', name: 'First',  listings: [{ reference: '111' }] },
      { id: 'ofac_sdn:222', name: 'Second', listings: [{ reference: '222' }] },
      { id: '333',          name: 'Third',  listings: [{ reference: 'X' }] },
      { id: 'no_listings',  name: 'Fourth' },
    ],
  };

  it('finds by listings[].reference', () => {
    const r = findEntityByListRef(blob, '222');
    expect((r as { name: string }).name).toBe('Second');
  });

  it('finds by exact id match', () => {
    const r = findEntityByListRef(blob, '333');
    expect((r as { name: string }).name).toBe('Third');
  });

  it('finds by id suffix (id ends with :listRef)', () => {
    const r = findEntityByListRef(blob, '111');
    expect((r as { name: string }).name).toBe('First');
  });

  it('returns null when no entity matches', () => {
    expect(findEntityByListRef(blob, 'never')).toBeNull();
  });

  it('returns null on an empty blob', () => {
    expect(findEntityByListRef({ entities: [] }, '111')).toBeNull();
    expect(findEntityByListRef({}, '111')).toBeNull();
    expect(findEntityByListRef(null, '111')).toBeNull();
  });

  it('returns null on whitespace-only listRef', () => {
    expect(findEntityByListRef(blob, '   ')).toBeNull();
    expect(findEntityByListRef(blob, '')).toBeNull();
  });
});

describe('captureMatchEvidence', () => {
  const FIXED_NOW = new Date('2026-05-20T10:00:00.000Z');

  it('returns a structured snapshot when the entity is found', async () => {
    const store = makeStore({
      'ofac_sdn/latest.json': {
        metadata: { fetchedAt: '2026-05-19T03:00:00.000Z' },
        entities: [makeEntity()],
      },
    });
    const snap = await captureMatchEvidence(store, 'ofac_sdn', '12345', FIXED_NOW);
    expect(snap.listId).toBe('ofac_sdn');
    expect(snap.listRef).toBe('12345');
    expect(snap.fetchedAt).toBe('2026-05-19T03:00:00.000Z');
    expect(snap.snapshottedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(snap.entity?.name).toBe('Acme Trading LLC');
  });

  it('returns null entity when listRef is absent from the list (delisted)', async () => {
    const store = makeStore({
      'ofac_sdn/latest.json': {
        metadata: { fetchedAt: '2026-05-19T03:00:00.000Z' },
        entities: [makeEntity({ id: 'ofac_sdn:other', listings: [{ reference: 'other' }] })],
      },
    });
    const snap = await captureMatchEvidence(store, 'ofac_sdn', '12345', FIXED_NOW);
    expect(snap.entity).toBeNull();
    expect(snap.fetchedAt).toBe('2026-05-19T03:00:00.000Z');
  });

  it('returns null entity and null fetchedAt when the blob is missing', async () => {
    const store = makeStore({});
    const snap = await captureMatchEvidence(store, 'ofac_sdn', '12345', FIXED_NOW);
    expect(snap.entity).toBeNull();
    expect(snap.fetchedAt).toBeNull();
  });

  it('returns a degraded snapshot when store is null (Blobs unavailable)', async () => {
    const snap = await captureMatchEvidence(null, 'ofac_sdn', '12345', FIXED_NOW);
    expect(snap.listId).toBe('ofac_sdn');
    expect(snap.listRef).toBe('12345');
    expect(snap.entity).toBeNull();
    expect(snap.fetchedAt).toBeNull();
    expect(snap.snapshottedAt).toBe('2026-05-20T10:00:00.000Z');
  });

  it('survives a thrown store.get (transient blob error)', async () => {
    const store: MatchEvidenceStore = {
      get: vi.fn(async () => { throw new Error('blob outage'); }),
    };
    const snap = await captureMatchEvidence(store, 'ofac_sdn', '12345', FIXED_NOW);
    expect(snap.entity).toBeNull();
    expect(snap.fetchedAt).toBeNull();
  });

  it('uses current time when no clock is injected', async () => {
    const store = makeStore({});
    const before = Date.now();
    const snap = await captureMatchEvidence(store, 'ofac_sdn', '12345');
    const after = Date.now();
    const ts = Date.parse(snap.snapshottedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
