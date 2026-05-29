// Hawkeye Sterling — client-side API error sanitisation.
//
// Converts raw HTTP status codes and server error messages into user-friendly
// strings. Prevents internal error details (stack traces, DB errors, auth
// rejection reasons) from leaking to the browser UI.
//
// Usage:
//   import { apiErrorMessage } from "@/lib/client/error-utils";
//   setError(apiErrorMessage(res.status, "Risk analysis"));
//   setError(apiErrorMessage(res.status, "Screening", data.error));

/**
 * Returns a user-friendly error string for an API response failure.
 *
 * @param status   HTTP status code from the failed response
 * @param context  Short noun phrase describing what failed, e.g. "Risk analysis"
 * @param hint     Optional server-side hint to include for non-auth errors
 *                 (stripped for 401/403 to avoid leaking internal reasons)
 */
export function apiErrorMessage(
  status: number,
  context = "Request",
  hint?: string,
): string {
  if (status === 401) return "Authentication required — please refresh the page.";
  if (status === 403) return "Access denied — you don't have permission for this action.";
  if (status === 404) return `${context} not found.`;
  if (status === 429) return "Too many requests — please wait a moment and try again.";
  if (status >= 500) return `${context} failed — service temporarily unavailable. Please try again.`;
  // For 4xx other than the above, include a non-sensitive hint if provided.
  return hint ? `${context} failed: ${hint}` : `${context} failed (${status}).`;
}

/**
 * Returns a user-friendly error string from a caught exception.
 * Strips raw HTTP status codes and server-internal auth error text.
 */
export function caughtErrorMessage(err: unknown, fallback = "An unexpected error occurred."): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  // Catch bare `throw new Error(\`HTTP ${status}\`)` pattern.
  if (/^HTTP \d{3}$/.test(msg)) {
    const status = parseInt(msg.slice(5), 10);
    return apiErrorMessage(status);
  }
  // Catch `throw new Error(\`Something (HTTP ${status})\`)` pattern.
  const embeddedStatus = msg.match(/\(HTTP (\d{3})\)/);
  if (embeddedStatus) {
    const status = parseInt(embeddedStatus[1]!, 10);
    return apiErrorMessage(status, msg.replace(/\s*\(HTTP \d{3}\)[^)]*$/i, "").trim());
  }
  // Catch `throw new Error(\`Something (HTTP ${status}) — ...\`)` pattern.
  const trailingStatus = msg.match(/HTTP (\d{3})/);
  if (trailingStatus) {
    const status = parseInt(trailingStatus[1]!, 10);
    if (status === 401 || status === 403) return apiErrorMessage(status);
  }
  // Mask any message that contains API key / token hints from server responses.
  if (/api key|bearer token|authorization|supply auth/i.test(msg)) {
    return "Authentication required — please refresh the page.";
  }
  return msg;
}
