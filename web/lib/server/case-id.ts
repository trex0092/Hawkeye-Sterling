// Case ID generator — produces CASE-YYYYMMDD-<random4hex> format IDs.
//
// Example: CASE-20260517-a3f9
//
// The random 4-hex suffix avoids counter collisions across Lambda instances
// that share the same UTC date. No external dependencies.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Validation regex for case IDs. */
export const CASE_ID_RE: RegExp = /^CASE-\d{8}-[a-z0-9]{4}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utcDateStamp(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = now.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function randomHex4(): string {
  // Use crypto.getRandomValues when available (Edge + modern Node), otherwise
  // fall back to Math.random (Node environments without crypto global).
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const buf = new Uint16Array(1);
    globalThis.crypto.getRandomValues(buf);
    return ((buf[0] ?? 0) & 0xffff).toString(16).padStart(4, "0");
  }

  // Fallback: Math.random — acceptable for non-cryptographic uniqueness.
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a new case ID of the form `CASE-YYYYMMDD-xxxx`
 * where xxxx is a random 4-character lowercase hex string.
 *
 * Different Lambda instances produce non-conflicting IDs because the suffix
 * is random rather than a sequential counter.
 */
export function generateCaseId(): string {
  return `CASE-${utcDateStamp()}-${randomHex4()}`;
}

/**
 * Validates and parses a case ID string.
 *
 * Returns `{ date: "YYYYMMDD", suffix: "xxxx" }` on success, or null if the
 * string does not match the expected format.
 */
export function parseCaseId(
  id: string,
): { date: string; suffix: string } | null {
  if (typeof id !== "string") return null;
  if (!CASE_ID_RE.test(id)) return null;

  // id is guaranteed to be CASE-YYYYMMDD-xxxx at this point.
  const parts = id.split("-");
  // parts: ["CASE", "YYYYMMDD", "xxxx"]
  return {
    date: parts[1]!,
    suffix: parts[2]!,
  };
}
