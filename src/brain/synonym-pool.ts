// Combined intelligence / reasoning / thinking / smarts / judgment / analysis /
// strong-mind synonym pool. This is the authoritative lexical surface the brain
// recognises when describing its own cognitive operation — used for matching,
// UI copy, and faculty-scope expansion.

export const COMBINED_SYNONYM_POOL: readonly string[] = [
  'brilliance', 'brainpower', 'intellect', 'mental acuity', 'genius', 'erudition',
  'sharpness of mind', 'intellectual prowess', 'cleverness', 'giftedness',
  'logic', 'rationality', 'deduction', 'inference', 'ratiocination',
  'sound judgment', 'logical thinking', 'cogitation', 'syllogistic thinking',
  'argumentation',
  'contemplation', 'reflection', 'introspection', 'rumination', 'meditation',
  'pondering', 'profound thought', 'cerebration', 'musing', 'deliberation',
  'clever', 'astute', 'sharp', 'shrewd', 'quick-witted', 'bright', 'keen',
  'perceptive', 'savvy', 'ingenious', 'canny', 'discerning',
  'practical wisdom', 'horse sense', 'level-headedness', 'pragmatism',
  'prudence', 'sensibility', 'good sense', 'nous', 'gumption', 'native wit',
  'data interpretation', 'analytics', 'quantitative analysis', 'statistical analysis',
  'data mining', 'data evaluation', 'information processing', 'empirical analysis',
  'data examination', 'computational analysis',
  'powerful intellect', 'formidable mind', 'agile mind', 'keen intellect',
  'robust cognition', 'incisive mind', 'steel-trap mind', 'razor-sharp intellect',
  'mental powerhouse', 'towering intellect', 'muscular intellect',
  'commanding intellect', 'penetrating mind', 'vigorous mind', 'big brain',
  'sharp cookie', 'quick thinker', 'heavyweight thinker', 'brainy',
  'mental athlete', 'high cognitive capacity', 'strong cognitive faculties',
  'superior mental acumen', 'formidable intellectual capacity', 'rigorous intellect',
] as const;

export const COMBINED_SYNONYM_COUNT = COMBINED_SYNONYM_POOL.length;

// Flat set of keywords the brain recognises as meaning "intelligence / reasoning /
// thinking / smarts / judgment / analysis / strong mind" — used for matching,
// classification, and UI copy.
export const INTELLIGENCE_KEYWORDS: ReadonlySet<string> = new Set<string>([
  // Core intelligence / cognitive capacity
  'intelligence', 'intellect', 'brilliance', 'brainpower', 'genius',
  'erudition', 'acumen', 'cognition', 'cognitive capacity',
  'intellectual capacity', 'mental acuity', 'giftedness',

  // Smart / sharp (adjectives)
  'smart', 'clever', 'astute', 'sharp', 'shrewd', 'bright',
  'keen', 'perceptive', 'savvy', 'ingenious', 'canny',
  'discerning', 'quick-witted', 'brainy', 'incisive',

  // Reasoning / logic
  'reasoning', 'logic', 'logical thinking', 'rationality',
  'deduction', 'inference', 'sound judgment', 'judgment',
  'deliberation', 'argumentation', 'critical thinking',

  // Deep / analytical thinking
  'deep thinking', 'analytical thinking', 'contemplation',
  'reflection', 'introspection', 'pondering', 'strategic thinking',
  'conceptual thinking', 'systems thinking',

  // Practical judgment
  'common sense', 'practical wisdom', 'pragmatism', 'prudence',
  'good sense', 'level-headedness', 'sensibility',

  // Data / analysis
  'data analysis', 'data interpretation', 'analytics',
  'quantitative analysis', 'statistical analysis', 'data mining',
  'empirical analysis', 'data evaluation', 'information processing',

  // Strong-mind descriptors
  'powerful intellect', 'formidable mind', 'agile mind',
  'keen intellect', 'sharp mind', 'penetrating mind',
  'razor-sharp intellect', 'strong cognitive faculties',
]);

// Screening taxonomy — categorised synonym buckets. Used by the brain to
// classify self-descriptions and by the UI to render faculty cards.
export const SCREENING_TAXONOMY: Record<string, readonly string[]> = {
  intelligence: [
    'intelligence', 'intellect', 'brilliance', 'genius',
    'acumen', 'brainpower', 'cognitive capacity',
    'mental acuity', 'erudition',
  ],
  smart: [
    'smart', 'clever', 'astute', 'sharp', 'shrewd',
    'bright', 'keen', 'perceptive', 'savvy',
    'ingenious', 'quick-witted', 'brainy',
  ],
  reasoning: [
    'reasoning', 'logic', 'logical thinking',
    'rationality', 'deduction', 'inference',
    'critical thinking', 'sound judgment',
  ],
  deep_thinking: [
    'deep thinking', 'analytical thinking',
    'contemplation', 'reflection', 'strategic thinking',
    'conceptual thinking', 'systems thinking',
  ],
  common_sense: [
    'common sense', 'practical wisdom', 'pragmatism',
    'prudence', 'good sense', 'level-headedness',
  ],
  data_analysis: [
    'data analysis', 'data interpretation', 'analytics',
    'quantitative analysis', 'statistical analysis',
    'data mining', 'empirical analysis',
  ],
  strong_mind: [
    'powerful intellect', 'formidable mind',
    'agile mind', 'keen intellect', 'sharp mind',
    'penetrating mind', 'razor-sharp intellect',
  ],
};

// Helper: classify a free-text blurb into SCREENING_TAXONOMY buckets by
// case-insensitive substring match. Returns bucket → matched-terms map.
export function classifyIntelligenceText(text: string): Record<string, string[]> {
  const hay = text.toLowerCase();
  const out: Record<string, string[]> = {};
  for (const [bucket, terms] of Object.entries(SCREENING_TAXONOMY)) {
    const hits = terms.filter((t) => hay.includes(t.toLowerCase()));
    if (hits.length > 0) out[bucket] = hits;
  }
  return out;
}
