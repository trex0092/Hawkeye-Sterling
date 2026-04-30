// Hawkeye Sterling — process-scoped OutcomeFeedbackJournal instance.
//
// Holds an in-memory `OutcomeFeedbackJournal` shared across the brain so any
// disposition route (e.g. /api/cases/[id]/dispose, /api/mlro-advisor on
// MLRO confirm) can append outcomes via `recordCaseDisposition()`. The
// journal then drives:
//   · calibration — `getJournal().hydrateCalibration(ledger)` pushes
//     samples into a `CalibrationLedger` so Brier + log-score reflect MLRO
//     ground truth.
//   · agreement-rate analytics — `getJournal().agreement()` reports total /
//     agreed / overridden, override rate by disposition code, override rate
//     by reasoning-mode id, plus bias signals (`mlro_softens_hard_proposals`,
//     `mlro_upgrades_soft_proposals`, `mode_low_agreement:<id>`).
//
// Persistence: this module is in-memory only — Lambda cold starts reset
// the journal. The owning route is responsible for snapshotting
// `getJournal().list()` to durable storage (Netlify Blobs, Postgres, …)
// between cold starts and rehydrating with `record()` on warm-up.
//
// Audit roadmap item #5: previously the journal class existed but no
// instance was held anywhere, so MLRO dispositions never reached the
// calibration ledger. Routes can now wire in by importing this module.

import { OutcomeFeedbackJournal, type OutcomeRecord } from './outcome-feedback.js';

let instance: OutcomeFeedbackJournal | null = null;

/** Returns the process-scoped journal instance, creating it on first call. */
export function getJournal(): OutcomeFeedbackJournal {
  if (instance === null) instance = new OutcomeFeedbackJournal();
  return instance;
}

/** Append an MLRO disposition outcome to the journal. Convenience wrapper
 *  over `getJournal().record()` so route handlers don't need to import
 *  the class directly. */
export function recordCaseDisposition(record: OutcomeRecord): void {
  getJournal().record(record);
}

/** Hydrate the journal with a snapshot loaded from durable storage. Each
 *  record is appended individually so the agreement / bias-signal counters
 *  walk the full history. Returns the count appended. */
export function hydrateJournal(records: readonly OutcomeRecord[]): number {
  const j = getJournal();
  for (const r of records) j.record(r);
  return records.length;
}

/** TEST UTILITY: replace the singleton with a fresh instance. NEVER call
 *  from production code — discards all in-memory journal state. */
export function _resetJournalForTest(): void {
  instance = null;
}
