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
  itemValidator: (x: unknown) => T | null,
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
