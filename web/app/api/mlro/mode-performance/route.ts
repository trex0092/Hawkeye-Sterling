// GET /api/mlro/mode-performance
//
// Per-mode leaderboard endpoint (audit follow-up #24).
// Reads the OutcomeFeedbackJournal singleton (Blobs-hydrated on cold start),
// pivots on modeId, and returns a leaderboard sorted by brier_score ascending
// (best calibrated first). Includes 95% CI intervals so the MLRO can
// identify underperforming modes for review with statistical confidence.
//
// Schema per item:
//   { mode_id, mode_name, category, brier_score, precision, recall,
//     sample_n, last_updated, trend: "up"|"down"|"flat",
//     ci_lower, ci_upper }
//
// Response:
//   { ok: true, modes: ModePerformanceRow[], generatedAt: ISO, totalModes: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJournal } from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import { brierScore, logScore } from "../../../../../dist/src/brain/bayesian-update.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Half-window (days) used for trend detection: compare last N days vs prior N.
const TREND_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// 95% CI multiplier (Wilson score approximation via normal approximation):
// z = 1.96 for two-tailed 95%.
const Z_95 = 1.96;

export interface ModePerformanceRow {
  mode_id: string;
  /** Best-effort human-readable label — falls back to mode_id when no mapping
   *  is registered. Routes that know mode names can enrich this later. */
  mode_name: string;
  /** Grouping category inferred from mode_id prefix (e.g. "sanctions", "pep",
   *  "adverse_media"). "general" when the prefix is unrecognised. */
  category: string;
  brier_score: number;
  /** Fraction of confirmed outcomes among resolved records. -1 if no resolved. */
  precision: number;
  /** Fraction of positive ground-truth cases that the mode confirmed. -1 if none. */
  recall: number;
  sample_n: number;
  last_updated: string | null; // ISO timestamp of most recent record, or null
  trend: "up" | "down" | "flat";
  /** 95% Wilson CI lower bound on brier_score (0 when sample too small). */
  ci_lower: number;
  /** 95% Wilson CI upper bound on brier_score (0 when sample too small). */
  ci_upper: number;
}

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null;
}

/** Naive category extraction from mode_id prefix. */
function categoryFromModeId(modeId: string): string {
  const prefix = modeId.split(/[_\-]/)[0]?.toLowerCase() ?? "";
  const known: Record<string, string> = {
    sanctions: "sanctions",
    pep: "pep",
    adverse: "adverse_media",
    media: "adverse_media",
    kyc: "kyc",
    aml: "aml",
    ubo: "ubo",
    tm: "transaction_monitoring",
    str: "str",
  };
  return known[prefix] ?? "general";
}

/**
 * Wilson score 95% CI for the mean of Brier scores.
 *
 * Brier scores sit in [0, 1] and their sample mean is a proportion-like
 * statistic, so the Wilson interval is the best closed-form approximation
 * without needing the full score distribution. For small n (< 5) we return
 * [0, 0] to signal "insufficient data".
 */
function brierCI(brierMean: number, n: number): { lower: number; upper: number } {
  if (n < 5) return { lower: 0, upper: 0 };
  const p = brierMean;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (Z_95 / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
  };
}

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  // Cold-start hydration from Blobs — idempotent after first call.
  await hydrateJournalFromBlobs();

  const now = Date.now();
  const recentStart = now - TREND_WINDOW_DAYS * MS_PER_DAY;
  const priorEnd = recentStart;
  const priorStart = priorEnd - TREND_WINDOW_DAYS * MS_PER_DAY;

  interface ModeAccum {
    tot: number;
    res: number;
    brierSum: number;
    logSum: number;
    tp: number; // confirmed and predicted positive
    fp: number; // reversed and predicted positive
    fn: number; // confirmed and predicted negative
    recentBrierSum: number;
    recentRes: number;
    priorBrierSum: number;
    priorRes: number;
    lastAt: string | null;
  }

  const byMode = new Map<string, ModeAccum>();

  for (const r of getJournal().list()) {
    const truth = classifyGroundTruth(r.groundTruth);
    const t = Date.parse(r.at);
    const isRecent = !Number.isNaN(t) && t >= recentStart;
    const isPrior = !Number.isNaN(t) && t >= priorStart && t < priorEnd;

    for (const modeId of r.modeIds ?? []) {
      const slot: ModeAccum = byMode.get(modeId) ?? {
        tot: 0,
        res: 0,
        brierSum: 0,
        logSum: 0,
        tp: 0,
        fp: 0,
        fn: 0,
        recentBrierSum: 0,
        recentRes: 0,
        priorBrierSum: 0,
        priorRes: 0,
        lastAt: null,
      };

      slot.tot++;

      // Track most recent timestamp.
      if (r.at && (slot.lastAt === null || r.at > slot.lastAt)) {
        slot.lastAt = r.at;
      }

      if (truth !== null) {
        slot.res++;
        const bs = brierScore(r.autoConfidence, truth);
        const ls = logScore(r.autoConfidence, truth);
        slot.brierSum += bs;
        slot.logSum += ls;

        // Precision / recall counters.
        // Treat autoConfidence >= 0.5 as "positive prediction".
        const predictedPositive = r.autoConfidence >= 0.5;
        if (truth === 1) {
          if (predictedPositive) slot.tp++;
          else slot.fn++;
        } else {
          if (predictedPositive) slot.fp++;
        }

        // Trend windows.
        if (isRecent) {
          slot.recentBrierSum += bs;
          slot.recentRes++;
        } else if (isPrior) {
          slot.priorBrierSum += bs;
          slot.priorRes++;
        }
      }

      byMode.set(modeId, slot);
    }
  }

  const modes: ModePerformanceRow[] = [];
  for (const [modeId, s] of byMode) {
    const brierMean = s.res > 0 ? s.brierSum / s.res : 0;

    const precision =
      s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : -1;
    const recall =
      s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : -1;

    // Trend: compare recent vs prior window brier means.
    let trend: "up" | "down" | "flat" = "flat";
    if (s.recentRes >= 3 && s.priorRes >= 3) {
      const recentMean = s.recentBrierSum / s.recentRes;
      const priorMean = s.priorBrierSum / s.priorRes;
      const delta = recentMean - priorMean;
      // "up" = brier improved (went down); "down" = brier got worse (went up).
      if (delta <= -0.03) trend = "up";
      else if (delta >= 0.03) trend = "down";
    }

    const ci = brierCI(brierMean, s.res);

    modes.push({
      mode_id: modeId,
      mode_name: modeId, // callers enriching with a mode-name registry can extend
      category: categoryFromModeId(modeId),
      brier_score: brierMean,
      precision,
      recall,
      sample_n: s.tot,
      last_updated: s.lastAt,
      trend,
      ci_lower: ci.lower,
      ci_upper: ci.upper,
    });
  }

  // Sort ascending by brier_score — best calibrated first.
  modes.sort((a, b) => a.brier_score - b.brier_score);

  return NextResponse.json(
    {
      ok: true,
      modes,
      generatedAt: new Date().toISOString(),
      totalModes: modes.length,
    },
    { headers: gateHeaders },
  );
}

export const GET = handleGet;
