// GET /api/mlro/fairness
//
// Per-entity-type fairness metrics for the MLRO Performance Monitoring
// dashboard. Reads the OutcomeFeedbackJournal (same source as mlro/brier),
// groups resolved outcomes by entityType, and computes:
//   · falsePositiveRate  — FP / (FP + TN) per entity type
//   · falseNegativeRate  — FN / (FN + TP) per entity type
//   · disparateImpact    — FP rate ratio vs reference group ("individual")
//   · sampleSize
//   · status: "pass" (DI 0.8–1.2) | "watch" (DI 0.6–0.8 or 1.2–1.5) | "fail" (DI <0.6 or >1.5)
//
// FATF R.1 / FDL 10/2025 Art.18 — non-discrimination in AI risk assessment.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJournal } from "../../../../../src/brain/feedback-journal-instance.js";
import { hydrateJournalFromBlobs } from "../../../../../src/brain/feedback-journal-blobs.js";
import type { OutcomeRecord } from "../../../../../src/brain/outcome-feedback.js";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFERENCE_GROUP = "individual";

interface FairnessRow {
  entityType: string;
  falsePositiveRate: number;
  falseNegativeRate: number;
  disparateImpact: number;
  sampleSize: number;
  status: "pass" | "watch" | "fail";
}

// Clearing codes: the AI proposed no further action.
const CLEARING_CODES = new Set([
  "D00_no_match", "D01_false_positive", "D02_cleared_proceed",
  "D11_pending_information", "D16_closed_no_action", "D17_pep_declassification_review",
]);

function classifyOutcome(r: OutcomeRecord): { tp: boolean; tn: boolean; fp: boolean; fn: boolean } | null {
  // autoProposed is the AI prediction; groundTruth is the analyst outcome
  // "confirmed" = flagged case was truly suspicious (TP if auto=flag, FN if auto=clear)
  // "reversed"  = flagged case was not suspicious (FP if auto=flag, TN if auto=clear)
  const auto = r.autoProposed;
  const ground = r.groundTruth;
  if (!ground || ground === "pending") return null;

  const autoPositive = !CLEARING_CODES.has(auto as string);
  const groundPositive = ground === "confirmed";

  return {
    tp: autoPositive && groundPositive,
    fp: autoPositive && !groundPositive,
    tn: !autoPositive && !groundPositive,
    fn: !autoPositive && groundPositive,
  };
}

function statusFromDI(di: number): FairnessRow["status"] {
  if (di >= 0.8 && di <= 1.2) return "pass";
  if (di >= 0.6 && di <= 1.5) return "watch";
  return "fail";
}

// Wilson score CI for proportion p over n samples (z=1.96 → 95%).
function wilsonCI(p: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    await hydrateJournalFromBlobs();
  } catch (err) {
    console.warn("[mlro/fairness] hydration failed, using in-process journal:", err instanceof Error ? err.message : String(err));
  }

  const all = getJournal().list() as OutcomeRecord[];

  // Group by entityType
  const byType = new Map<string, { tp: number; tn: number; fp: number; fn: number }>();

  for (const record of all) {
    const entityType = (((record as unknown) as Record<string, unknown>)["entityType"] as string | undefined) ?? "unknown";
    const outcome = classifyOutcome(record);
    if (!outcome) continue;

    let bucket = byType.get(entityType);
    if (!bucket) {
      bucket = { tp: 0, tn: 0, fp: 0, fn: 0 };
      byType.set(entityType, bucket);
    }
    if (outcome.tp) bucket.tp++;
    if (outcome.tn) bucket.tn++;
    if (outcome.fp) bucket.fp++;
    if (outcome.fn) bucket.fn++;
  }

  // Compute reference group FPR for disparate impact calculation
  const refBucket = byType.get(REFERENCE_GROUP) ?? { tp: 0, tn: 0, fp: 0, fn: 0 };
  const refTotal = refBucket.fp + refBucket.tn;
  const refFPR = refTotal > 0 ? refBucket.fp / refTotal : 0;

  const rows: FairnessRow[] = [];

  for (const [entityType, b] of byType.entries()) {
    const totalPositives = b.tp + b.fn;
    const totalNegatives = b.fp + b.tn;
    const sampleSize = b.tp + b.tn + b.fp + b.fn;

    const fpr = totalNegatives > 0 ? b.fp / totalNegatives : 0;
    const fnr = totalPositives > 0 ? b.fn / totalPositives : 0;
    const di = refFPR > 0 ? fpr / refFPR : fpr === 0 ? 1 : 2;

    rows.push({
      entityType,
      falsePositiveRate: Math.round(fpr * 1000) / 1000,
      falseNegativeRate: Math.round(fnr * 1000) / 1000,
      disparateImpact: Math.round(di * 1000) / 1000,
      sampleSize,
      status: statusFromDI(di),
    });
  }

  // If no resolved outcomes yet, return a placeholder row so the UI renders
  if (rows.length === 0) {
    rows.push({
      entityType: "individual",
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      disparateImpact: 1,
      sampleSize: 0,
      status: "pass",
    });
  }

  // Sort: fail first, then watch, then pass; within tier by descending FPR
  const statusOrder: Record<FairnessRow["status"], number> = { fail: 0, watch: 1, pass: 2 };
  rows.sort((a, b) => {
    const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (so !== 0) return so;
    return b.falsePositiveRate - a.falsePositiveRate;
  });

  void writeAuditChainEntry(
    { event: "mlro.fairness-report", actor: gate.keyId, rowCount: rows.length, failCount: rows.filter((r) => r.status === "fail").length },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] mlro/fairness:", e instanceof Error ? e.message : String(e)));

  // Wilson CI bounds are computed in the brier endpoint but not needed here;
  // keep the response focused on what the dashboard requires.
  void wilsonCI; // referenced to avoid lint unused-var

  return NextResponse.json(
    {
      ok: true,
      rows,
      referenceGroup: REFERENCE_GROUP,
      updatedAt: new Date().toISOString(),
    },
    { headers: gate.headers },
  );
}
