// GET /api/mlro/drift-alerts
//
// Calibration drift alert endpoint — runs evaluateDrift() over per-mode
// metrics from the OutcomeFeedbackJournal, comparing a current window
// against a baseline window. Required by HS-MC-001 §9.1 (alert
// thresholds: ECE > 4% → alert; > 6% → pause), HS-OPS-001 §3.2
// (Category 2 incident detection), HS-GOV-001 §3 (drift alert
// triggered when ECE > 4%).
//
// Query params:
//   ?windowDays=<N>     — current window length in days (default 7)
//   ?baselineDays=<N>   — baseline window length in days (default 7,
//                         taken immediately before the current window)
//   ?warnDelta=<f>      — Brier delta to warn (default 0.05)
//   ?critDelta=<f>      — Brier delta for critical (default 0.12)
//   ?minResolved=<N>    — min resolved samples per mode (default 10)
//
// Response:
//   {
//     ok, generatedAt,
//     window:   { since, until, days },
//     baseline: { since, until, days },
//     alertsByCategory, alerts: DriftAlert[],
//     modesEvaluated, modesAlerting
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { evaluateDrift } from "../../../../../dist/src/brain/drift-alerts.js";
import type {
  DriftAlert,
  DriftEvalOptions,
  ModeWindowMetrics,
} from "../../../../../dist/src/brain/drift-alerts.js";
import { getJournal } from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import {
  brierScore,
  logScore,
} from "../../../../../dist/src/brain/bayesian-update.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

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

const DEFAULT_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1_000;

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null;
}

function buildWindowMetrics(
  records: readonly OutcomeRecordLike[],
  since: number,
  until: number,
): ModeWindowMetrics[] {
  const byMode = new Map<string, ModeAccumulator>();
  for (const r of records) {
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    if (t < since || t > until) continue;
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

  const out: ModeWindowMetrics[] = [];
  for (const [modeId, s] of byMode) {
    out.push({
      modeId,
      total: s.total,
      resolved: s.resolved,
      brierMean: s.resolved > 0 ? s.brierSum / s.resolved : 0,
      logScoreMean: s.resolved > 0 ? s.logSum / s.resolved : 0,
      agreementRate: s.total > 0 ? s.agreed / s.total : 0,
    });
  }
  return out;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePositiveFloat(
  raw: string | null,
  fallback: number,
): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function handleGet(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const windowDays = parsePositiveInt(
    url.searchParams.get("windowDays"),
    DEFAULT_WINDOW_DAYS,
  );
  const baselineDays = parsePositiveInt(
    url.searchParams.get("baselineDays"),
    DEFAULT_WINDOW_DAYS,
  );
  const minResolved = parsePositiveInt(
    url.searchParams.get("minResolved"),
    10,
  );

  const opts: DriftEvalOptions = { minResolved };
  const warnDelta = parsePositiveFloat(url.searchParams.get("warnDelta"), 0);
  if (warnDelta !== undefined && warnDelta > 0) opts.warnBrierDelta = warnDelta;
  const critDelta = parsePositiveFloat(url.searchParams.get("critDelta"), 0);
  if (critDelta !== undefined && critDelta > 0) {
    opts.criticalBrierDelta = critDelta;
  }

  await hydrateJournalFromBlobs();
  const records = getJournal().list() as readonly OutcomeRecordLike[];

  const now = Date.now();
  const windowSince = now - windowDays * DAY_MS;
  const baselineUntil = windowSince - 1;
  const baselineSince = baselineUntil - baselineDays * DAY_MS;

  const currentMetrics = buildWindowMetrics(records, windowSince, now);
  const baselineMetrics = buildWindowMetrics(
    records,
    baselineSince,
    baselineUntil,
  );

  const alerts: DriftAlert[] = evaluateDrift(currentMetrics, baselineMetrics, opts);

  const alertsByCategory: Record<string, number> = {};
  const alertingModes = new Set<string>();
  for (const a of alerts) {
    alertsByCategory[a.category] = (alertsByCategory[a.category] ?? 0) + 1;
    alertingModes.add(a.modeId);
  }

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date(now).toISOString(),
      window: {
        since: new Date(windowSince).toISOString(),
        until: new Date(now).toISOString(),
        days: windowDays,
      },
      baseline: {
        since: new Date(baselineSince).toISOString(),
        until: new Date(baselineUntil).toISOString(),
        days: baselineDays,
      },
      modesEvaluated: currentMetrics.length,
      modesAlerting: alertingModes.size,
      alertsByCategory,
      alerts,
      hint:
        "Severity ranks critical > warn > info. 'uncalibrated_volume' alerts indicate ground-truth coverage gaps, not model drift — improve outcome capture.",
    },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
