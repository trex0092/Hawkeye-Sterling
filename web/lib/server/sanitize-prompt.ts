/**
 * Sanitizes user-supplied strings before interpolation into LLM prompts.
 * Strips newlines from single-line fields to prevent newline-injection attacks.
 * Does NOT strip newlines from multi-line fields (narrative, context) — use
 * sanitizeMultiLine for those, which only strips leading/trailing whitespace.
 */
// Comprehensive Unicode injection filter: direction overrides, zero-width chars,
// invisible separators, and other chars that can hide injected content in LLM prompts.
const UNICODE_OVERRIDES =
  /[​‌‍‎‏‪‫‬‭‮⁠⁡⁢⁣⁤﻿­͏ᅟᅠ឴឵᠋-᠍᠏ㅤﾠ\u{E0000}-\u{E007F}]/gu;

export function sanitizeField(value: string | undefined | null, maxLength = 500): string {
  if (!value) return "";
  return value
    .replace(UNICODE_OVERRIDES, "")
    .replace(/\x00/g, "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/\\[nrt]/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes multi-line text (narrative, context) for LLM prompts.
 * Preserves internal newlines but caps length and strips leading/trailing whitespace.
 */
export function sanitizeText(value: string | undefined | null, maxLength = 5000): string {
  if (!value) return "";
  return value
    .replace(UNICODE_OVERRIDES, "")
    .replace(/\x00/g, "")
    .trim()
    .slice(0, maxLength);
}

const INJECTION_PATTERNS =
  /\b(ignore\s+(all\s+)?previous|disregard\s+(all\s+)?previous|forget\s+(all\s+)?previous|new\s+instructions?|system\s*prompt|you\s+are\s+now\s+a|act\s+as\s+(an?\s+)?)/gi;

/**
 * Sanitizes narrative/free-text content before sending to the LLM.
 * Strips Unicode overrides, null bytes, and common prompt-injection phrases.
 *
 * NFKD normalization is applied before injection-pattern matching so that
 * Unicode lookalikes and compatibility characters (e.g. full-width space
 * U+3000, soft hyphen U+00AD) cannot bypass the pattern regex. Combining
 * marks stripped post-normalization to neutralize diacritic obfuscation.
 */
export function sanitizeLlmInput(value: string | undefined | null, maxLength = 5000): string {
  if (!value) return "";
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "");
  return normalized
    .replace(UNICODE_OVERRIDES, "")
    .replace(/\x00/g, "")
    .replace(INJECTION_PATTERNS, "[REDACTED]")
    .trim()
    .slice(0, maxLength);
}
