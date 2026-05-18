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
