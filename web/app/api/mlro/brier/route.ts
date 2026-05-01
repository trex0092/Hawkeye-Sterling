// GET /api/mlro/brier
//
// Per-mode Brier-score dashboard endpoint (audit follow-up #22).
// Reads the OutcomeFeedbackJournal singleton (Blobs-hydrated on cold
// start), pivots on modeId, and returns Brier + log-score per mode
// over the requested window. Drives the calibration-quality view that
// surfaces which modes are well-calibrated vs which drift.

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
  resolved: number;          // records with groundTruth ∈ {confirmed, reversed}
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;     // proxy: fraction of records where mlroDecided === autoProposed
  drift: "stable" | "drifting" | "uncalibrated";
}

function classifyGroundTruth(g: string | undefined): 0 | 1 | null {
  if (g === "confirmed") return 1;
  if (g === "reversed") return 0;
  return null; // pending or absent
}

function driftBucket(brier: number, total: number): PerModeRow["drift"] {
  if (total < 5) return "uncalibrated";
  if (brier <= 0.15) return "stable";
  return "drifting";
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

  const all = getJournal().list().filter((r: { at: string; groundTruth?: string; modeIds?: string[]; mlConfidence?: number; reviewerDecision?: string; weight?: number }) => {
    const t = Date.parse(r.at);
    if (Number.isNaN(t)) return true;
    return t >= since && t <= until;
  });

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
    perMode.push({
      modeId,
      total: s.tot,
      resolved: s.res,
      brierMean,
      logScoreMean,
      agreementRate,
      drift: driftBucket(brierMean, s.res),
    });
  }
  perMode.sort((a, b) => b.brierMean - a.brierMean);

  return NextResponse.json(
    {
      ok: true,
      windowSince: sinceParam ?? null,
      windowUntil: untilParam ?? null,
      total: all.length,
      modes: perMode,
      hint: "groundTruth='confirmed'/'reversed' on OutcomeRecord drives Brier/log-score; 'pending' records are counted but not scored.",
    },
    { headers: gateHeaders },
  );
}

export const GET = handleGet;
