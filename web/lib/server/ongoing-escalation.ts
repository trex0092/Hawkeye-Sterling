// Hawkeye-Sterling — ongoing-monitoring escalation policy.
//
// Single source of truth for the score-delta threshold that triggers
// an auto-escalation between consecutive ongoing-monitoring runs.
//
// Why a constant + helper instead of inline arithmetic:
//   - The threshold is regulator-defensible (the value is asserted in
//     the audit chain on escalation) and must NOT drift silently. A
//     dedicated unit test against ESCALATION_DELTA fails if a future
//     refactor changes it without explicit review.
//   - The helper has a single tested behaviour so callers cannot
//     accidentally invert the comparison (delta vs. threshold).

/**
 * Score-delta threshold (0..100 scale) at which an ongoing-monitoring
 * run auto-escalates to the MLRO inbox. 15 points is large enough to
 * suppress feedback-loop rescoring noise yet small enough to surface
 * a subject moving from "possible" to "strong" between runs.
 *
 * Encoded as a const so it can be imported by both the runtime route
 * (`/api/ongoing/run`) and the unit-test suite.
 */
export const ESCALATION_DELTA = 15;

/**
 * Returns true when the current top-score has moved up by at least
 * ESCALATION_DELTA versus the previous run. First runs (prev=null)
 * never escalate — enrolment itself is not a delta event.
 *
 * The comparison is intentionally one-sided: a score going DOWN by
 * the same magnitude is not an escalation. Disposition workflows
 * close cases on score decay; we do not page on improvements.
 */
export function shouldEscalate(
  previousTopScore: number | null | undefined,
  currentTopScore: number,
): boolean {
  if (previousTopScore == null) return false;
  return currentTopScore - previousTopScore >= ESCALATION_DELTA;
}
