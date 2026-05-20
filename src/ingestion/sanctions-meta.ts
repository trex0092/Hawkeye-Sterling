// Builds the `sanctions/meta.json` payload that /api/screening/health reads
// to determine corpus freshness. Schema is dictated by the reader at
// web/app/api/screening/health/route.ts:checkSanctionsLists — keep the
// `updatedAt` (ISO string) and `totalEntries` (number) fields in lockstep
// with that consumer. The remaining fields are optional supplemental
// signal for operators reading the blob directly.

import type { IngestRunSummary } from './run-all.js';

export interface SanctionsMeta {
  updatedAt: string;
  totalEntries: number;
  listCount: number;
  listsOk: number;
  listsFailed: number;
  label: string;
}

export function buildSanctionsMeta(
  result: IngestRunSummary,
  label: string,
  now: Date = new Date(),
): SanctionsMeta {
  const totalEntries = result.summary.reduce(
    (sum, r) => sum + (typeof r.recordCount === 'number' ? r.recordCount : 0),
    0,
  );
  return {
    updatedAt: now.toISOString(),
    totalEntries,
    listCount: result.summary.length,
    listsOk: result.ok_count,
    listsFailed: result.failed_count,
    label,
  };
}
