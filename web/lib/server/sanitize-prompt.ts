/**
 * Sanitizes user-supplied strings before interpolation into LLM prompts.
 * Strips newlines from single-line fields to prevent newline-injection attacks.
 * Does NOT strip newlines from multi-line fields (narrative, context) — use
 * sanitizeMultiLine for those, which only strips leading/trailing whitespace.
 */
export function sanitizeField(value: string | undefined | null, maxLength = 500): string {
  if (!value) return "";
  return value.replace(/\r?\n|\r/g, " ").replace(/\t/g, " ").trim().slice(0, maxLength);
}

/**
 * Sanitizes multi-line text (narrative, context) for LLM prompts.
 * Preserves internal newlines but caps length and strips leading/trailing whitespace.
 */
export function sanitizeText(value: string | undefined | null, maxLength = 5000): string {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
}
