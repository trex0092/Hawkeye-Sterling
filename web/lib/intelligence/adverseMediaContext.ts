// Hawkeye Sterling — adverse-media context analyzer.
//
// Given an article snippet/title and the subject's name, determine the
// CONTEXT in which the subject appears: are they the accused, a victim,
// a witness, an expert quoted, or just mentioned in passing? Severity
// weight is multiplied by context — being NAMED as the accused is high
// severity; being QUOTED as a banking-sector expert in an unrelated story
// should never elevate the dossier band.
//
// Pure-function, regex-driven. The signal is heuristic — Claude-grade
// NLU happens server-side via the live news pipeline, but this module
// gives the brain a fast, deterministic baseline.

export type ContextRole =
  | "accused"           // subject is the accused / defendant / target
  | "convicted"         // verdict already in
  | "investigated"      // under investigation but no charges
  | "associated"        // named as associate / co-conspirator
  | "victim"            // victim of crime
  | "witness"           // witness only
  | "expert_quoted"     // quoted as commentator / expert
  | "passing_mention"   // generic mention in unrelated context
  | "denial"            // subject denying allegations
  | "unknown";

export interface ContextResult {
  role: ContextRole;
  /** Severity multiplier: 0..1.5. accused=1, mentioned=0.1, expert=0. */
  severityMultiplier: number;
  /** Specific phrase that anchored the classification. */
  anchorPhrase: string | null;
}

const PATTERNS: Array<{ role: ContextRole; severityMultiplier: number; rx: RegExp }> = [
  // Convicted
  { role: "convicted", severityMultiplier: 1.5, rx: /\b(?:convicted|sentenced|jailed|imprisoned|guilty\s+verdict|found\s+guilty|pleaded?\s+guilty|admitted\s+guilt)\b/i },
  // Accused / charged / indicted
  { role: "accused", severityMultiplier: 1.2, rx: /\b(?:accused|charged|indicted|prosecuted|defendant|stand\s+trial|on\s+trial)\b/i },
  // Investigated
  { role: "investigated", severityMultiplier: 0.8, rx: /\b(?:investigation|investigat(?:ed|ing)|probe|probed|examin(?:ed|ing)|under\s+scrutiny|raid(?:ed)?|seized)\b/i },
  // Sanctioned / designated
  { role: "accused", severityMultiplier: 1.3, rx: /\b(?:sanction(?:ed|s)|designat(?:ed|ion)|blacklist(?:ed)?|added\s+to\s+the\s+SDN)\b/i },
  // Associated / linked
  { role: "associated", severityMultiplier: 0.6, rx: /\b(?:associated\s+with|linked\s+to|connected\s+to|co.?conspirator|alleged\s+associate|business\s+partner\s+of)\b/i },
  // Denial
  { role: "denial", severityMultiplier: 0.4, rx: /\b(?:denies?|denied|refut(?:es|ed)|reject(?:s|ed)\s+(?:the\s+)?allegations?|dismissed\s+as\s+false)\b/i },
  // Victim
  { role: "victim", severityMultiplier: 0.0, rx: /\b(?:victim|victimised|targeted\s+by|defrauded|scammed|robbed|kidnapped|attacked)\b/i },
  // Witness
  { role: "witness", severityMultiplier: 0.05, rx: /\b(?:witness(?:ed)?|gave\s+evidence|testifying|testified|provided\s+evidence)\b/i },
  // Expert quoted
  { role: "expert_quoted", severityMultiplier: 0.0, rx: /\b(?:said|told|commented|quoted|expert|analyst|spokesperson|spokeswoman|spokesman|added\s+that)\b/i },
];

/**
 * Classify a single snippet (article title + lead) for a named subject.
 * Run on each article in the GDELT / Taranis result set; the scorer
 * sums recency-weighted severity × contextMultiplier across articles.
 */
export function classifyContext(snippet: string, subjectName: string): ContextResult {
  if (!snippet || !subjectName) return { role: "unknown", severityMultiplier: 0, anchorPhrase: null };

  // Normalise whitespace, lowercase.
  const text = snippet.replace(/\s+/g, " ").trim();
  if (!text) return { role: "unknown", severityMultiplier: 0, anchorPhrase: null };

  // Look for the strongest signal — patterns are ordered most-to-least
  // severe; first match wins.
  for (const p of PATTERNS) {
    const m = text.match(p.rx);
    if (m) {
      // If subject's name is in the snippet but the role is "expert_quoted"
      // and there's no other crime-related keyword, downgrade further.
      if (p.role === "expert_quoted" && !/\b(?:crime|fraud|sanction|launder|corrupt|terror)\w*/i.test(text)) {
        return { role: "expert_quoted", severityMultiplier: 0, anchorPhrase: m[0] };
      }
      return { role: p.role, severityMultiplier: p.severityMultiplier, anchorPhrase: m[0] };
    }
  }

  // No strong signal but the subject is named — mention in passing.
  if (text.toLowerCase().includes(subjectName.toLowerCase())) {
    return { role: "passing_mention", severityMultiplier: 0.1, anchorPhrase: null };
  }
  return { role: "unknown", severityMultiplier: 0, anchorPhrase: null };
}

export interface ContextStats {
  /** Total articles classified. */
  total: number;
  /** Distribution by role. */
  byRole: Record<ContextRole, number>;
  /** Adjusted severity sum: sum(originalSeverity × contextMultiplier). */
  adjustedSeveritySum: number;
  /** Concentration: ratio of "accused / convicted / investigated" to total. */
  accusedConcentration: number;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 1,
  high: 0.7,
  medium: 0.4,
  low: 0.15,
  clear: 0,
};

export function aggregateContext(
  articles: Array<{ snippet: string; severity?: string }>,
  subjectName: string,
): ContextStats {
  const byRole: Record<ContextRole, number> = {
    accused: 0, convicted: 0, investigated: 0, associated: 0,
    victim: 0, witness: 0, expert_quoted: 0, passing_mention: 0,
    denial: 0, unknown: 0,
  };
  let adjusted = 0;
  let accused = 0;
  for (const a of articles) {
    const ctx = classifyContext(a.snippet, subjectName);
    byRole[ctx.role] += 1;
    const sevW = SEVERITY_WEIGHT[a.severity ?? "low"] ?? 0;
    adjusted += sevW * ctx.severityMultiplier;
    if (ctx.role === "accused" || ctx.role === "convicted" || ctx.role === "investigated") accused += 1;
  }
  return {
    total: articles.length,
    byRole,
    adjustedSeveritySum: adjusted,
    accusedConcentration: articles.length === 0 ? 0 : accused / articles.length,
  };
}
