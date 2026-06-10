// Hawkeye Sterling — multi-source screening orchestrator.
//
// Fires 4 parallel lanes for every screen and merges results:
//   Lane A — Local corpus  (UN/OFAC/EU/UK/UAE/LSEG-supplement blobs) → quickScreen()  [always]
//   Lane B — OpenSanctions (337 sources via Yente public API)                          [always]
//   Lane C — Adverse media (Taranis AI → OSINT fallback)                               [best-effort, budget-capped]
//   Lane D — LSEG World-Check One real-time                                            [only if LSEG_WC1_MCP_URL set]
//
// Hits from A/B/D are deduplicated by normalised candidate name.
// Lane C result is included in the response but never blocks it.
// All lane timeouts derive from SCREENING_BUDGETS so the /api/screening/run
// response stays inside the 5-second SLA.

import { createHash } from 'node:crypto';
import { loadCandidates } from './candidates-loader';
import { SCREENING_BUDGETS } from './screening-budgets';
import { incrementCounter } from './metrics-store';
import type {
  QuickScreenSubject,
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResult,
  QuickScreenHit,
  QuickScreenSeverity,
  AdverseMediaItem,
  AdverseMediaSummary,
} from '@/lib/api/quickScreen.types';

// Re-export so callers that already import from here don't break.
export type { AdverseMediaItem, AdverseMediaSummary } from '@/lib/api/quickScreen.types';

// ── Exported types ────────────────────────────────────────────────────────────

export type LaneStatus = 'ok' | 'degraded' | 'skipped';

export interface MultiSourceScreeningResult extends QuickScreenResult {
  adverseMedia: AdverseMediaSummary;
  sourcesQueried: string[];
  laneHealth: Record<string, LaneStatus>;
}

// ── Brain loader (module-level cache) ─────────────────────────────────────────

type BrainScreenFn = (
  _s: QuickScreenSubject,
  _c: QuickScreenCandidate[],
  _o?: QuickScreenOptions,
) => QuickScreenResult;

let _brain: BrainScreenFn | null = null;
let _brainErr: string | null = null;

async function loadBrain(): Promise<BrainScreenFn | null> {
  if (_brain) return _brain;
  if (_brainErr) return null;
  try {
    const mod = await import('../../../src/brain/quick-screen.js') as { quickScreen: BrainScreenFn };
    _brain = mod.quickScreen;
    return _brain;
  } catch (err) {
    _brainErr = err instanceof Error ? err.message : String(err);
    return null;
  }
}

// ── Dedup key ─────────────────────────────────────────────────────────────────

function dedupKey(name: string): string {
  return name.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

// ── Severity ordering ─────────────────────────────────────────────────────────

const SEV_RANK: Record<string, number> = { clear: 0, low: 1, medium: 2, high: 3, critical: 4 };

function worseSeverity(a: QuickScreenSeverity, b: QuickScreenSeverity): QuickScreenSeverity {
  return (SEV_RANK[a] ?? 0) >= (SEV_RANK[b] ?? 0) ? a : b;
}

// ── Lane A: local corpus + quickScreen ───────────────────────────────────────

interface LaneAResult {
  result: QuickScreenResult | null;
  listsLoaded: number;
  health: LaneStatus;
}

async function runLaneA(
  subject: QuickScreenSubject,
  options: QuickScreenOptions | undefined,
  callerCandidates: QuickScreenCandidate[] | undefined,
): Promise<LaneAResult> {
  let candidates: QuickScreenCandidate[];
  let listsLoaded = 0;

  if (Array.isArray(callerCandidates) && callerCandidates.length > 0) {
    candidates = callerCandidates;
    listsLoaded = candidates.length;
  } else {
    try {
      const loaded = await loadCandidates();
      candidates = loaded.filter(
        (c): c is QuickScreenCandidate =>
          !!c &&
          typeof (c as QuickScreenCandidate).listId === 'string' &&
          typeof (c as QuickScreenCandidate).listRef === 'string' &&
          typeof (c as QuickScreenCandidate).name === 'string',
      );
      listsLoaded = candidates.length;
    } catch (err) {
      console.error('[multi-source-screener] Lane A loadCandidates failed:', err instanceof Error ? err.message : String(err));
      return { result: null, listsLoaded: 0, health: 'degraded' };
    }
  }

  if (candidates.length === 0) {
    return { result: null, listsLoaded: 0, health: 'degraded' };
  }

  const brainFn = await loadBrain();
  if (!brainFn) {
    const lowerName = subject.name.toLowerCase();
    const hits = candidates.filter((c) => {
      const cn = c.name.toLowerCase();
      return cn === lowerName || cn.includes(lowerName) || lowerName.includes(cn);
    });
    const result: QuickScreenResult = {
      subject,
      hits: hits.map((c) => ({
        listId: c.listId,
        listRef: c.listRef,
        candidateName: c.name,
        score: 95,
        baseScore: 95,
        method: 'exact' as const,
        phoneticAgreement: false,
        reason: 'Exact name match (rule-based fallback — brain unavailable)',
        sourceList: c.listId,
        riskCategory: 'sanctions' as const,
      })),
      topScore: hits.length > 0 ? 95 : 0,
      severity: (hits.length > 0 ? 'critical' : 'clear') as QuickScreenSeverity,
      listsChecked: listsLoaded,
      candidatesChecked: candidates.length,
      durationMs: 0,
      generatedAt: new Date().toISOString(),
    };
    return { result, listsLoaded, health: 'degraded' };
  }

  try {
    const result = brainFn(subject, candidates, options);
    return { result, listsLoaded, health: 'ok' };
  } catch (err) {
    console.error('[multi-source-screener] Lane A quickScreen threw:', err instanceof Error ? err.message : String(err));
    return { result: null, listsLoaded, health: 'degraded' };
  }
}

// ── Lane B: OpenSanctions via Yente ──────────────────────────────────────────

interface LaneBResult {
  hits: QuickScreenHit[];
  health: LaneStatus;
}

async function runLaneB(subject: QuickScreenSubject): Promise<LaneBResult> {
  try {
    const { yenteMatch } = await import('../../../src/integrations/yente.js') as typeof import('../../../src/integrations/yente.js');

    const schema = subject.entityType === 'individual' ? 'Person' as const
      : subject.entityType === 'organisation' ? 'Organization' as const
      : subject.entityType === 'vessel' ? 'Vessel' as const
      : 'LegalEntity' as const;

    const queries = [
      {
        name: subject.name,
        schema,
        ...(subject.nationality !== undefined ? { nationality: subject.nationality } : {}),
        ...(subject.dateOfBirth !== undefined ? { birthDate: subject.dateOfBirth } : {}),
      },
      ...(subject.aliases?.slice(0, 4).map((alias) => ({ name: alias, schema })) ?? []),
    ];

    const results = await Promise.race([
      yenteMatch(queries, { threshold: 0.6, limit: 10, timeoutMs: SCREENING_BUDGETS.RUN_LANE_B_YENTE_MS }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('yente timeout')), SCREENING_BUDGETS.RUN_LANE_B_OUTER_MS)),
    ]);

    const seen = new Set<string>();
    const hits: QuickScreenHit[] = [];

    for (const qResult of results) {
      if (!qResult.ok) continue;
      for (const yHit of qResult.hits) {
        if (seen.has(yHit.id)) continue;
        seen.add(yHit.id);
        const score = Math.round(yHit.score * 100);
        hits.push({
          listId: 'opensanctions',
          listRef: yHit.id,
          candidateName: yHit.caption,
          score,
          baseScore: score,
          method: 'jaro_winkler' as const,
          phoneticAgreement: false,
          reason: `OpenSanctions match (datasets: ${yHit.datasets.slice(0, 3).join(', ')})`,
          programs: yHit.datasets,
          sourceList: 'opensanctions',
          sourceLabel: 'OpenSanctions (337 sources)',
          riskCategory: 'sanctions' as const,
        });
      }
    }

    return { hits, health: 'ok' };
  } catch (err) {
    console.warn('[multi-source-screener] Lane B (OpenSanctions) error:', err instanceof Error ? err.message : String(err));
    return { hits: [], health: 'degraded' };
  }
}

// ── Lane C: Adverse media ─────────────────────────────────────────────────────

const ADVERSE_SEVERITY_MAP: Record<string, AdverseMediaItem['severity']> = {
  ml_financial_crime: 'high',
  terrorist_financing: 'critical',
  sanctions_violation: 'critical',
  corruption_bribery: 'high',
  trafficking_serious_crime: 'high',
};

const FATF_MAP: Record<string, string> = {
  ml_financial_crime: 'FATF R.3 (ML offence)',
  terrorist_financing: 'FATF R.5 (TF offence)',
  sanctions_violation: 'FATF R.6 (targeted financial sanctions)',
  corruption_bribery: 'FATF R.10 (CDD / corruption)',
  trafficking_serious_crime: 'FATF R.3 (predicate offences)',
};

const AM_SEV_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

async function runLaneC(subjectName: string): Promise<AdverseMediaSummary> {
  const empty: AdverseMediaSummary = {
    found: false, severity: 'none', itemCount: 0, adverseCount: 0,
    items: [], categories: [], provider: 'none', fatfPredicates: [],
  };
  // Lane budget — Taranis gets the first slice; the OSINT fallback only runs
  // when enough of the lane budget remains to be useful.
  const laneDeadline = Date.now() + SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS;

  try {
    const [{ classifyI18n }, { discoverAdverseMedia }] = await Promise.all([
      import('../../../src/brain/adverse-media-i18n.js') as Promise<typeof import('../../../src/brain/adverse-media-i18n.js')>,
      import('../../../src/integrations/osint-pipeline.js') as Promise<typeof import('../../../src/integrations/osint-pipeline.js')>,
    ]);

    let provider = 'none';
    let rawItems: Array<{
      id: string;
      title: string;
      url?: string;
      publishedAt?: string;
      source: string;
      language?: string;
      content: string;
    }> = [];

    if (process.env['TARANIS_URL'] && process.env['TARANIS_API_KEY']) {
      try {
        const { searchAdverseMedia } = await import('../../../src/integrations/taranisAi.js') as typeof import('../../../src/integrations/taranisAi.js');
        const tr = await Promise.race([
          searchAdverseMedia(subjectName, { limit: 25, timeoutMs: SCREENING_BUDGETS.RUN_LANE_C_TARANIS_INNER_MS }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('taranis timeout')), SCREENING_BUDGETS.RUN_LANE_C_TARANIS_OUTER_MS)),
        ]);
        if (tr.ok && tr.items.length > 0) {
          provider = 'taranis';
          rawItems = tr.items.map((it) => ({
            id: it.id, title: it.title, url: it.url,
            publishedAt: it.published, source: it.source,
            language: it.language, content: it.content,
          }));
        }
      } catch { /* fall through to OSINT */ }
    }

    if (rawItems.length === 0) {
      const remainingMs = laneDeadline - Date.now();
      if (remainingMs < SCREENING_BUDGETS.RUN_LANE_C_OSINT_MIN_REMAINING_MS) {
        // Not enough lane budget left for a useful OSINT pass — report a
        // budget skip (mapped to laneHealth 'degraded') rather than blowing
        // the 5s SLA. The MLRO sees the lane as degraded, never as a silent
        // "checked, clear".
        return { ...empty, provider: 'skipped_budget' };
      }
      const osint = await Promise.race([
        discoverAdverseMedia({ subjectName, pageSize: 20 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('osint timeout')), remainingMs)),
      ]);
      if (osint.ok && osint.items.length > 0) {
        provider = osint.provider;
        rawItems = osint.items.map((it) => ({
          id: it.id, title: it.title, url: it.url,
          publishedAt: it.publishedAt, source: it.source,
          language: it.language, content: it.content,
        }));
      }
    }

    if (rawItems.length === 0) return { ...empty, provider };

    const urlSeen = new Set<string>();
    const classified: AdverseMediaItem[] = [];
    const allCats = new Set<string>();
    let worstSev: AdverseMediaItem['severity'] = 'low';
    let adverseCount = 0;

    for (const raw of rawItems) {
      const urlHash = createHash('sha256').update(raw.url ?? raw.title).digest('hex').slice(0, 16);
      if (urlSeen.has(urlHash)) continue;
      urlSeen.add(urlHash);

      const text = `${raw.title} ${raw.content}`.slice(0, 2000);
      const i18nHits = classifyI18n(text);
      if (i18nHits.length === 0) continue;

      adverseCount++;
      const itemCats: string[] = [];
      for (const hit of i18nHits.slice(0, 5)) {
        const kw = hit.keyword;
        if (/launder|financ.*crime|fraud|embezzl|ponzi|structur|mule|bec/i.test(kw)) itemCats.push('ml_financial_crime');
        else if (/terror|extremi|isis|isil|al.qaeda|hezbollah|hamas|irgc/i.test(kw)) itemCats.push('terrorist_financing');
        else if (/sanction|ofac|designated|embargo|sdn|tfs/i.test(kw)) itemCats.push('sanctions_violation');
        else if (/corrupt|bribery|bribe|kickback|graft/i.test(kw)) itemCats.push('corruption_bribery');
        else if (/traffickin|smuggl|forced.labour|modern.slaver/i.test(kw)) itemCats.push('trafficking_serious_crime');
        else itemCats.push('ml_financial_crime');
      }

      const dedupCats = [...new Set(itemCats)];
      for (const c of dedupCats) allCats.add(c);

      const itemSev = dedupCats.reduce<AdverseMediaItem['severity']>((worst, cat) => {
        const s = ADVERSE_SEVERITY_MAP[cat] ?? 'low';
        return (AM_SEV_RANK[s] ?? 0) > (AM_SEV_RANK[worst] ?? 0) ? s : worst;
      }, 'low');

      if ((AM_SEV_RANK[itemSev] ?? 0) > (AM_SEV_RANK[worstSev] ?? 0)) worstSev = itemSev;

      classified.push({
        id: raw.id, title: raw.title, url: raw.url ?? '',
        ...(raw.publishedAt !== undefined ? { publishedAt: raw.publishedAt } : {}),
        source: raw.source,
        ...(raw.language !== undefined ? { language: raw.language } : {}),
        categories: dedupCats, severity: itemSev,
      });

      if (classified.length >= 50) break;
    }

    if (classified.length === 0) return { ...empty, provider };

    const fatfPredicates = [...allCats].map((c) => FATF_MAP[c] ?? '').filter(Boolean);

    return {
      found: adverseCount > 0,
      severity: adverseCount > 0 ? worstSev : 'none',
      itemCount: classified.length,
      adverseCount,
      items: classified.slice(0, 10),
      categories: [...allCats],
      provider,
      fatfPredicates: [...new Set(fatfPredicates)],
    };
  } catch (err) {
    console.warn('[multi-source-screener] Lane C (adverse media) error:', err instanceof Error ? err.message : String(err));
    return empty;
  }
}

// ── Lane D: LSEG World-Check One ─────────────────────────────────────────────

interface LaneDResult {
  hits: QuickScreenHit[];
  health: LaneStatus;
}

async function runLaneD(subject: QuickScreenSubject): Promise<LaneDResult> {
  if (!process.env['LSEG_WC1_MCP_URL']) return { hits: [], health: 'skipped' };

  try {
    const { screenName } = await import('../../../src/integrations/lseg-wc1-mcp.js') as typeof import('../../../src/integrations/lseg-wc1-mcp.js');

    const entityType = subject.entityType === 'individual' ? 'INDIVIDUAL' as const
      : subject.entityType === 'organisation' ? 'ORGANISATION' as const
      : subject.entityType === 'vessel' ? 'VESSEL' as const
      : undefined;

    const wc1 = await Promise.race([
      screenName(subject.name, { ...(entityType !== undefined ? { entityType } : {}), limit: 10 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LSEG WC1 timeout')), SCREENING_BUDGETS.RUN_LANE_D_OUTER_MS)),
    ]);

    if (!wc1.ok) {
      console.warn('[multi-source-screener] Lane D (LSEG WC1) error:', (wc1 as { ok: false; error: string }).error);
      return { hits: [], health: 'degraded' };
    }

    const hits: QuickScreenHit[] = wc1.hits.map((wHit) => {
      const score = wHit.matchScore ?? 75;
      return {
        listId: 'lseg_wc1',
        listRef: wHit.entityId ?? wHit.name,
        candidateName: wHit.name,
        score,
        baseScore: score,
        method: 'jaro_winkler' as const,
        phoneticAgreement: false,
        reason: `LSEG World-Check One match (categories: ${(wHit.categories ?? []).join(', ')})`,
        programs: wHit.categories ?? [],
        sourceList: 'lseg_wc1',
        sourceLabel: 'LSEG World-Check One',
        riskCategory: 'sanctions' as const,
      };
    });

    return { hits, health: 'ok' };
  } catch (err) {
    console.warn('[multi-source-screener] Lane D (LSEG WC1) error:', err instanceof Error ? err.message : String(err));
    return { hits: [], health: 'degraded' };
  }
}

// ── Merge hits from A + B + D ─────────────────────────────────────────────────

function mergeHits(
  laneAHits: QuickScreenHit[],
  laneBHits: QuickScreenHit[],
  laneDHits: QuickScreenHit[],
): QuickScreenHit[] {
  const groups = new Map<string, { hit: QuickScreenHit; extraLists: string[] }>();

  for (const hit of [...laneAHits, ...laneBHits, ...laneDHits]) {
    const key = dedupKey(hit.candidateName);
    const existing = groups.get(key);
    if (existing) {
      existing.extraLists.push(hit.listId);
      if (hit.score > existing.hit.score) {
        existing.hit = {
          ...hit,
          programs: [...new Set([...(existing.hit.programs ?? []), ...(hit.programs ?? [])])],
        };
      }
    } else {
      groups.set(key, { hit, extraLists: [] });
    }
  }

  return [...groups.values()].map(({ hit, extraLists }) => {
    if (extraLists.length === 0) return hit;
    return {
      ...hit,
      reason: `${hit.reason} [Also on: ${extraLists.join(', ')}]`,
      programs: [...new Set([...(hit.programs ?? []), ...extraLists])],
    };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

const ADVERSE_MEDIA_TIMEOUT_MS = SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS;

const EMPTY_ADVERSE: AdverseMediaSummary = {
  found: false, severity: 'none', itemCount: 0, adverseCount: 0,
  items: [], categories: [], provider: 'none', fatfPredicates: [],
};

export async function runMultiSourceScreening(
  subject: QuickScreenSubject,
  options?: QuickScreenOptions,
  callerCandidates?: QuickScreenCandidate[],
): Promise<MultiSourceScreeningResult> {
  const t0 = Date.now();
  const laneHealth: Record<string, LaneStatus> = {};
  const sourcesQueried: string[] = [];

  // Per-lane duration metrics — same counter family LatencyBudget emits, so
  // operators can see which lane is eating the 5s budget.
  const timed = <T>(phase: string, p: Promise<T>): Promise<T> => {
    const start = Date.now();
    const record = () => {
      incrementCounter('hawkeye_phase_duration_ms_total', Date.now() - start, { route: 'screening-run', phase });
      incrementCounter('hawkeye_phase_calls_total', 1, { route: 'screening-run', phase });
    };
    return p.then((v) => { record(); return v; }, (e: unknown) => { record(); throw e; });
  };

  const [laneASettled, laneBSettled, laneDSettled, laneCSettled] = await Promise.allSettled([
    timed('lane_a_local', runLaneA(subject, options, callerCandidates)),
    timed('lane_b_opensanctions', runLaneB(subject)),
    timed('lane_d_lseg', runLaneD(subject)),
    // Lane C: best-effort — always resolves (timeout produces empty summary)
    timed('lane_c_adverse_media', Promise.race([
      runLaneC(subject.name),
      new Promise<AdverseMediaSummary>((resolve) =>
        setTimeout(() => resolve({ ...EMPTY_ADVERSE, provider: 'timeout' }), ADVERSE_MEDIA_TIMEOUT_MS),
      ),
    ])),
  ]);

  const laneA = laneASettled.status === 'fulfilled'
    ? laneASettled.value
    : { result: null, listsLoaded: 0, health: 'degraded' as LaneStatus };

  const laneB = laneBSettled.status === 'fulfilled'
    ? laneBSettled.value
    : { hits: [], health: 'degraded' as LaneStatus };

  const laneD = laneDSettled.status === 'fulfilled'
    ? laneDSettled.value
    : { hits: [], health: 'degraded' as LaneStatus };

  const adverseMedia = laneCSettled.status === 'fulfilled'
    ? laneCSettled.value
    : { ...EMPTY_ADVERSE, provider: 'error' };

  // Lane health + sources audit
  laneHealth['local_corpus'] = laneA.health;
  sourcesQueried.push('local_corpus');

  laneHealth['opensanctions'] = laneB.health;
  sourcesQueried.push('opensanctions');

  laneHealth['lseg_wc1'] = laneD.health;
  if (laneD.health !== 'skipped') sourcesQueried.push('lseg_wc1');

  laneHealth['adverse_media'] = adverseMedia.provider !== 'none' && adverseMedia.provider !== 'timeout' && adverseMedia.provider !== 'error' && adverseMedia.provider !== 'skipped_budget'
    ? 'ok'
    : 'degraded';
  sourcesQueried.push('adverse_media');

  // If Lane A has no result we have nothing to return
  if (!laneA.result) {
    return {
      subject,
      hits: [],
      topScore: 0,
      severity: 'clear',
      listsChecked: 0,
      candidatesChecked: 0,
      durationMs: Date.now() - t0,
      generatedAt: new Date().toISOString(),
      adverseMedia,
      sourcesQueried,
      laneHealth,
    };
  }

  // Merge watchlist hits from A + B + D
  const mergedHits = mergeHits(laneA.result.hits, laneB.hits, laneD.hits);

  // Re-compute topScore and severity across all merged hits
  const topScore = mergedHits.length > 0
    ? Math.max(...mergedHits.map((h) => h.score))
    : 0;

  // Severity: take the worse of Lane A's assessment and what the merged top score implies
  const impliedSeverity: QuickScreenSeverity =
    topScore >= 95 ? 'critical'
    : topScore >= 80 ? 'high'
    : topScore >= 60 ? 'medium'
    : topScore >= 40 ? 'low'
    : 'clear';

  const severity = worseSeverity(laneA.result.severity, impliedSeverity);

  // listsChecked: local corpus + opensanctions (337) + optional WC1
  const extraLists = laneB.hits.length > 0 ? 337 : 0;
  const wc1Lists = laneD.health === 'ok' ? 1 : 0;
  const listsChecked = laneA.listsLoaded + extraLists + wc1Lists;

  return {
    ...laneA.result,
    hits: mergedHits,
    topScore,
    severity,
    listsChecked,
    durationMs: Date.now() - t0,
    adverseMedia,
    sourcesQueried,
    laneHealth,
  };
}
