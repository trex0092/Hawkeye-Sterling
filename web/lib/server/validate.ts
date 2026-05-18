// Hawkeye-Sterling - zod-backed request validation.
//
// Implements RULE 5 / D13 (validation hardening). Every public-API
// boundary that takes a JSON body SHOULD validate it through a zod
// schema before business logic runs. Malformed payloads get a
// uniform 400 response that matches the RULE 9 error contract.
//
// Adoption is gradual: new routes use validateBody(); existing routes
// migrate as they are touched.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildErrorBody } from './request-id';

/**
 * Maximum body size we'll accept on any zod-validated route. 5 MB is
 * generous for AML payloads (batch-screen accepts 10 000 rows; each
 * row is ~300 bytes worst case = ~3 MB) but caps a hostile client
 * from blowing up Lambda memory before validation runs.
 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export interface ValidationFault {
  path: string;
  message: string;
}

export interface ValidationFailure {
  ok: false;
  response: NextResponse;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

/**
 * Read + parse + validate a JSON request body against a zod schema.
 * Returns either { ok: true, value } or { ok: false, response } where
 * the response is a ready-to-return NextResponse with the RULE 9
 * error envelope.
 *
 * The caller passes `requestId` so the rejection includes the same id
 * that middleware minted, keeping correlation intact.
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  requestId: string,
): Promise<ValidationResult<z.infer<T>>> {
  // Body size guard (RULE 12 / oversize protection).
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const n = Number.parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          buildErrorBody(
            413,
            'payload_too_large',
            `Request body exceeds the ${MAX_BODY_BYTES} byte limit.`,
            requestId,
          ),
          { status: 413, headers: { 'x-request-id': requestId } },
        ),
      };
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        buildErrorBody(
          400,
          'invalid_json',
          'Request body is not valid JSON.',
          requestId,
        ),
        { status: 400, headers: { 'x-request-id': requestId } },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const faults: ValidationFault[] = parsed.error.issues.map((iss) => ({
      path: iss.path.join('.') || '<root>',
      message: iss.message,
    }));
    const responseBody = {
      ...buildErrorBody(
        400,
        'invalid_request_body',
        'Request body failed schema validation. See faults[] for details.',
        requestId,
      ),
      faults,
    };
    return {
      ok: false,
      response: NextResponse.json(responseBody, {
        status: 400,
        headers: { 'x-request-id': requestId },
      }),
    };
  }

  return { ok: true, value: parsed.data as z.infer<T> };
}

// ─── Canonical schemas for the highest-traffic routes ──────────────────
//
// These live alongside the helper because they are widely reused. Each
// schema is the AUTHORITATIVE shape of its request body - any drift
// between this schema and the route's own assumptions is a bug.

/** /api/quick-screen request body. */
export const QuickScreenRequestSchema = z.object({
  subject: z
    .object({
      name: z.string().min(1).max(500),
      aliases: z.array(z.string().max(500)).max(50).optional(),
      entityType: z
        .enum(['individual', 'organisation', 'vessel', 'aircraft', 'other'])
        .optional(),
      jurisdiction: z.string().max(8).optional(),
      dateOfBirth: z.string().max(32).optional(),
      nationality: z.string().max(8).optional(),
      passportNumber: z.string().max(64).optional(),
      nationalIdNumber: z.string().max(64).optional(),
    })
    .strict(),
  candidates: z
    .array(
      z
        .object({
          listId: z.string().min(1).max(64),
          listRef: z.string().min(1).max(128),
          name: z.string().min(1).max(500),
          aliases: z.array(z.string().max(500)).max(50).optional(),
          entityType: z
            .enum(['individual', 'organisation', 'vessel', 'aircraft', 'other'])
            .optional(),
          jurisdiction: z.string().max(8).optional(),
          programs: z.array(z.string().max(128)).max(50).optional(),
          dateOfBirth: z.string().max(32).optional(),
          nationality: z.string().max(8).optional(),
        })
        .strict(),
    )
    .max(5_000)
    .optional(),
  options: z
    .object({
      scoreThreshold: z.number().min(0).max(100).optional(),
      maxHits: z.number().int().min(0).max(1_000).optional(),
      includeScoreBreakdown: z.boolean().optional(),
    })
    .strict()
    .optional(),
  evidenceUrls: z.array(z.string().url()).max(50).optional(),
  enrichmentHints: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().max(32).optional(),
      ipAddress: z.string().max(45).optional(),
      websiteUrl: z.string().url().optional(),
      walletAddress: z.string().max(128).optional(),
    })
    .strict()
    .optional(),
});

export type QuickScreenRequest = z.infer<typeof QuickScreenRequestSchema>;

/** /api/four-eyes POST body (enqueue an approval). */
export const FourEyesEnqueueSchema = z.object({
  subjectId: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-zA-Z0-9_\-:.]+$/),
  subjectName: z.string().min(1).max(500),
  action: z.enum(['str', 'freeze', 'decline', 'edd-uplift', 'escalate']),
  initiatedBy: z.string().min(1).max(128).optional(),
  reason: z.string().max(2_000).optional(),
  contextUrl: z.string().url().max(2_000).optional(),
});

export type FourEyesEnqueueRequest = z.infer<typeof FourEyesEnqueueSchema>;

/** /api/four-eyes PATCH body (approve / reject). */
export const FourEyesDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  operator: z.string().min(1).max(128),
  rejectionReason: z.string().max(2_000).optional(),
});

export type FourEyesDecisionRequest = z.infer<typeof FourEyesDecisionSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Imperative validation helpers (origin/main wave).
//
// Two validation styles co-exist in this file by design:
//   - validateBody() + Schema constants above  — zod-based, RULE 9 envelope
//   - validateString() + ValidationError below — imperative, throws on error
//
// New routes SHOULD prefer validateBody() with a strict zod schema. The
// imperative helpers below are kept for routes that already use them and
// for cases where a single-field check is cleaner than a full schema.
// ───────────────────────────────────────────────────────────────────────────

// Comprehensive input validation helpers for API route handlers.
//
// All validators:
//   - never throw — return null on invalid input
//   - are safe against prototype pollution
//   - have no external dependencies

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  readonly field: string;
  readonly code: string;

  constructor(field: string, message: string, code = "INVALID") {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.code = code;
  }
}

export function validationError(
  field: string,
  message: string,
  code = "INVALID",
): ValidationError {
  return new ValidationError(field, message, code);
}

/** Throws a ValidationError if value is null; otherwise returns the value. */
export function assertValid<T>(
  value: T | null,
  field: string,
  message?: string,
): T {
  if (value === null) {
    throw new ValidationError(
      field,
      message ?? `${field} is invalid or missing`,
      "INVALID",
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// validateString
// ---------------------------------------------------------------------------

export interface StringOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Regex the trimmed value must fully match. */
  pattern?: RegExp;
  label?: string;
}

/**
 * Returns the trimmed string if valid, or null if invalid.
 * - When required is false (default) an empty / whitespace-only value returns null.
 * - When required is true an empty value is treated as invalid (null).
 */
export function validateString(
  v: unknown,
  opts: StringOptions = {},
): string | null {
  if (typeof v !== "string") return null;

  const trimmed = v.trim();

  if (trimmed.length === 0) {
    return opts.required ? null : null;
  }

  const min = opts.minLength ?? 0;
  if (trimmed.length < min) return null;

  if (opts.maxLength !== undefined && trimmed.length > opts.maxLength) {
    return null;
  }

  if (opts.pattern && !opts.pattern.test(trimmed)) return null;

  return trimmed;
}

// ---------------------------------------------------------------------------
// validateEnum
// ---------------------------------------------------------------------------

export function validateEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  _label?: string,
): T | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim() as T;
  return (allowed as readonly string[]).includes(trimmed) ? trimmed : null;
}

// ---------------------------------------------------------------------------
// validatePositiveInt
// ---------------------------------------------------------------------------

export interface PositiveIntOptions {
  max?: number;
  label?: string;
}

export function validatePositiveInt(
  v: unknown,
  opts: PositiveIntOptions = {},
): number | null {
  let n: number;

  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    n = Number(trimmed);
  } else {
    return null;
  }

  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  if (opts.max !== undefined && n > opts.max) return null;

  return n;
}

// ---------------------------------------------------------------------------
// validateDate
// ---------------------------------------------------------------------------

/**
 * Accepts ISO 8601 date strings (full or date-only).
 * Returns the ISO string as-is (trimmed) or null if the value is not a
 * recognisable date.
 */
export function validateDate(v: unknown, _label?: string): string | null {
  if (typeof v !== "string") return null;

  const trimmed = v.trim();
  if (trimmed === "") return null;

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;

  // Reject obviously non-date strings that happen to parse (e.g. plain numbers)
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;

  return trimmed;
}

// ---------------------------------------------------------------------------
// validateBoolean
// ---------------------------------------------------------------------------

export function validateBoolean(v: unknown, _label?: string): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------

// RFC-5321 local part max 64, domain max 255, total max 254.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(v: unknown, _label?: string): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

// ---------------------------------------------------------------------------
// validateArray
// ---------------------------------------------------------------------------

export interface ArrayOptions {
  minLength?: number;
  maxLength?: number;
  label?: string;
}

export function validateArray<T>(
  v: unknown,
  itemValidator: (_x: unknown) => T | null,
  opts: ArrayOptions = {},
): T[] | null {
  if (!Array.isArray(v)) return null;

  if (opts.minLength !== undefined && v.length < opts.minLength) return null;
  if (opts.maxLength !== undefined && v.length > opts.maxLength) return null;

  const result: T[] = [];
  for (const item of v) {
    const validated = itemValidator(item);
    if (validated === null) return null;
    result.push(validated);
  }

  return result;
}

// ---------------------------------------------------------------------------
// validateRecord
// ---------------------------------------------------------------------------

/**
 * Returns a plain object (prototype-pollution safe) or null.
 * Strips inherited properties and rejects arrays / null.
 */
export function validateRecord(
  v: unknown,
  _label?: string,
): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;

  // Guard against prototype pollution: only allow objects whose prototype is
  // Object.prototype or null.
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return null;

  // Return own-enumerable properties only.
  const safe: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(v)) {
    safe[key] = (v as Record<string, unknown>)[key];
  }
  return safe;
}
