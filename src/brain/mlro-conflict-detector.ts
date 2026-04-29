// Hawkeye Sterling — cross-mode conflict detector.
// Compares the outputs of two or more runs and surfaces where they
// diverge. Used when the MLRO chains multiple reasoning modes and wants
// to know whether the modes AGREE on the verdict or CONTRADICT each
// other — a disagreement is a signal for deeper review, not a bug.
//
// The detector is intentionally lexical (no LLM call) so it runs inline
// in the picker. It extracts three kinds of claims:
//   • verdict tokens (APPROVED / BLOCKED / RETURNED_FOR_REVISION /
//     FREEZE / ESCALATE / CLEARED / NO MATCH / MATCH / …)
//   • confidence tokens (EXACT / STRONG / POSSIBLE / WEAK / NO MATCH)
//   • citation ids (FDL 10/2025 Art.X, CR N/YYYY Art.X, UN YYY, OFAC …)
// and compares them across runs.

export interface RunOutput {
  modeId: string;
  text: string;
}

export interface ConflictReport {
  modesCompared: string[];
  verdictAgreement: 'unanimous' | 'majority' | 'split' | 'insufficient';
  verdictTokensByMode: Record<string, string[]>;
  confidenceAgreement: 'unanimous' | 'majority' | 'split' | 'insufficient';
  confidenceByMode: Record<string, string[]>;
  citationOverlap: {
    shared: string[];
    byMode: Record<string, string[]>;
    uniqueByMode: Record<string, string[]>;
  };
  textualJaccard: number;          // 0..1 average pairwise Jaccard on tokens
  divergenceScore: number;         // 0..1 where higher = more conflict
  conflicts: Array<{ kind: 'verdict' | 'confidence' | 'citation'; detail: string }>;
}

// VERDICT_RX intentionally omits bare `MATCH` — "with EXACT match" is a
// confidence-tier phrase, not a verdict, and including it caused every
// confidence mention to masquerade as a verdict token.
const VERDICT_RX = /\b(APPROVED|BLOCKED|RETURNED[_ ]FOR[_ ]REVISION|FREEZE|ESCALATE|CLEARED|NO[ _]MATCH|DO[ _]NOT[ _]ONBOARD|EXIT[ _]RELATIONSHIP|HEIGHTENED[ _]MONITORING|STR[ _]FILED|FFR[ _]FILED|PNMR[ _]FILED)\b/gi;
const CONFIDENCE_RX = /\b(EXACT|STRONG|POSSIBLE|WEAK|NO[ _]MATCH|INCOMPLETE)\b/gi;
const CITATION_RX = /\b(?:FDL\s+(?:No\.\s*)?\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|Cabinet\s+(?:Decision|Resolution|Res\.?|Rel)\s+(?:No\.\s*)?\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|CR\s+\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|FATF\s+R\.\s*\d+|UN\s+\d{3,4}|UNSCR\s+\d+|OFAC|UK\s+OFSI|EOCN|LBMA\s+RGG|OECD\s+DDG)\b/gi;

function normToken(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '_');
}

function uniqueExtract(text: string, rx: RegExp): string[] {
  const out = new Set<string>();
  const r = new RegExp(rx.source, rx.flags);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) out.add(normToken(m[0]));
  return [...out].sort();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s_]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function agreementOf(values: string[][]): 'unanimous' | 'majority' | 'split' | 'insufficient' {
  const nonEmpty = values.filter((v) => v.length > 0);
  if (nonEmpty.length < 2) return 'insufficient';
  const keys = nonEmpty.map((v) => v.slice().sort().join('|'));
  const uniq = new Set(keys);
  if (uniq.size === 1) return 'unanimous';
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
  const top = Math.max(...Object.values(counts));
  if (top > keys.length / 2) return 'majority';
  return 'split';
}

export function detectConflicts(runs: readonly RunOutput[]): ConflictReport {
  if (runs.length === 0) {
    return {
      modesCompared: [],
      verdictAgreement: 'insufficient',
      verdictTokensByMode: {},
      confidenceAgreement: 'insufficient',
      confidenceByMode: {},
      citationOverlap: { shared: [], byMode: {}, uniqueByMode: {} },
      textualJaccard: 1,
      divergenceScore: 0,
      conflicts: [],
    };
  }

  const verdictByMode: Record<string, string[]> = {};
  const confByMode: Record<string, string[]> = {};
  const citByMode: Record<string, string[]> = {};

  for (const r of runs) {
    verdictByMode[r.modeId] = uniqueExtract(r.text, VERDICT_RX);
    confByMode[r.modeId] = uniqueExtract(r.text, CONFIDENCE_RX);
    citByMode[r.modeId] = uniqueExtract(r.text, CITATION_RX);
  }

  const verdictAgreement = agreementOf(Object.values(verdictByMode));
  const confAgreement = agreementOf(Object.values(confByMode));

  // Citation overlap.
  const modes = runs.map((r) => r.modeId);
  const sets = modes.map((m) => new Set(citByMode[m]));
  const shared = sets.length === 0 ? [] : [...sets[0]!].filter((x) => sets.every((s) => s.has(x))).sort();
  const uniqueByMode: Record<string, string[]> = {};
  for (let i = 0; i < modes.length; i++) {
    const others = new Set<string>();
    for (let j = 0; j < modes.length; j++) if (j !== i) sets[j]!.forEach((v) => others.add(v));
    uniqueByMode[modes[i]!] = [...sets[i]!].filter((x) => !others.has(x)).sort();
  }

  // Textual Jaccard — average pairwise.
  const tokens = runs.map((r) => tokenSet(r.text));
  let pairs = 0, total = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      total += jaccard(tokens[i]!, tokens[j]!);
      pairs++;
    }
  }
  const avgJaccard = pairs === 0 ? 1 : total / pairs;

  const conflicts: ConflictReport['conflicts'] = [];
  if (verdictAgreement === 'split') conflicts.push({ kind: 'verdict', detail: 'Verdict tokens differ across modes with no majority.' });
  if (confAgreement === 'split') conflicts.push({ kind: 'confidence', detail: 'Match-confidence classification differs with no majority.' });
  for (const m of modes) {
    if ((uniqueByMode[m] ?? []).length > 0 && runs.length >= 2) {
      conflicts.push({ kind: 'citation', detail: `${m} cites ${uniqueByMode[m]!.length} unique authority/article not referenced by peers.` });
    }
  }

  const verdictPenalty = verdictAgreement === 'split' ? 0.4 : verdictAgreement === 'majority' ? 0.2 : 0;
  const confPenalty = confAgreement === 'split' ? 0.3 : confAgreement === 'majority' ? 0.15 : 0;
  const lexicalPenalty = Math.max(0, 1 - avgJaccard) * 0.3;
  const divergenceScore = Math.min(1, verdictPenalty + confPenalty + lexicalPenalty);

  return {
    modesCompared: modes,
    verdictAgreement,
    verdictTokensByMode: verdictByMode,
    confidenceAgreement: confAgreement,
    confidenceByMode: confByMode,
    citationOverlap: { shared, byMode: citByMode, uniqueByMode },
    textualJaccard: avgJaccard,
    divergenceScore,
    conflicts,
  };
}
