// Hawkeye Sterling — Anthropic model capability map.
//
// Single source of truth used by every advisor / agent integration that
// optionally enables the `thinking: { type: 'adaptive' }` block on the
// Anthropic Messages API. Centralising the check here prevents the
// "400 adaptive thinking is not supported on this model" failure mode
// when a caller passes `thinking:true` for a model that doesn't accept
// the parameter (e.g. Claude Haiku 4.5).

const NON_THINKING_PATTERNS: readonly RegExp[] = [
  // Claude Haiku tiers (4.5 and earlier) reject the `thinking` block.
  /haiku/i,
];

/**
 * Returns true when the given Anthropic model id accepts the optional
 * `thinking: { type: 'adaptive' }` block on the Messages API.
 *
 * Callers MUST gate any `thinking` payload on this so a stray
 * `enableThinking:true` from an upstream caller is silently downgraded
 * instead of producing a 400 from Anthropic.
 */
export function supportsAdaptiveThinking(modelId: string): boolean {
  if (!modelId) return false;
  return !NON_THINKING_PATTERNS.some((re) => re.test(modelId));
}

/**
 * Returns true when the given Anthropic model id accepts
 * `output_config: { effort }` on the Messages API.
 *
 * Effort ships on Fable/Mythos 5, Opus 4.5 and later, and Sonnet 4.6 and
 * later. Haiku tiers, Sonnet 4.5 and older, and Opus 4.1/4.0 reject the
 * parameter with `400 This model does not support the effort parameter.`
 * (production failure 2026-06-12: speed-mode executor = Haiku 4.5 +
 * effort:'high'). Callers MUST gate any effort payload on this, exactly
 * like supportsAdaptiveThinking() above.
 */
export function supportsEffort(modelId: string): boolean {
  if (!modelId) return false;
  if (/haiku/i.test(modelId)) return false;
  if (/fable|mythos/i.test(modelId)) return true;
  if (/opus-(?:[5-9]|4-[5-9])/i.test(modelId)) return true;
  if (/sonnet-(?:[5-9]|4-[6-9])/i.test(modelId)) return true;
  return false;
}
