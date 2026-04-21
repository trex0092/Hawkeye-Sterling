export type FacultyId =
  | 'reasoning'
  | 'data_analysis'
  | 'deep_thinking'
  | 'intelligence'
  | 'smartness'
  | 'strong_brain'
  | 'inference'
  | 'argumentation'
  | 'introspection'
  | 'ratiocination';

export interface Faculty {
  id: FacultyId;
  label: string;
  synonyms: readonly string[];
  summary: string;
}

export const FACULTIES: readonly Faculty[] = [
  {
    id: 'reasoning',
    label: 'Reasoning',
    synonyms: [
      'logic', 'deduction', 'inference', 'rationalization', 'argumentation',
      'analysis', 'cogitation', 'ratiocination', 'sense-making', 'thought process',
    ],
    summary: 'Deductive chain over list hits, relationships and context.',
  },
  {
    id: 'data_analysis',
    label: 'Data analysis',
    synonyms: [
      'data interpretation', 'data mining', 'data crunching', 'analytics',
      'quantitative analysis', 'statistical analysis', 'data examination',
      'data evaluation', 'data modeling', 'data processing',
    ],
    summary: 'Direct-source feed normalisation and schema reconciliation.',
  },
  {
    id: 'deep_thinking',
    label: 'Deep thinking',
    synonyms: [
      'contemplation', 'reflection', 'rumination', 'introspection',
      'meditation', 'pondering', 'musing', 'deliberation', 'cerebration',
      'profound thought',
    ],
    summary: 'Multi-hop graph traversal across entities, aliases, vessels.',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    synonyms: [
      'intellect', 'acumen', 'cleverness', 'brilliance', 'brainpower',
      'wit', 'sagacity', 'perspicacity', 'mental capacity', 'cognitive ability',
    ],
    summary: 'Cross-list corroboration and sanction-regime mapping.',
  },
  {
    id: 'smartness',
    label: 'Smartness',
    synonyms: [
      'sharpness', 'shrewdness', 'astuteness', 'quick-wittedness', 'savvy',
      'canniness', 'ingenuity', 'resourcefulness', 'adroitness', 'keenness',
    ],
    summary: 'Context-aware fuzzy scoring; no naïve Levenshtein thresholds.',
  },
  {
    id: 'strong_brain',
    label: 'Strong brain',
    synonyms: [
      'sharp mind', 'keen intellect', 'powerful mind', 'quick mind',
      'agile mind', 'brilliant mind', 'analytical mind', 'steel-trap mind',
      'mental prowess', 'intellectual firepower',
    ],
    summary: 'Arabic, Cyrillic, CJK phonetic normalisation (Double-Metaphone+).',
  },
  {
    id: 'inference',
    label: 'Inference',
    synonyms: [
      'implication', 'derivation', 'induction', 'abduction', 'projection',
      'extrapolation', 'surmisal', 'presumption', 'reasoned guess', 'entailment',
    ],
    summary: 'Derives intent from adverse-media signals and timeline deltas.',
  },
  {
    id: 'argumentation',
    label: 'Argumentation',
    synonyms: [
      'disputation', 'debate', 'dialectic', 'reasoned discourse', 'case-making',
      'advocacy', 'refutation', 'rebuttal', 'counter-argument', 'pro-contra framing',
    ],
    summary: 'Pro/contra framing for every hit, with counter-evidence.',
  },
  {
    id: 'introspection',
    label: 'Introspection',
    synonyms: [
      'self-examination', 'self-critique', 'self-reflection', 'self-scrutiny',
      'inward review', 'metacognition', 'self-audit', 'self-monitoring',
      'reflective practice', 'calibration',
    ],
    summary: 'Self-critique pass; flags low-confidence or conflicted verdicts.',
  },
  {
    id: 'ratiocination',
    label: 'Ratiocination',
    synonyms: [
      'reasoned conclusion', 'formal reasoning', 'principled deduction',
      'methodical inference', 'rigorous argument', 'analytical closure',
      'terminal synthesis', 'final narrative', 'regulator-facing rationale',
      'signed verdict',
    ],
    summary: 'Final regulator-facing narrative, persisted and signed.',
  },
] as const;

export const FACULTY_IDS: readonly FacultyId[] = FACULTIES.map((f) => f.id);
