// Hawkeye-Sterling — request-id propagation.
//
// Every request entering Hawkeye-Sterling is assigned (or honours an
// incoming) `x-request-id`. The middleware mints a fresh UUID when no
// header is present; routes read it via `getRequestId(req)` and include
// it in every log line + response.
//
// This implements RULE 5/9/10 from the mega-prompt:
//   - structured logs include `requestId`
//   - error responses include `requestId`
//   - success responses include `requestId`
//
// The propagation is opt-in per route (caller reads via getRequestId);
// new code SHOULD use it, legacy code is migrated as it is touched.

import { randomUUID } from 'node:crypto';

const HEADER_NAME = 'x-request-id';

/**
 * Reads the request id from an incoming request. If the caller did not
 * pass one (most non-bot traffic), mints a fresh UUID. The minted id is
 * NOT written back to the request; callers that want the id surfaced
 * on the response must add it explicitly via `withRequestId()`.
 */
export function getRequestId(req: Request): string {
  const incoming = req.headers.get(HEADER_NAME);
  if (incoming && incoming.length > 0 && incoming.length <= 128) {
    // Sanitise to the printable subset RFC 7230 allows for header values.
    // Reject anything else to prevent log-injection.
    if (/^[\x21-\x7E]+$/.test(incoming)) return incoming;
  }
  return randomUUID();
}

/**
 * Returns an object with the `x-request-id` header set, suitable for
 * spreading into a NextResponse.json headers map:
 *
 *   return NextResponse.json(body, { headers: { ...withRequestIdHeader(rid) } });
 */
export function withRequestIdHeader(rid: string): Record<string, string> {
  return { [HEADER_NAME]: rid };
}

/**
 * Builds an ISO-8601 "now" string. Centralised so tests can stub if
 * needed and so every route emits the same format for the
 * `generatedAt` field in the uniform success/error contract.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Uniform error response builder (RULE 9):
 *   {
 *     ok: false,
 *     status: <httpStatus>,
 *     error: <snake_case_code>,
 *     hint: <human readable>,
 *     requestId: <uuid>,
 *     generatedAt: <iso>
 *   }
 *
 * Caller is responsible for setting the actual HTTP status code on the
 * NextResponse — this helper only builds the body. The `status` field
 * mirrors the HTTP code so log aggregators that only see bodies can
 * still correlate.
 */
export interface ErrorResponseBody {
  ok: false;
  status: number;
  error: string;
  hint: string;
  requestId: string;
  generatedAt: string;
}

export function buildErrorBody(
  httpStatus: number,
  errorCode: string,
  hint: string,
  rid: string,
): ErrorResponseBody {
  return {
    ok: false,
    status: httpStatus,
    error: errorCode,
    hint,
    requestId: rid,
    generatedAt: nowIso(),
  };
}

/**
 * Uniform success response builder (RULE 10):
 *   {
 *     ok: true,
 *     requestId: <uuid>,
 *     generatedAt: <iso>,
 *     ...payload
 *   }
 *
 * Payload fields override `requestId` / `generatedAt` if the caller
 * passes them; this lets callers fully control the body when needed
 * while keeping the defaults in place by default.
 */
export interface SuccessResponseBody {
  ok: true;
  requestId: string;
  generatedAt: string;
  [k: string]: unknown;
}

export function buildSuccessBody<T extends Record<string, unknown>>(
  payload: T,
  rid: string,
): SuccessResponseBody & T {
  return {
    ok: true,
    requestId: rid,
    generatedAt: nowIso(),
    ...payload,
  } as SuccessResponseBody & T;
}
