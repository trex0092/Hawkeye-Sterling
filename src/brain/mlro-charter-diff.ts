// Hawkeye Sterling — charter-diff.
// Shows exactly which charter prohibitions (P1–P10) a given output tripped,
// with the matched span so the MLRO can see why. Used inline in the
// workspace to render a "what failed" badge row after each run.

import { ABSOLUTE_PROHIBITIONS, type ProhibitionId } from '../policy/systemPrompt.js';

interface ProhibitionProbe {
  id: ProhibitionId;
  label: string;
  patterns: RegExp[];
  hint: string;
}

const PROBES: ProhibitionProbe[] = [
  {
    id: 'P1',
    label: 'No unverified sanctions assertions',
    patterns: [
      /\b(the subject|they) (is|are) (currently )?sanctioned\b(?!.*\b(according to|per|source|list))/i,
      /\bsanctions designation\b(?!.*\b(source|list|article|regulation))/i,
    ],
    hint: 'Sanctions status asserted without naming the authoritative source / list + version.',
  },
  {
    id: 'P2',
    label: 'No fabricated adverse media',
    patterns: [
      /\b(according to reports|media reports indicate)\b(?!.*\b(http|www|reuters|ft|bloomberg|gulf news|khaleej times))/i,
      /\breports (indicate|suggest)\b(?!.*\b(source|outlet|dated|published))/i,
    ],
    hint: 'Adverse-media claim without a citable source.',
  },
  {
    id: 'P3',
    label: 'No legal conclusions',
    patterns: [
      /\b(constitutes|amounts to|qualifies as)\b.*\b(money laundering|terrorist financing|bribery|fraud|corruption|proliferation financing|sanctions evasion)\b/i,
      /\bthis (behaviour|conduct) is (illegal|criminal|unlawful)\b/i,
    ],
    hint: 'Legal conclusion drawn — reserved to the MLRO / FIU / courts.',
  },
  {
    id: 'P4',
    label: 'No tipping-off content',
    patterns: [
      /\b(inform|notify|tell) (the )?(customer|subject|client) (that|about)\b.*\b(str|sar|ffr|pnmr|investigation|suspicion|filing|regulator)\b/i,
      /\b(please|you should|you must) (withdraw|move|transfer) (funds|money|the balance) (before|prior to)\b/i,
      /\bwe (have|are) (filed|filing|submitted|submitting) an? (str|sar|ffr|pnmr)\b/i,
    ],
    hint: 'Tipping-off language — would disclose an internal suspicion / filing.',
  },
  {
    id: 'P5',
    label: 'No allegation upgrade',
    patterns: [
      /\bthe subject (is|was) (guilty|liable|convicted)\b(?!.*\b(on [A-Z]\w+ \d{4}|by [A-Z][^,.]+ court))/i,
      /\b(laundered|bribed|embezzled|defrauded|smuggled)\b(?!.*\b(alleged|reported|charged|accused))/i,
    ],
    hint: 'Outcome verb used without a final determination — use allegation vocabulary.',
  },
  {
    id: 'P6',
    label: 'No merging of distinct persons/entities',
    patterns: [
      /\bwe (have )?(merged|consolidated) (these )?(profiles|subjects|records)\b/i,
      /\bthe same individual as\b.*\b(name-only|partial name)\b/i,
    ],
    hint: 'Merge across partial-name matches without strong identifiers.',
  },
  {
    id: 'P7',
    label: 'No "clean" result without scope declaration',
    patterns: [
      // Strong "no match" assertion WITHOUT either a SCOPE_DECLARATION section header or any list-name citation.
      /^\s*no match\s*\.?\s*$/im,
    ],
    hint: 'Clean result emitted without a scope declaration (lists + versions + identifiers).',
  },
  {
    id: 'P8',
    label: 'No training-data-as-current-source',
    patterns: [
      /\b(based on my (training|knowledge)|according to my (training|training data))\b/i,
    ],
    hint: 'Relies on training data as a current source.',
  },
  {
    id: 'P9',
    label: 'No opaque risk scoring',
    patterns: [
      /\brisk score(:| of | is )\s*\d+(\.\d+)?\b(?!.*\b(methodology|inputs|weights|gaps))/i,
      /\b(high|medium|low) risk\b(?!.*\b(because|based on|per))/i,
    ],
    hint: 'Risk score or tier asserted without declared methodology + inputs + weights + gaps.',
  },
  {
    id: 'P10',
    label: 'No proceed on insufficient info',
    patterns: [
      /\bassuming\b(?!.*\b(state the assumption|marked \[ASSUMED\]))/i,
    ],
    hint: 'Proceeds on an unstated assumption instead of halting + returning a gap list.',
  },
];

export interface CharterProbe {
  id: ProhibitionId;
  label: string;
  hint: string;
  match: string | null;
  matchIndex: number | null;
}

export interface CharterDiff {
  totalChecked: number;
  failed: CharterProbe[];
  passed: CharterProbe[];
  allowed: boolean;
}

export function charterDiff(text: string): CharterDiff {
  const failed: CharterProbe[] = [];
  const passed: CharterProbe[] = [];
  for (const p of PROBES) {
    let matched: RegExpExecArray | null = null;
    for (const rx of p.patterns) {
      const r = new RegExp(rx.source, rx.flags);
      const m = r.exec(text);
      if (m) { matched = m; break; }
    }
    if (matched) {
      failed.push({
        id: p.id,
        label: p.label,
        hint: p.hint,
        match: matched[0],
        matchIndex: matched.index,
      });
    } else {
      passed.push({ id: p.id, label: p.label, hint: p.hint, match: null, matchIndex: null });
    }
  }
  // Special case for P7 — escalate only if there is a bare "no match" AND no scope declaration / list reference.
  if (failed.find((f) => f.id === 'P7')) {
    const hasScope = /\b(SCOPE_DECLARATION|lists? checked|list version|screened against)\b/i.test(text) ||
                     /\b(UN(\s+Consolidated)?|OFAC|UK OFSI|EU Consolidated|EOCN)\b/i.test(text);
    if (hasScope) {
      const i = failed.findIndex((f) => f.id === 'P7');
      const p7 = failed.splice(i, 1)[0]!;
      passed.push({ ...p7, match: null, matchIndex: null });
    }
  }
  // Confirm we spanned the charter.
  if (passed.length + failed.length !== ABSOLUTE_PROHIBITIONS.length) {
    // Shouldn't happen — but record a synthetic "coverage" failure.
    return {
      totalChecked: ABSOLUTE_PROHIBITIONS.length,
      failed: [],
      passed: [],
      allowed: false,
    };
  }
  return {
    totalChecked: ABSOLUTE_PROHIBITIONS.length,
    failed,
    passed,
    allowed: failed.length === 0,
  };
}
