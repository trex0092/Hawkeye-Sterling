import { describe, expect, it, beforeEach } from 'vitest';
import { inMemoryStore, EmptyOverwriteRefusedError } from '../blobs-store.js';
import type { BlobsStore } from '../blobs-store.js';
import type { IngestionReport, NormalisedEntity } from '../types.js';

// Use inMemoryStore() directly so tests stay credential-free and exercise the
// exact same guard logic as the Netlify Blobs path.
//
// The integrity guard is the production safety net against the regulator-grade
// failure mode observed in the audit-v9 deploy (watchlist_corpus collapsed
// 6,651 → 65 entries). If a parser regression makes an adapter return zero
// entities, the runner must refuse to overwrite the last-healthy snapshot.

const SAMPLE_ENTITY: NormalisedEntity = {
  id: 'OFAC-SDN-1',
  name: 'Test Person',
  aliases: [],
  type: 'individual',
  nationalities: ['XX'],
  jurisdictions: [],
  listings: [{ source: 'OFAC-SDN', reference: 'OFAC-SDN-1' }],
  source: 'OFAC-SDN',
};

function freshReport(listId: string): IngestionReport {
  return {
    listId,
    sourceUrl: 'https://example.test/list',
    recordCount: 0,
    checksum: '',
    fetchedAt: Date.now(),
    durationMs: 1,
    errors: [],
  };
}

describe('blobs-store feed-integrity guard', () => {
  // A fresh in-memory store per test — equivalent to a Lambda cold start.
  let store: BlobsStore;
  beforeEach(() => {
    store = inMemoryStore();
  });

  it('allows the first write when no prior snapshot exists, even with zero entities', async () => {
    const listId = `test-fresh-empty-${Math.random()}`;
    await expect(
      store.putDataset(listId, [], freshReport(listId)),
    ).resolves.toBeUndefined();
    const got = await store.getLatest(listId);
    expect(got?.entities).toEqual([]);
  });

  it('allows non-empty write that replaces a healthy snapshot', async () => {
    const listId = `test-replace-${Math.random()}`;
    await store.putDataset(listId, [SAMPLE_ENTITY], freshReport(listId));
    const newEntity: NormalisedEntity = { ...SAMPLE_ENTITY, id: 'OFAC-SDN-2', name: 'Other' };
    await store.putDataset(listId, [SAMPLE_ENTITY, newEntity], freshReport(listId));
    const got = await store.getLatest(listId);
    expect(got?.entities).toHaveLength(2);
  });

  it('REFUSES empty overwrite when prior snapshot is healthy', async () => {
    const listId = `test-refuse-${Math.random()}`;
    await store.putDataset(listId, [SAMPLE_ENTITY], freshReport(listId));

    await expect(
      store.putDataset(listId, [], freshReport(listId)),
    ).rejects.toBeInstanceOf(EmptyOverwriteRefusedError);

    // Prior snapshot must be preserved.
    const got = await store.getLatest(listId);
    expect(got?.entities).toHaveLength(1);
    expect(got?.entities[0]?.id).toBe('OFAC-SDN-1');
  });

  it('exposes the prior entity count on the refusal so on-call sees the impact', async () => {
    const listId = `test-refusal-detail-${Math.random()}`;
    await store.putDataset(
      listId,
      [SAMPLE_ENTITY, { ...SAMPLE_ENTITY, id: 'OFAC-SDN-2' }, { ...SAMPLE_ENTITY, id: 'OFAC-SDN-3' }],
      freshReport(listId),
    );

    let captured: EmptyOverwriteRefusedError | null = null;
    try {
      await store.putDataset(listId, [], freshReport(listId));
    } catch (err) {
      captured = err as EmptyOverwriteRefusedError;
    }
    expect(captured).toBeInstanceOf(EmptyOverwriteRefusedError);
    expect(captured?.listId).toBe(listId);
    expect(captured?.priorEntityCount).toBe(3);
    expect(captured?.message).toContain('refused to overwrite');
  });

  it('honours the explicit allowEmpty escape hatch for operator-driven resets', async () => {
    const listId = `test-allow-empty-${Math.random()}`;
    await store.putDataset(listId, [SAMPLE_ENTITY], freshReport(listId));
    await expect(
      store.putDataset(listId, [], freshReport(listId), { allowEmpty: true }),
    ).resolves.toBeUndefined();
    const got = await store.getLatest(listId);
    expect(got?.entities).toEqual([]);
  });
});
