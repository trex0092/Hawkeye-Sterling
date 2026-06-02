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
