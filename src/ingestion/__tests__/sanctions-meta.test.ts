import { describe, it, expect } from 'vitest';
import { buildSanctionsMeta } from '../sanctions-meta.js';
import type { IngestRunSummary } from '../run-all.js';
import type { IngestionReport } from '../types.js';

function mkReport(listId: string, recordCount: number): IngestionReport {
  return {
    listId,
    sourceUrl: `https://example/${listId}`,
    recordCount,
    checksum: 'x'.repeat(64),
    fetchedAt: 0,
    durationMs: 0,
    errors: [],
  };
}

function mkSummary(reports: IngestionReport[], failed = 0): IngestRunSummary {
  return {
    ok: failed === 0,
    at: '2026-05-20T03:00:00.000Z',
    durationMs: 1234,
    ok_count: reports.length - failed,
    failed_count: failed,
    anyWriteFailed: false,
    summary: reports,
  };
}

describe('buildSanctionsMeta', () => {
  it('sums recordCount across all lists', () => {
    const result = mkSummary([
      mkReport('un_consolidated', 1000),
      mkReport('ofac_sdn', 13000),
      mkReport('eu_fsf', 2500),
    ]);
    const meta = buildSanctionsMeta(result, 'refresh-lists', new Date('2026-05-20T03:00:00.000Z'));
    expect(meta.totalEntries).toBe(16500);
    expect(meta.listCount).toBe(3);
    expect(meta.listsOk).toBe(3);
    expect(meta.listsFailed).toBe(0);
  });

  it('includes failed-list counters when ingestion partially fails', () => {
    const result = mkSummary(
      [mkReport('un_consolidated', 1000), mkReport('uae_eocn', 0)],
      1,
    );
    const meta = buildSanctionsMeta(result, 'refresh-lists');
    expect(meta.listsOk).toBe(1);
    expect(meta.listsFailed).toBe(1);
    expect(meta.totalEntries).toBe(1000);
  });

  it('emits ISO-8601 updatedAt matching /api/screening/health staleness check', () => {
    const now = new Date('2026-05-20T03:00:00.000Z');
    const meta = buildSanctionsMeta(mkSummary([mkReport('un_consolidated', 1)]), 'refresh-lists', now);
    // checkSanctionsLists parses with Date.parse, which must succeed.
    expect(Number.isFinite(Date.parse(meta.updatedAt))).toBe(true);
    expect(meta.updatedAt).toBe('2026-05-20T03:00:00.000Z');
  });

  it('treats non-numeric recordCount as zero (defensive)', () => {
    const report = mkReport('weird', 0);
    // Force-cast to simulate an upstream giving us undefined.
    (report as unknown as { recordCount: unknown }).recordCount = undefined;
    const meta = buildSanctionsMeta(mkSummary([report]), 'refresh-lists');
    expect(meta.totalEntries).toBe(0);
  });

  it('shape satisfies the screening/health reader contract', () => {
    const meta = buildSanctionsMeta(mkSummary([mkReport('un_consolidated', 1)]), 'refresh-lists');
    // Reader at web/app/api/screening/health/route.ts reads { updatedAt?, totalEntries? }
    // and computes ageMs from updatedAt. Both must be present and well-typed.
    expect(typeof meta.updatedAt).toBe('string');
    expect(typeof meta.totalEntries).toBe('number');
  });
});
