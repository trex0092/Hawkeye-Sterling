// J-06 — structured false-positive reason codes.
//
// Every FP resolution (`resolution === "false"`) must carry a reason code
// from a fixed enum so the audit trail can be queried by category. Without
// structured codes, a regulator asking "show me every FP disposition based
// on DOB mismatch" has to grep free-text — not defensible under Federal Decree-Law No. 10 of 2025
// Art.24.
//
// The codes are sourced verbatim from the 195-item gap analysis (G-05):
//   FP-01 Different DOB confirmed
//   FP-02 Different nationality confirmed
//   FP-03 Different address confirmed
//   FP-04 Name match only — insufficient similarity
//   FP-05 Whitelisted — previously verified
//   FP-06 Other (requires free-text explanation)
//
// FP-06 is the escape hatch. Any FP that doesn't fit FP-01..FP-05 must use
// FP-06 AND provide a non-empty `reason` string. The validator below
// enforces both invariants.

export const FP_REASON_CODES = ["FP_01", "FP_02", "FP_03", "FP_04", "FP_05", "FP_06"] as const;
export type FpReasonCode = (typeof FP_REASON_CODES)[number];

export const FP_REASON_LABEL: Record<FpReasonCode, string> = {
  FP_01: "Different DOB confirmed",
  FP_02: "Different nationality confirmed",
  FP_03: "Different address confirmed",
  FP_04: "Name match only — insufficient similarity",
  FP_05: "Whitelisted — previously verified",
  FP_06: "Other",
};

export function isFpReasonCode(value: unknown): value is FpReasonCode {
  return typeof value === "string" && (FP_REASON_CODES as readonly string[]).includes(value);
}

export interface ValidatedFpDisposition {
  reasonCode: FpReasonCode;
  reason: string | null;
}

export type FpValidationResult =
  | { ok: true; value: ValidatedFpDisposition }
  | { ok: false; error: string };

/** Validate the FP-specific fields of a resolve-route body.
 *  Called only when resolution === "false". For any other resolution the
 *  caller must skip validation — there's no reason-code requirement on
 *  positive / possible / unspecified verdicts.
 *
 *  Rules (sourced from J-06 + G-05):
 *  1. reasonCode is required and must be one of FP_REASON_CODES.
 *  2. When reasonCode === "FP_06" (Other) the free-text reason is required
 *     and must be non-empty after trim. Operator must explain.
 *  3. The free-text reason, when present for any code, must not exceed
 *     2,048 characters (defensive limit — fits comfortably in Asana notes
 *     and the HMAC audit chain body).
 */
const MAX_REASON_LENGTH = 2048;

export function validateFpDisposition(input: {
  reasonCode?: unknown;
  reason?: unknown;
}): FpValidationResult {
  if (!isFpReasonCode(input.reasonCode)) {
    return {
      ok: false,
      error: `reasonCode is required for false-positive resolutions and must be one of: ${FP_REASON_CODES.join(", ")}`,
    };
  }
  const code: FpReasonCode = input.reasonCode;
  const rawReason = input.reason;
  const reason: string | null =
    typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason.trim() : null;

  if (code === "FP_06" && reason === null) {
    return {
      ok: false,
      error: 'reason text is required when reasonCode is "FP_06" (Other)',
    };
  }
  if (reason !== null && reason.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      error: `reason exceeds ${MAX_REASON_LENGTH}-character limit`,
    };
  }
  return { ok: true, value: { reasonCode: code, reason } };
}
