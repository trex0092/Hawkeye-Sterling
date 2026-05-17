// GET /api/mlro/drift-alerts
//
// Active calibration-drift alert endpoint (audit follow-up #23).
// Compares the current 7-day window of per-mode metrics against the prior
// 7-day window, evaluates drift via the pure evaluateDrift() function, and
// returns only the alerts that remain active (auto-clears resolved alerts).
// Dashboard polls this endpoint every 5 minutes.
//
// Response:
//   { ok: true, alerts: DriftAlert[], generatedAt: ISO, windowDays: 7, totalModes: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJournal } from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import { brierScore, logScore } from "../../../../../dist/src/brain/bayesian-update.js";
import { evaluateDrift, type DriftAlert, type ModeWindowMetrics } from "../../../../../dist/src/brain/drift-alerts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null; // pending or absent
}

function buildWindowMetrics(
  records: ReturnType<ReturnType<typeof getJournal>["list"]>,
  from: number,
  to: number,
): ModeWindowMetrics[] {
  const byMode = new Map<
    string,
    { tot: number; res: number; brierSum: number; logSum: number; agreed: number }
  >();

  for (const r of records) {
    const t = Date.parse(r.at);
    if (Number.isNaN(t) || t < from || t > to) continue;
    const truth = classifyGroundTruth(r.groundTruth);
    for (const modeId of r.modeIds ?? []) {
      const slot = byMode.get(modeId) ?? {
        tot: 0,
        res: 0,
        brierSum: 0,
        logSum: 0,
        agreed: 0,
      };
      slot.tot++;
      if (!r.overridden) slot.agreed++;
      if (truth !== null) {
        slot.res++;
        slot.brierSum += brierScore(r.autoConfidence, truth);
        slot.logSum += logScore(r.autoConfidence, truth);
      }
      byMode.set(modeId, slot);
    }
  }

  const metrics: ModeWindowMetrics[] = [];
  for (const [modeId, s] of byMode) {
    metrics.push({
      modeId,
      total: s.tot,
      resolved: s.res,
      brierMean: s.res > 0 ? s.brierSum / s.res : 0,
      logScoreMean: s.res > 0 ? s.logSum / s.res : 0,
      agreementRate: s.tot > 0 ? s.agreed / s.tot : 0,
    });
  }
  return metrics;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  // Cold-start hydration from Blobs — idempotent after first call.
  await hydrateJournalFromBlobs();

  const now = Date.now();
  const currentEnd = now;
  const currentStart = currentEnd - WINDOW_DAYS * MS_PER_DAY;
  const previousEnd = currentStart;
  const previousStart = previousEnd - WINDOW_DAYS * MS_PER_DAY;

  const all = getJournal().list();

  const currentWindow = buildWindowMetrics(all, currentStart, currentEnd);
  const previousWindow = buildWindowMetrics(all, previousStart, previousEnd);

  // evaluateDrift is a pure function — it only returns alerts whose thresholds
  // are exceeded, which naturally auto-clears resolved alerts (no persistence
  // needed: if the metric falls below threshold, the alert simply won't appear).
  const alerts: DriftAlert[] = evaluateDrift(currentWindow, previousWindow);

  const totalModes = new Set([
    ...currentWindow.map((m) => m.modeId),
    ...previousWindow.map((m) => m.modeId),
  ]).size;

  return NextResponse.json(
    {
      ok: true,
      alerts,
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      totalModes,
    },
    { headers: gateHeaders },
  );
}

export const GET = handleGet;
