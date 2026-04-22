// Hawkeye Sterling — structured reasoning-run diff.
// Takes two MlroPipelineResult-shaped objects and produces a structured
// delta surfacing which sections changed, which citations moved in/out,
// which reasoning modes appeared or dropped, and — at the narrative level
// — a line-by-line LCS diff per section.

export interface DiffableResult {
  narrative: string;
  sections: Record<string, string>;
  stepResults: Array<{ modeId: string; text: string; ok: boolean; partial: boolean; elapsedMs: number }>;
  audit?: Array<{ modeId: string; entryHash: string }>;
}

export interface SectionDelta {
  section: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  linesAdded: number;
  linesRemoved: number;
  unifiedDiff: string;
}

export interface ModeDelta {
  added: string[];
  removed: string[];
  kept: string[];
  reordered: boolean;
}

export interface CitationDelta {
  added: string[];
  removed: string[];
  kept: string[];
}

export interface ReasoningDiff {
  sections: SectionDelta[];
  modes: ModeDelta;
  citations: CitationDelta;
  elapsedDeltaMs: number;
  narrativeSimilarity: number;  // Jaccard on tokens, 0..1
  materialChange: boolean;       // true iff any section changed or mode set differs
}

const CITATION_RX = /\b(?:FDL\s+(?:No\.\s*)?\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|Cabinet\s+(?:Decision|Resolution|Res\.?|Rel)\s+(?:No\.\s*)?\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|CR\s+\d+\/\d+(?:\s+Art\.\s*\d+(?:-\d+)?)?|FATF\s+R\.\s*\d+|UN\s+\d{3,4}|UNSCR\s+\d+|OFAC|UK\s+OFSI|EOCN|LBMA\s+RGG|OECD\s+DDG)\b/gi;

function extractCitations(text: string): Set<string> {
  const rx = new RegExp(CITATION_RX.source, CITATION_RX.flags);
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) out.add(m[0].toUpperCase().replace(/\s+/g, ' ').trim());
  return out;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s_]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

// Compact LCS-based unified diff. Context is 2 lines per hunk.
function unifiedDiff(a: string, b: string): { text: string; added: number; removed: number } {
  const A = a.split('\n');
  const B = b.split('\n');
  // Build LCS table.
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (A[i - 1] === B[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  // Backtrack.
  const ops: Array<{ op: ' ' | '+' | '-'; line: string }> = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) { ops.push({ op: ' ', line: A[i - 1]! }); i--; j--; }
    else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) { ops.push({ op: '-', line: A[i - 1]! }); i--; }
    else { ops.push({ op: '+', line: B[j - 1]! }); j--; }
  }
  while (i > 0) { ops.push({ op: '-', line: A[i - 1]! }); i--; }
  while (j > 0) { ops.push({ op: '+', line: B[j - 1]! }); j--; }
  ops.reverse();
  let added = 0, removed = 0;
  for (const o of ops) { if (o.op === '+') added++; else if (o.op === '-') removed++; }
  const text = ops.map((o) => o.op + o.line).join('\n');
  return { text, added, removed };
}

export function diffResults(a: DiffableResult, b: DiffableResult): ReasoningDiff {
  // Sections.
  const allSections = new Set<string>([...Object.keys(a.sections), ...Object.keys(b.sections)]);
  const sectionDeltas: SectionDelta[] = [];
  for (const s of allSections) {
    const av = a.sections[s];
    const bv = b.sections[s];
    if (av === undefined && bv !== undefined) {
      sectionDeltas.push({ section: s, status: 'added', linesAdded: bv.split('\n').length, linesRemoved: 0, unifiedDiff: bv.split('\n').map((l) => '+' + l).join('\n') });
    } else if (av !== undefined && bv === undefined) {
      sectionDeltas.push({ section: s, status: 'removed', linesAdded: 0, linesRemoved: av.split('\n').length, unifiedDiff: av.split('\n').map((l) => '-' + l).join('\n') });
    } else if (av !== undefined && bv !== undefined) {
      if (av === bv) sectionDeltas.push({ section: s, status: 'unchanged', linesAdded: 0, linesRemoved: 0, unifiedDiff: '' });
      else {
        const d = unifiedDiff(av, bv);
        sectionDeltas.push({ section: s, status: 'changed', linesAdded: d.added, linesRemoved: d.removed, unifiedDiff: d.text });
      }
    }
  }

  // Modes.
  const aModes = a.stepResults.map((s) => s.modeId);
  const bModes = b.stepResults.map((s) => s.modeId);
  const aSet = new Set(aModes);
  const bSet = new Set(bModes);
  const added = bModes.filter((m) => !aSet.has(m));
  const removed = aModes.filter((m) => !bSet.has(m));
  const kept = aModes.filter((m) => bSet.has(m));
  const aKeptOrder = aModes.filter((m) => bSet.has(m));
  const bKeptOrder = bModes.filter((m) => aSet.has(m));
  const reordered = aKeptOrder.join('|') !== bKeptOrder.join('|');

  // Citations.
  const aCits = extractCitations(a.narrative);
  const bCits = extractCitations(b.narrative);
  const citAdded = [...bCits].filter((c) => !aCits.has(c)).sort();
  const citRemoved = [...aCits].filter((c) => !bCits.has(c)).sort();
  const citKept = [...aCits].filter((c) => bCits.has(c)).sort();

  const narrativeSimilarity = jaccard(tokenSet(a.narrative), tokenSet(b.narrative));
  const elapsedA = a.stepResults.reduce((sum, s) => sum + s.elapsedMs, 0);
  const elapsedB = b.stepResults.reduce((sum, s) => sum + s.elapsedMs, 0);

  const materialChange =
    sectionDeltas.some((d) => d.status !== 'unchanged') ||
    added.length > 0 || removed.length > 0;

  return {
    sections: sectionDeltas,
    modes: { added, removed, kept, reordered },
    citations: { added: citAdded, removed: citRemoved, kept: citKept },
    elapsedDeltaMs: elapsedB - elapsedA,
    narrativeSimilarity,
    materialChange,
  };
}
