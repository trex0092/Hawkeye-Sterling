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
