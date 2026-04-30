// Hawkeye Sterling — wave-3 mode: mule_cluster_detection (audit follow-up #7).
//
// Detects money-mule cluster patterns: multiple low-profile accounts
// receiving funds from a common source then forwarding to a common
// destination, with low-substance accounts (recent opening, no
// employment, transit-only flows). Composes with ring-detector but
// operates per-screening.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface MuleAccount {
  accountId: string;
  ownerId?: string;
  openedAt?: string;
  employmentStatus?: 'employed' | 'unemployed' | 'student' | 'retired' | 'unknown';
  inflowsFromIds?: string[];
  outflowsToIds?: string[];
  netHoldingDays?: number;
  totalInflow?: number;
  totalOutflow?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }

function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const muleClusterApply = async (ctx: BrainContext): Promise<Finding> => {
  const accts = typedEvidence<MuleAccount>(ctx, 'muleAccounts');
  if (accts.length === 0) {
    return {
      modeId: 'mule_cluster_detection',
      category: 'forensic' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0,
      confidence: 0.2,
      verdict: 'inconclusive' as Verdict,
      rationale: 'No muleAccounts evidence supplied.',
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];

  // 1. Common-source clustering.
  const sourceCounts = new Map<string, number>();
  for (const a of accts) for (const s of a.inflowsFromIds ?? []) sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
  for (const [src, n] of sourceCounts) {
    if (n >= 4) hits.push({ id: 'common_source', label: `Common inflow source across ${n} accounts`, weight: 0.25, evidence: `${src.slice(0, 12)}… (${n} accts)` });
  }

  // 2. Common-destination clustering.
  const destCounts = new Map<string, number>();
  for (const a of accts) for (const d of a.outflowsToIds ?? []) destCounts.set(d, (destCounts.get(d) ?? 0) + 1);
  for (const [dest, n] of destCounts) {
    if (n >= 4) hits.push({ id: 'common_destination', label: `Common outflow destination across ${n} accounts`, weight: 0.25, evidence: `${dest.slice(0, 12)}… (${n} accts)` });
  }

  // 3. Low-substance + transit-only.
  const transitOnly = accts.filter((a) =>
    (a.netHoldingDays ?? Infinity) <= 3 &&
    (a.employmentStatus === 'unemployed' || a.employmentStatus === 'student' || a.employmentStatus === 'unknown') &&
    (a.totalInflow ?? 0) > 0 && Math.abs((a.totalInflow ?? 0) - (a.totalOutflow ?? 0)) / Math.max(1, a.totalInflow ?? 1) < 0.05,
  );
  if (transitOnly.length >= 2) {
    hits.push({ id: 'transit_only_cluster', label: `${transitOnly.length} transit-only low-substance accounts`, weight: 0.3, evidence: transitOnly.slice(0, 4).map((a) => a.accountId.slice(0, 10)).join(', ') });
  }

  // 4. Recently-opened accounts.
  const cutoff = Date.now() - 90 * 86_400_000;
  const young = accts.filter((a) => a.openedAt && Date.parse(a.openedAt) >= cutoff);
  if (young.length >= 3) hits.push({ id: 'young_accounts', label: `${young.length} accounts opened in last 90 days`, weight: 0.15, evidence: `${young.length}/${accts.length}` });

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'mule_cluster_detection',
    category: 'forensic' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score,
    confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: `${hits.length} mule-cluster signal(s) over ${accts.length} accounts. ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.20 (STR) · UAE FDL 10/2025 Art.15.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default muleClusterApply;
