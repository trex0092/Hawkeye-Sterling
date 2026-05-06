// GET /api/mlro/mode-performance
//
// Per-mode performance leaderboard — returns Brier, log-score,
// agreement, drift bucket, and ranking for every reasoning mode the
// journal has seen. Required by HS-MC-002 §6 ("Mode effectiveness
// leaderboard") and HS-MC-001 §9.1.
//
// Query params:
//   ?since=<ISO>             — only count records at >= since
//   ?until=<ISO>             — only count records at <= until
//   ?sort=brier|log|agree|total  — sort order (default brier ascending)
//   ?direction=asc|desc      — sort direction (default depends on sort)
//   ?limit=<N>               — cap results (default 500, 0 = all)
//
// Response:
//   {
//     ok, total, since, until,
//     modes: [{ rank, modeId, total, resolved, brierMean, logScoreMean,
//               agreementRate, drift: 'stable'|'drifting'|'uncalibrated' }]
//   }
//
// Differs from /api/mlro/performance (per-reviewer) and /api/mlro/brier
// (raw per-mode pivot) by adding stable rank + sortable surface intended
// for the MLRO mode-effectiveness dashboard.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJournal } from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import {
  brierScore,
  logScore,
} from "../../../../../dist/src/brain/bayesian-update.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type DriftBucket = "stable" | "drifting" | "uncalibrated";

interface PerModeRow {
  rank: number;
  modeId: string;
  total: number;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;
  drift: DriftBucket;
}

interface OutcomeRecordLike {
  at: string;
  modeIds?: string[];
  autoConfidence: number;
  groundTruth?: string;
  overridden?: boolean;
}

interface ModeAccumulator {
  total: number;
  resolved: number;
  brierSum: number;
  logSum: number;
  agreed: number;
}

const DEFAULT_LIMIT = 500;
const SORT_KEYS = new Set(["brier", "log", "agree", "total"]);

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null;
}

function driftBucket(brier: number, resolved: number): DriftBucket {
  if (resolved < 5) return "uncalibrated";
  if (brier <= 0.15) return "stable";
  return "drifting";
}

function defaultDirection(sort: string): "asc" | "desc" {
  // Brier/log: lower is better → ascending. Agreement/total: higher is better → descending.
  return sort === "brier" || sort === "log" ? "asc" : "desc";
}

function compareRows(
  sort: string,
  direction: "asc" | "desc",
): (a: PerModeRow, b: PerModeRow) => number {
  const sign = direction === "asc" ? 1 : -1;
  return (a, b) => {
    let av: number;
    let bv: number;
    switch (sort) {
      case "log":
        av = a.logScoreMean;
        bv = b.logScoreMean;
        break;
      case "agree":
        av = a.agreementRate;
        bv = b.agreementRate;
        break;
      case "total":
        av = a.total;
        bv = b.total;
        break;
      default:
        av = a.brierMean;
        bv = b.brierMean;
    }
    return (av - bv) * sign;
  };
}

async function handleGet(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");
  const since = sinceRaw ? Date.parse(sinceRaw) : Number.NEGATIVE_INFINITY;
  const until = untilRaw ? Date.parse(untilRaw) : Number.POSITIVE_INFINITY;
  const sortRaw = (url.searchParams.get("sort") ?? "brier").toLowerCase();
  const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "brier";
  const directionRaw = url.searchParams.get("direction");
  const direction: "asc" | "desc" =
    directionRaw === "asc" || directionRaw === "desc"
      ? directionRaw
      : defaultDirection(sort);
  const limitRaw = Number.parseInt(
    url.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
    10,
  );
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 0 ? limitRaw : DEFAULT_LIMIT;

  await hydrateJournalFromBlobs();
  const records = getJournal().list() as readonly OutcomeRecordLike[];

  const byMode = new Map<string, ModeAccumulator>();
  let recordsConsidered = 0;
  for (const r of records) {
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && (t < since || t > until)) continue;
    recordsConsidered++;
    const truth = classifyGroundTruth(r.groundTruth);
    for (const m of r.modeIds ?? []) {
      const slot = byMode.get(m) ?? {
        total: 0,
        resolved: 0,
        brierSum: 0,
        logSum: 0,
        agreed: 0,
      };
      slot.total++;
      if (!r.overridden) slot.agreed++;
      if (truth !== null) {
        slot.resolved++;
        slot.brierSum += brierScore(r.autoConfidence, truth);
        slot.logSum += logScore(r.autoConfidence, truth);
      }
      byMode.set(m, slot);
    }
  }

  const rows: PerModeRow[] = [];
  for (const [modeId, s] of byMode) {
    const brierMean = s.resolved > 0 ? s.brierSum / s.resolved : 0;
    const logScoreMean = s.resolved > 0 ? s.logSum / s.resolved : 0;
    const agreementRate = s.total > 0 ? s.agreed / s.total : 0;
    rows.push({
      rank: 0,
      modeId,
      total: s.total,
      resolved: s.resolved,
      brierMean,
      logScoreMean,
      agreementRate,
      drift: driftBucket(brierMean, s.resolved),
    });
  }

  rows.sort(compareRows(sort, direction));
  rows.forEach((r, i) => (r.rank = i + 1));

  const truncated = limit === 0 ? rows : rows.slice(0, limit);

  return NextResponse.json(
    {
      ok: true,
      total: rows.length,
      returned: truncated.length,
      recordsConsidered,
      since: sinceRaw,
      until: untilRaw,
      sort,
      direction,
      modes: truncated,
    },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
