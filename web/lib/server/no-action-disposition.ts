// I-10 — structured no-action disposition validator.
//
// Every alert that the MLRO leaves unactioned (resolution: "unspecified")
// must carry an immutable, queryable justification per FDL 10/2025 Art.19
// and the regulator-readiness audit-trail requirements. Free-text "reason?"
// alone is not enough — the gap analysis (I-10) requires four fields to
// permanently bind to the entry:
//
//   1. reason            — analyst rationale (free text, required)
//   2. evidenceReviewed  — what the analyst inspected before deciding (required)
//   3. analyst           — operator identity (from enforce gate, server-supplied)
//   4. date              — disposition timestamp (server-supplied)
//
// This module owns the (1)+(2) validation. (3)+(4) are server-side context
// the route layer attaches. Mirrors the J-06 (FP reason code) shape so the
// resolve route's two validation branches read consistently.

export interface ValidatedNoActionDisposition {
  reason: string;
  evidenceReviewed: string;
}

export type NoActionValidationResult =
  | { ok: true; value: ValidatedNoActionDisposition }
  | { ok: false; error: string };

const MAX_REASON_LENGTH = 2048;
const MAX_EVIDENCE_LENGTH = 4096;

function trimmedNonEmpty(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** Validate the no-action-specific fields of a resolve-route body.
 *  Called only when resolution === "unspecified". For any other resolution
 *  the caller must skip validation — there's no rationale requirement on
 *  positive / possible / false verdicts (false has its own J-06 path).
 *
 *  Rules (sourced from I-10):
 *  1. reason is required and non-empty (after trim).
 *  2. evidenceReviewed is required and non-empty — what the analyst
 *     INSPECTED before deciding to take no action. Free text so the
 *     analyst can list whatever they actually reviewed (passport scan,
 *     transaction history, previous case file, country-risk report, etc).
 *  3. Both fields cap at sensible limits to keep audit-chain bodies
 *     bounded and the Asana / Blobs payload sizes predictable.
 */
export function validateNoActionDisposition(input: {
  reason?: unknown;
  evidenceReviewed?: unknown;
}): NoActionValidationResult {
  const reason = trimmedNonEmpty(input.reason);
  if (!reason) {
    return {
      ok: false,
      error: 'reason is required when resolution === "unspecified" (I-10 no-action audit-trail requirement)',
    };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `reason exceeds ${MAX_REASON_LENGTH}-character limit` };
  }

  const evidenceReviewed = trimmedNonEmpty(input.evidenceReviewed);
  if (!evidenceReviewed) {
    return {
      ok: false,
      error: 'evidenceReviewed is required when resolution === "unspecified" — describe what you inspected before deciding to take no action',
    };
  }
  if (evidenceReviewed.length > MAX_EVIDENCE_LENGTH) {
    return { ok: false, error: `evidenceReviewed exceeds ${MAX_EVIDENCE_LENGTH}-character limit` };
  }

  return { ok: true, value: { reason, evidenceReviewed } };
}
