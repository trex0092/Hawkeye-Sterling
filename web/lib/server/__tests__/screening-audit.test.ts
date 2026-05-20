import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuditChainEvent } from '../audit-chain';

// vi.mock factories are hoisted above import-statements. Capture the mock
// references via vi.hoisted() so the references survive that hoist. Cast
// through `unknown` — vi.fn() without a signature defaults to `() => any`,
// which would produce empty-tuple inference at every call site.
const { writeAuditChainEntryMock, blobGetMock } = vi.hoisted(() => ({
  writeAuditChainEntryMock: vi.fn(async () => true) as unknown as ReturnType<
    typeof vi.fn<(_e: AuditChainEvent, _t?: string) => Promise<boolean>>
  >,
  blobGetMock: vi.fn() as unknown as ReturnType<
    typeof vi.fn<(_k: string, _o?: { type?: string }) => Promise<unknown>>
  >,
}));

vi.mock('../audit-chain', () => ({
  writeAuditChainEntry: writeAuditChainEntryMock,
}));

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({ get: blobGetMock }),
}));

import { ScreeningAuditWriter } from '../screening-audit';
import { DEFAULT_MATCH_THRESHOLD } from '../list-versions';

beforeEach(() => {
  writeAuditChainEntryMock.mockClear();
  blobGetMock.mockReset();
});

describe('ScreeningAuditWriter', () => {
  it('enriches the audit body with J-04 list versions + J-05 match threshold', async () => {
    blobGetMock.mockImplementation(async (key: string) => {
      if (key === 'un_consolidated/latest.json') {
        return {
          metadata: { entityCount: 1009, fetchedAt: '2026-05-19T03:00:00.000Z', sha256: 'sha_un' },
          entities: [],
        };
      }
      return null;
    });

    const writer = new ScreeningAuditWriter({ matchThreshold: 0.9 });
    const ok = await writer.write({
      event: 'screening.completed',
      actor: 'analyst@example',
      subject: 'Acme Corp',
      severity: 'clear',
      hitsCount: 0,
    });

    expect(ok).toBe(true);
    expect(writeAuditChainEntryMock).toHaveBeenCalledOnce();
    const [body, tenant] = writeAuditChainEntryMock.mock.calls[0]!;
    expect(tenant).toBe('default');
    expect(body.event).toBe('screening.completed');
    expect(body.actor).toBe('analyst@example');
    expect(body.matchThreshold).toBe(0.9);
    expect((body.listVersions as Record<string, unknown>)['un_consolidated']).toEqual({
      entityCount: 1009,
      fetchedAt: '2026-05-19T03:00:00.000Z',
      sha256: 'sha_un',
    });
    expect(body.listVersionsStoreUnavailable).toBe(false);
    expect(typeof body.listVersionsCapturedAt).toBe('string');
    expect(Number.isFinite(Date.parse(String(body.listVersionsCapturedAt)))).toBe(true);
  });

  it('memoises the list-version capture across multiple writes in one request', async () => {
    blobGetMock.mockResolvedValue({
      metadata: { entityCount: 1, fetchedAt: '2026-05-19T03:00:00.000Z' },
      entities: [{ id: 'a' }],
    });

    const writer = new ScreeningAuditWriter({ matchThreshold: 0.85 });
    await writer.write({ event: 'screening.whitelisted', actor: 'a', subject: 's1' });
    await writer.write({ event: 'screening.completed',  actor: 'a', subject: 's1' });
    await writer.write({ event: 'screening.completed',  actor: 'a', subject: 's2' });

    expect(writeAuditChainEntryMock).toHaveBeenCalledTimes(3);
    // Capture happens once even though 3 writes happened — measured by the
    // number of times blobGetMock was called for any single list id. Each
    // capture issues exactly one read per list in SNAPSHOT_LIST_IDS.
    const uniqueCalls = new Set(blobGetMock.mock.calls.map((c) => c[0])).size;
    // 10 unique snapshot ids; if we re-captured per write we'd see 30 calls.
    expect(blobGetMock.mock.calls.length).toBe(uniqueCalls);

    // And the listVersionsCapturedAt timestamp is identical across the 3 entries.
    const t0 = writeAuditChainEntryMock.mock.calls[0]![0].listVersionsCapturedAt;
    const t1 = writeAuditChainEntryMock.mock.calls[1]![0].listVersionsCapturedAt;
    const t2 = writeAuditChainEntryMock.mock.calls[2]![0].listVersionsCapturedAt;
    expect(t0).toBe(t1);
    expect(t1).toBe(t2);
  });

  it('normalises an out-of-range threshold to the [0,1] envelope', async () => {
    blobGetMock.mockResolvedValue(null);
    const writer = new ScreeningAuditWriter({ matchThreshold: 99 });
    await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' });
    expect(writeAuditChainEntryMock.mock.calls[0]![0].matchThreshold).toBe(1);
  });

  it('falls back to the documented default when threshold is not a number', async () => {
    blobGetMock.mockResolvedValue(null);
    const writer = new ScreeningAuditWriter({ matchThreshold: 'high' });
    await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' });
    expect(writeAuditChainEntryMock.mock.calls[0]![0].matchThreshold).toBe(DEFAULT_MATCH_THRESHOLD);
  });

  it('records storeUnavailable: true if every list read returns null (empty Blobs)', async () => {
    blobGetMock.mockResolvedValue(null);
    const writer = new ScreeningAuditWriter({ matchThreshold: 0.9 });
    await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' });
    const body = writeAuditChainEntryMock.mock.calls[0]![0];
    // storeUnavailable is reserved for a wholesale store outage; per-list
    // missing blobs come through as null entries with storeUnavailable: false.
    expect(body.listVersionsStoreUnavailable).toBe(false);
    expect((body.listVersions as Record<string, unknown>)['un_consolidated']).toBeNull();
  });

  it('passes the tenantId through to writeAuditChainEntry', async () => {
    blobGetMock.mockResolvedValue(null);
    const writer = new ScreeningAuditWriter({ matchThreshold: 0.9 });
    await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' }, 'tenant-x');
    expect(writeAuditChainEntryMock.mock.calls[0]![1]).toBe('tenant-x');
  });

  it('returns the boolean from writeAuditChainEntry unchanged', async () => {
    blobGetMock.mockResolvedValue(null);
    writeAuditChainEntryMock.mockResolvedValueOnce(false);
    const writer = new ScreeningAuditWriter({ matchThreshold: 0.9 });
    const ok = await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' });
    expect(ok).toBe(false);
  });

  it('survives a per-list blob read that throws (single failure must not break the audit)', async () => {
    blobGetMock.mockImplementation(async (key: string) => {
      if (key === 'ofac_sdn/latest.json') throw new Error('transient');
      return {
        metadata: { entityCount: 1, fetchedAt: '2026-05-19T03:00:00.000Z' },
        entities: [{ id: 'a' }],
      };
    });
    const writer = new ScreeningAuditWriter({ matchThreshold: 0.9 });
    const ok = await writer.write({ event: 'screening.completed', actor: 'a', subject: 's' });
    expect(ok).toBe(true);
    const body = writeAuditChainEntryMock.mock.calls[0]![0];
    const versions = body.listVersions as Record<string, { entityCount?: number } | null>;
    expect(versions['ofac_sdn']).toBeNull();
    expect(versions['un_consolidated']?.entityCount).toBe(1);
  });
});
