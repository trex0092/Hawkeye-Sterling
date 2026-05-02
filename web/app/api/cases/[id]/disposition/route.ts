// POST /api/cases/<id>/disposition
//
// Records the MLRO's disposition outcome to the in-process
// OutcomeFeedbackJournal singleton (src/brain/feedback-journal-instance.ts).
// The journal then drives:
//   · Brier + log-score calibration via hydrateCalibration(ledger)
//   · agreement-rate analytics (auto-dispositioner vs MLRO)
//   · bias-signal detection (mlro_softens_hard_proposals,
//     mlro_upgrades_soft_proposals, mode_low_agreement:<modeId>)
//
// Body shape:
//   {
//     runId: string,                      // brain run identifier
//     modeIds: string[],                  // reasoning modes that produced the verdict
//     autoProposed: DispositionCode,      // auto-dispositioner's proposal
//     autoConfidence: number,             // 0..1
//     mlroDecided: DispositionCode,       // MLRO's final disposition
//     overridden?: boolean,               // optional, computed if absent
//     overrideReason?: string,
//     reviewerId?: string                 // optional, defaults to tenant id
//   }
//
// Response: { ok: true, tenant, caseId, recorded: true }
//
// Persistence: the journal is in-memory only — Lambda cold starts wipe
// it. A future patch should snapshot getJournal().list() to Netlify
// Blobs on append and rehydrate via hydrateJournal() on warm-up.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { recordCaseDisposition } from "../../../../../../dist/src/brain/feedback-journal-instance.js";
import type { OutcomeRecord } from "../../../../../../dist/src/brain/outcome-feedback.js";
import type { DispositionCode } from "../../../../../../dist/src/brain/dispositions.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  runId: string;
  modeIds?: string[];
  autoProposed: DispositionCode;
  autoConfidence: number;
  mlroDecided: DispositionCode;
  overridden?: boolean;
  overrideReason?: string;
  reviewerId?: string;
}

async function handlePost(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { id } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body || typeof body.runId !== "string" || body.runId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "runId required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.autoProposed || !body.mlroDecided) {
    return NextResponse.json(
      { ok: false, error: "autoProposed and mlroDecided required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.autoConfidence !== "number" || body.autoConfidence < 0 || body.autoConfidence > 1) {
    return NextResponse.json(
      { ok: false, error: "autoConfidence must be a number in [0,1]" },
      { status: 400, headers: gate.headers },
    );
  }

  const overridden = body.overridden ?? body.autoProposed !== body.mlroDecided;
  const reviewerId = body.reviewerId ?? tenant ?? "anonymous";

  const record: OutcomeRecord = {
    runId: body.runId,
    at: new Date().toISOString(),
    caseId: id,
    modeIds: body.modeIds ?? [],
    autoProposed: body.autoProposed,
    autoConfidence: body.autoConfidence,
    mlroDecided: body.mlroDecided,
    overridden,
    reviewerId,
  };
  if (body.overrideReason !== undefined) {
    record.overrideReason = body.overrideReason;
  }

  try {
    recordCaseDisposition(record);
  } catch (err) {
    console.error("[cases/disposition]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      tenant,
      caseId: id,
      recorded: false,
      overridden,
      note: "disposition journal unavailable — record not persisted",
    }, { headers: gate.headers });
  }

  return NextResponse.json(
    { ok: true, tenant, caseId: id, recorded: true, overridden },
    { headers: gate.headers },
  );
}

export const POST = handlePost;
