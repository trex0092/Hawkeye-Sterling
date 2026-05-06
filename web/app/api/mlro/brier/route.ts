// GET /api/mlro/brier
//
// Per-mode Brier-score dashboard endpoint (audit follow-up #22).
// Reads the OutcomeFeedbackJournal singleton (Blobs-hydrated on cold
// start), pivots on modeId, and returns:
//   · per-mode Brier + log-score
//   · fairness_by_entity_type  — disaggregated precision / CI / n per entity type
//   · fairness_by_jurisdiction — disaggregated precision / CI per jurisdiction
//   · brier_history_array      — 30-day rolling trend (one bucket per day)
//   · current_ece              — Expected Calibration Error across the window
//   · under_triangulation_pct  — fraction of records with <3 independent sources

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJournal } from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import { brierScore, logScore } from "../../../../../dist/src/brain/bayesian-update.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PerModeRow {
  modeId: string;
  total: number;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;
  drift: "stable" | "drifting" | "uncalibrated";
}

interface FairnessRow {
  group: string;
  n: number;
  precision: number;
  ci_lower: number;
  ci_upper: number;
  brier_mean: number;
}

interface BrierHistoryBucket {
  date: string;       // YYYY-MM-DD
  brier_mean: number;
  n: number;
}

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null;
}

function driftBucket(brier: number, total: number): PerModeRow["drift"] {
  if (total < 5) return "uncalibrated";
  if (brier <= 0.15) return "stable";
  return "drifting";
}

// Wilson score confidence interval for a proportion p over n samples.
function wilsonCI(p: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

// Expected Calibration Error over records with ground truth.
// Bins confidence into 10 buckets [0..0.1), [0.1..0.2), …, [0.9..1.0].
function computeECE(records: Array<{ autoConfidence: number; truth: 0 | 1 }>): number {
  const bins = Array.from({ length: 10 }, () => ({ sum: 0, correct: 0, n: 0 }));
  for (const { autoConfidence, truth } of records) {
    const bin = Math.min(9, Math.floor(autoConfidence * 10));
    bins[bin]!.sum += autoConfidence;
    bins[bin]!.correct += truth;
    bins[bin]!.n++;
  }
  const total = records.length;
  if (total === 0) return 0;
  return bins.reduce((ece, b) => {
    if (b.n === 0) return ece;
    const avgConf = b.sum / b.n;
    const avgAcc = b.correct / b.n;
    return ece + (b.n / total) * Math.abs(avgConf - avgAcc);
  }, 0);
}

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");
  const since = sinceParam ? Date.parse(sinceParam) : Number.NEGATIVE_INFINITY;
  const until = untilParam ? Date.parse(untilParam) : Number.POSITIVE_INFINITY;

  await hydrateJournalFromBlobs();

  const all = getJournal().list().filter((r) => {
    const t = Date.parse(r.at);
    if (Number.isNaN(t)) return true;
    return t >= since && t <= until;
  });

  // ── Per-mode aggregation ─────────────────────────────────────────────────
  const byMode = new Map<string, { tot: number; res: number; brierSum: number; logSum: number; agreed: number }>();
  for (const r of all) {
    const truth = classifyGroundTruth(r.groundTruth);
    for (const m of r.modeIds ?? []) {
      const slot = byMode.get(m) ?? { tot: 0, res: 0, brierSum: 0, logSum: 0, agreed: 0 };
      slot.tot++;
      if (!r.overridden) slot.agreed++;
      if (truth !== null) {
        slot.res++;
        slot.brierSum += brierScore(r.autoConfidence, truth);
        slot.logSum += logScore(r.autoConfidence, truth);
      }
      byMode.set(m, slot);
    }
  }

  const perMode: PerModeRow[] = [];
  for (const [modeId, s] of byMode) {
    const brierMean = s.res > 0 ? s.brierSum / s.res : 0;
    const logScoreMean = s.res > 0 ? s.logSum / s.res : 0;
    const agreementRate = s.tot > 0 ? s.agreed / s.tot : 0;
    perMode.push({ modeId, total: s.tot, resolved: s.res, brierMean, logScoreMean, agreementRate, drift: driftBucket(brierMean, s.res) });
  }
  perMode.sort((a, b) => b.brierMean - a.brierMean);

  // ── Fairness disaggregation by entity type ────────────────────────────────
  type FairnessAccum = { n: number; correct: number; brierSum: number; res: number };
  const byEntityType = new Map<string, FairnessAccum>();
  const byJurisdiction = new Map<string, FairnessAccum>();

  for (const r of all) {
    const truth = classifyGroundTruth(r.groundTruth);
    const entityType: string = ((r as unknown) as Record<string, unknown>)["entityType"] as string ?? "unknown";
    const jurisdiction: string = ((r as unknown) as Record<string, unknown>)["jurisdiction"] as string ?? "unknown";

    for (const group of [["entity", entityType, byEntityType], ["juris", jurisdiction, byJurisdiction]] as const) {
      const key = group[1];
      const map = group[2] as Map<string, FairnessAccum>;
      const slot = map.get(key) ?? { n: 0, correct: 0, brierSum: 0, res: 0 };
      slot.n++;
      if (truth !== null) {
        slot.res++;
        slot.correct += truth;
        slot.brierSum += brierScore(r.autoConfidence, truth);
      }
      map.set(key, slot);
    }
  }

  function toFairnessRows(map: Map<string, FairnessAccum>): FairnessRow[] {
    return [...map.entries()].map(([group, s]) => {
      const precision = s.res > 0 ? s.correct / s.res : 0;
      const [ci_lower, ci_upper] = wilsonCI(precision, s.res);
      return { group, n: s.n, precision, ci_lower, ci_upper, brier_mean: s.res > 0 ? s.brierSum / s.res : 0 };
    }).sort((a, b) => b.n - a.n);
  }

  const fairness_by_entity_type = toFairnessRows(byEntityType);
  const fairness_by_jurisdiction = toFairnessRows(byJurisdiction);

  // ── 30-day Brier history (daily buckets) ──────────────────────────────────
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const thirtyDayRecords = getJournal().list().filter((r) => {
    const t = Date.parse(r.at);
    return !Number.isNaN(t) && t >= now - thirtyDaysMs;
  });

  const dayBuckets = new Map<string, { brierSum: number; n: number }>();
  for (const r of thirtyDayRecords) {
    const truth = classifyGroundTruth(r.groundTruth);
    if (truth === null) continue;
    const day = r.at.slice(0, 10); // YYYY-MM-DD
    const b = dayBuckets.get(day) ?? { brierSum: 0, n: 0 };
    b.brierSum += brierScore(r.autoConfidence, truth);
    b.n++;
    dayBuckets.set(day, b);
  }
  const brier_history_array: BrierHistoryBucket[] = [...dayBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({ date, brier_mean: b.n > 0 ? b.brierSum / b.n : 0, n: b.n }));

  // ── Expected Calibration Error ────────────────────────────────────────────
  const eceRecords = all
    .map((r) => ({ autoConfidence: r.autoConfidence ?? 0.5, truth: classifyGroundTruth(r.groundTruth) }))
    .filter((r): r is { autoConfidence: number; truth: 0 | 1 } => r.truth !== null);
  const current_ece = computeECE(eceRecords);

  // ── Under-triangulation percentage ───────────────────────────────────────
  const underTriangulated = all.filter((r) => {
    const sources = ((r as unknown) as Record<string, unknown>)["sourcesCount"] as number | undefined;
    return sources !== undefined ? sources < 3 : false;
  });
  const under_triangulation_pct = all.length > 0 ? underTriangulated.length / all.length : 0;

  return NextResponse.json(
    {
      ok: true,
      windowSince: sinceParam ?? null,
      windowUntil: untilParam ?? null,
      total: all.length,
      modes: perMode,
      fairness_by_entity_type,
      fairness_by_jurisdiction,
      brier_history_array,
      current_ece,
      under_triangulation_pct,
      hint: "groundTruth='confirmed'/'reversed' on OutcomeRecord drives Brier/log-score; 'pending' records are counted but not scored.",
    },
    { headers: gateHeaders },
  );
}

export const GET = handleGet;
