// Hawkeye Sterling — prefix composer.
// Assembles the authored prefix prompts from `deep-reasoning.js` into a
// single composite system-prompt prefix for a chained multi-mode run.
// The compliance charter (systemPrompt.ts) always leads; each mode's
// prefix is appended under a clearly labelled separator so the executor
// can follow the instructions in order.

import { SYSTEM_PROMPT } from '../policy/systemPrompt.js';
import { MLRO_PREFIX_BY_ID } from './mlro-prefixes.generated.js';

export interface ComposeOptions {
  /** Task role description appended after the charter. */
  taskRole?: string;
  /** Audience ('regulator' | 'mlro' | 'board'). */
  audience?: 'regulator' | 'mlro' | 'board';
  /** If true, include the 7-section output structure reminder. */
  remindOutputStructure?: boolean;
}

const AUDIENCE_LINES: Record<NonNullable<ComposeOptions['audience']>, string> = {
  regulator: 'Audience: UAE FIU / MoE regulator. Formal, citation-dense, no hedging without evidence.',
  mlro:      'Audience: MLRO investigator. Timeline, entity graph, reasoning chain, explicit next-step recommendations.',
  board:     'Audience: Board. Top-line verdict, risk posture, three key findings, one-page TL;DR, no jargon.',
};

const OUTPUT_STRUCTURE_REMINDER = [
  '',
  '================================================================================',
  'MANDATORY OUTPUT STRUCTURE — 7 sections, exactly:',
  '  1. SUBJECT_IDENTIFIERS',
  '  2. SCOPE_DECLARATION',
  '  3. FINDINGS',
  '  4. GAPS',
  '  5. RED_FLAGS',
  '  6. RECOMMENDED_NEXT_STEPS',
  '  7. AUDIT_LINE',
  '================================================================================',
].join('\n');

export interface ComposedPrefix {
  system: string;
  modesApplied: string[];
  modesMissingPrefix: string[];
  charterHash: string;
  charLength: number;
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function composeSystemPrompt(
  modeIds: readonly string[],
  opts: ComposeOptions = {},
): ComposedPrefix {
  const parts: string[] = [SYSTEM_PROMPT];

  const applied: string[] = [];
  const missing: string[] = [];

  if (modeIds.length > 0) {
    parts.push('');
    parts.push('================================================================================');
    parts.push('CHAINED REASONING MODES — apply in order, each frame stacks on the prior');
    parts.push('================================================================================');
    let n = 1;
    for (const id of modeIds) {
      const rec = MLRO_PREFIX_BY_ID.get(id);
      if (!rec || !rec.prefix) {
        missing.push(id);
        continue;
      }
      parts.push('');
      parts.push(`─── [${n}/${modeIds.length}] MODE: ${id}${rec.label && rec.label !== id ? ' — ' + rec.label : ''} ───`);
      parts.push(rec.prefix);
      applied.push(id);
      n++;
    }
  }

  if (opts.taskRole) {
    parts.push('');
    parts.push('================================================================================');
    parts.push('TASK ROLE');
    parts.push('================================================================================');
    parts.push('');
    parts.push(opts.taskRole);
  }

  if (opts.audience) {
    parts.push('');
    parts.push(AUDIENCE_LINES[opts.audience]);
  }

  if (opts.remindOutputStructure ?? true) {
    parts.push(OUTPUT_STRUCTURE_REMINDER);
  }

  const system = parts.join('\n');
  return {
    system,
    modesApplied: applied,
    modesMissingPrefix: missing,
    charterHash: fnv1a(SYSTEM_PROMPT),
    charLength: system.length,
  };
}
