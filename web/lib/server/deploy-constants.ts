// Canonical deploy / governance constants — committed in code as the single
// source of truth so the platform's identity (brain version, charter integrity,
// catalogue review date) does not depend on Netlify build env vars.
//
// Why this exists: the corresponding Netlify variables (BRAIN_VERSION,
// BRAIN_REVIEWED_AT, CHARTER_HASH) are *scoped to Builds*, so they are
// `undefined` inside runtime serverless functions and never reached the routes
// that read them — those routes silently fell back to inline literals. Pinning
// the values here makes that fallback explicit, auditable, and version-controlled.
//
// An env var of the same name, when present at runtime, still overrides — so an
// operator who later re-scopes a variable to Functions/Runtime keeps that
// flexibility without a code change. Federal Decree-Law No. 10 of 2025 Art.18 (version traceability).

/** Brain / engine release tag surfaced in /api/status and error envelopes. */
export const BRAIN_VERSION: string = process.env["BRAIN_VERSION"] ?? "wave-5";

/**
 * Floor date for "brain catalogue last reviewed". A Netlify Blob written by
 * POST /api/admin/mark-catalogue-reviewed still takes precedence over this at
 * runtime; this is the in-code floor used when no Blob and no env var is set.
 */
export const BRAIN_REVIEWED_AT: string =
  process.env["BRAIN_REVIEWED_AT"] ?? "2026-05-15";

/**
 * Compliance-charter integrity identifier stamped onto SAR filings
 * (charterIntegrityHash). Tracks the deployed charter version; the canonical
 * charter text lives at src/policy/systemPrompt.ts and its SHA-256 is gated in
 * CI by scripts/validate-prompt-hashes.mjs.
 */
export const CHARTER_INTEGRITY_HASH: string =
  process.env["CHARTER_HASH"] ?? "hawkeye-sterling-v1";
