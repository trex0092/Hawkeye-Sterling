// GET /api/mlro/performance
//
// Per-MLRO performance dashboard endpoint (audit follow-up #54). Reads
// the OutcomeFeedbackJournal singleton (hydrated from Netlify Blobs on
// cold start), groups records by reviewerId, and returns per-reviewer
// agreement rate, override rate by disposition code, override rate by
// reasoning mode, plus the bias signals the journal already computes
// (mlro_softens_hard_proposals, mode_low_agreement:<modeId>).
//
// Use cases:
//   · MLRO manager dashboard — who is overriding what
//   · Calibration drift monitor — fires alerts when a reviewer's
//     override rate spikes
//   · Audit replay — per-reviewer agreement vs the auto-dispositioner
//     across an arbitrary date range
//
// Query params:
//   ?reviewerId=<id>     — narrow to one reviewer (otherwise: all)
//   ?since=<ISO>         — only records at-timestamp ≥ since
//   ?until=<ISO>         — only records at-timestamp ≤ until
//
// Response:
//   { ok: true, total, perReviewer: [...], biasSignals: [...], ... }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  getJournal,
  hydrateJournal,
} from "../../../../../dist/src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../dist/src/brain/feedback-journal-blobs.js";
import { OutcomeFeedbackJournal } from "../../../../../dist/src/brain/outcome-feedback.js";
import type { OutcomeRecord } from "../../../../../dist/src/brain/outcome-feedback.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PerReviewerRow {
  reviewerId: string;
  total: number;
  agreed: number;
  overridden: number;
  agreementRate: number;
  topOverrideCodes: Array<{ code: string; total: number; rate: number }>;
  topOverrideModes: Array<{ modeId: string; total: number; rate: number }>;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  const url = new URL(req.url);
  const reviewerFilter = url.searchParams.get("reviewerId");
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");
  const since = sinceParam ? Date.parse(sinceParam) : Number.NEGATIVE_INFINITY;
  const until = untilParam ? Date.parse(untilParam) : Number.POSITIVE_INFINITY;

  // Cold-start hydration from Blobs — idempotent after first call.
  await hydrateJournalFromBlobs();

  const all = getJournal().list().filter((r: OutcomeRecord) => {
    const t = Date.parse(r.at);
    if (Number.isNaN(t)) return true;
    if (t < since) return false;
    if (t > until) return false;
    if (reviewerFilter && r.reviewerId !== reviewerFilter) return false;
    return true;
  });

  // Per-reviewer aggregation. Build a private journal per reviewer to
  // reuse the existing agreement() analytics + bias signals.
  const byReviewer = new Map<string, OutcomeRecord[]>();
  for (const r of all) {
    const arr = byReviewer.get(r.reviewerId);
    if (arr) arr.push(r);
    else byReviewer.set(r.reviewerId, [r]);
  }

  const perReviewer: PerReviewerRow[] = [];
  for (const [reviewerId, recs] of byReviewer) {
    const sub = new OutcomeFeedbackJournal();
    for (const r of recs) sub.record(r);
    const ag = sub.agreement();
    const topOverrideCodes = Object.entries(ag.overrideRateByCode as Record<string, { total: number; rate: number }>)
      .map(([code, v]) => ({ code, total: v.total, rate: v.rate }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
    const topOverrideModes = Object.entries(ag.overrideRateByMode as Record<string, { total: number; rate: number }>)
      .map(([modeId, v]) => ({ modeId, total: v.total, rate: v.rate }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
    perReviewer.push({
      reviewerId,
      total: ag.total,
      agreed: ag.agreed,
      overridden: ag.overridden,
      agreementRate: ag.agreementRate,
      topOverrideCodes,
      topOverrideModes,
    });
  }
  perReviewer.sort((a, b) => b.total - a.total);

  // Across-population bias signals (reuse the journal's own analytics).
  const populationJournal = new OutcomeFeedbackJournal();
  for (const r of all) populationJournal.record(r);
  const populationAgreement = populationJournal.agreement();

  return NextResponse.json(
    {
      ok: true,
      total: all.length,
      windowSince: sinceParam ?? null,
      windowUntil: untilParam ?? null,
      reviewerFilter: reviewerFilter ?? null,
      perReviewer,
      population: {
        total: populationAgreement.total,
        agreed: populationAgreement.agreed,
        overridden: populationAgreement.overridden,
        agreementRate: populationAgreement.agreementRate,
      },
      biasSignals: populationAgreement.biasSignals,
      hint:
        "POST /api/cases/<id>/disposition feeds this dashboard; the journal " +
        "is hydrated from Netlify Blobs on each Lambda cold start.",
    },
    { headers: gateHeaders },
  );
}

// Suppress unused-import warning when hydrateJournal isn't called by the
// handler (it's exported for callers that want bulk-import without going
// through Blobs — e.g. tests or admin tooling).
void hydrateJournal;

export const GET = handleGet;
