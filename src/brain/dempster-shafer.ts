// Hawkeye Sterling — Dempster-Shafer (DS) belief combination.
//
// DS theory generalises Bayesian probability by allowing mass to be
// assigned to *sets* of hypotheses, not just singletons. This is exactly
// what an MLRO does informally when a source says "looks bad, but I
// can't tell if it's PEP exposure or sanctions evasion" — the evidence
// supports {pep, sanctioned} jointly without committing to either.
//
// Why both DS and Bayes? Bayes (in `bayesian-update.ts` + `fusion.ts`)
// requires explicit P(E|H) and P(E|¬H) for every piece of evidence and
// chokes on uninformative priors. DS lets a mode emit "I'm 0.6 confident
// this is one of {ml, tf, fraud}, 0.1 unsure (Θ)" without forcing a
// per-hypothesis split. We surface DS alongside Bayes so analysts can
// see the agreement/conflict between the two combinators.
//
// Charter P9: every input mass is preserved in the trace; the conflict
// mass K is reported separately rather than silently absorbed by Yager
// or Inagaki normalisation.
//
// References:
//   Shafer (1976) "A Mathematical Theory of Evidence"
//   Yager (1987) "On the Dempster-Shafer Framework and New Combination Rules"

export type Hyp = string;
export type FocalSet = readonly Hyp[]; // sorted, deduped subset of frame Θ

export interface BeliefMass {
  /** Identifier of the source / mode emitting this mass distribution. */
  sourceId: string;
  /** Map from focal set (joined by `|` after sort) to mass in [0,1]. */
  mass: Record<string, number>;
}

export interface DSResult {
  /** The frame of discernment Θ used during combination. */
  frame: Hyp[];
  /** Combined mass after Dempster's rule (or Yager when conflict ≥ K_HIGH). */
  combined: Record<string, number>;
  /** Belief Bel(A) — sum of masses of all subsets of A — for each singleton. */
  belief: Record<Hyp, number>;
  /** Plausibility Pl(A) = 1 - Bel(¬A) — for each singleton. */
  plausibility: Record<Hyp, number>;
  /** Pignistic probability BetP(A) — Smets' transformation for decision-making. */
  pignistic: Record<Hyp, number>;
  /** Total conflict K across the combination chain (0..1). */
  conflict: number;
  /** Combination rule actually applied. */
  rule: "dempster" | "yager";
  /** Per-step trace for audit. */
  steps: Array<{
    sourceId: string;
    conflictThisStep: number;
    massAfter: Record<string, number>;
  }>;
}

const EPS = 1e-12;
const K_HIGH = 0.95; // when conflict ≥ this, fall back to Yager (assigns conflict to Θ)

function setKey(s: FocalSet): string {
  return [...s].sort().join("|");
}

function parseKey(k: string): FocalSet {
  return k === "" ? [] : k.split("|");
}

function intersect(a: FocalSet, b: FocalSet): FocalSet {
  const sb = new Set(b);
  return a.filter((x) => sb.has(x));
}

function union(a: FocalSet, b: FocalSet): FocalSet {
  return [...new Set([...a, ...b])].sort();
}

function isSubsetOf(a: FocalSet, b: FocalSet): boolean {
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function normaliseInput(m: BeliefMass, frame: Hyp[]): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(m.mass)) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const focal = parseKey(k);
    // Drop hypotheses outside the declared frame.
    const filtered = focal.filter((h) => frame.includes(h));
    if (filtered.length === 0) continue;
    const norm = setKey(filtered);
    out[norm] = (out[norm] ?? 0) + v;
    total += v;
  }
  // If total < 1, the residual goes to Θ (frame) — represents ignorance.
  if (total < 1 - EPS) {
    const theta = setKey(frame);
    out[theta] = (out[theta] ?? 0) + (1 - total);
  } else if (total > 1 + EPS) {
    // Re-normalise.
    for (const k of Object.keys(out)) out[k] = (out[k] ?? 0) / total;
  }
  return out;
}

/** Combine two mass functions with Dempster's rule (or Yager when conflict
 *  saturates). Returns the combined mass and the conflict mass K. */
function combinePair(
  m1: Record<string, number>,
  m2: Record<string, number>,
  rule: "dempster" | "yager",
): { combined: Record<string, number>; conflict: number } {
  const raw: Record<string, number> = {};
  let K = 0;
  const frameKeys1 = Object.keys(m1);
  const frameKeys2 = Object.keys(m2);
  for (const k1 of frameKeys1) {
    const v1 = m1[k1] ?? 0;
    if (v1 < EPS) continue;
    for (const k2 of frameKeys2) {
      const v2 = m2[k2] ?? 0;
      if (v2 < EPS) continue;
      const inter = intersect(parseKey(k1), parseKey(k2));
      const product = v1 * v2;
      if (inter.length === 0) {
        K += product;
      } else {
        const ik = setKey(inter);
        raw[ik] = (raw[ik] ?? 0) + product;
      }
    }
  }

  if (rule === "yager") {
    // Yager: conflict mass goes to Θ (the universal frame) instead of
    // re-normalising. Better-behaved when K → 1.
    const allHyps = new Set<Hyp>();
    for (const k of [...frameKeys1, ...frameKeys2]) for (const h of parseKey(k)) allHyps.add(h);
    const theta = setKey([...allHyps].sort());
    raw[theta] = (raw[theta] ?? 0) + K;
    return { combined: raw, conflict: K };
  }

  // Dempster: re-normalise by 1/(1-K).
  if (K >= 1 - EPS) {
    // Total conflict — Dempster is undefined; promote to Yager.
    const allHyps = new Set<Hyp>();
    for (const k of [...frameKeys1, ...frameKeys2]) for (const h of parseKey(k)) allHyps.add(h);
    const theta = setKey([...allHyps].sort());
    return { combined: { [theta]: 1 }, conflict: K };
  }
  const norm = 1 / (1 - K);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = v * norm;
  return { combined: out, conflict: K };
}

export function combineDS(
  frame: Hyp[],
  masses: BeliefMass[],
  opts: { rule?: "dempster" | "yager" | "auto" } = {},
): DSResult {
  if (frame.length === 0) {
    throw new Error("combineDS: frame of discernment must not be empty");
  }
  const sortedFrame = [...frame].sort();
  const ruleRequest = opts.rule ?? "auto";
  let actualRule: "dempster" | "yager" = ruleRequest === "yager" ? "yager" : "dempster";

  const steps: DSResult["steps"] = [];
  let acc: Record<string, number> = { [setKey(sortedFrame)]: 1 }; // initial vacuous mass
  let totalK = 0;

  for (const m of masses) {
    const norm = normaliseInput(m, sortedFrame);
    let attempted = ruleRequest === "auto" ? "dempster" : actualRule;
    // Pre-compute conflict to decide auto-promotion to Yager.
    if (ruleRequest === "auto") {
      const peek = combinePair(acc, norm, "dempster");
      if (peek.conflict >= K_HIGH) attempted = "yager";
    }
    const step = combinePair(acc, norm, attempted as "dempster" | "yager");
    acc = step.combined;
    totalK = totalK + step.conflict - totalK * step.conflict; // probabilistic OR over chain
    if (attempted === "yager") actualRule = "yager";
    steps.push({
      sourceId: m.sourceId,
      conflictThisStep: step.conflict,
      massAfter: { ...acc },
    });
  }

  // Belief, Plausibility, Pignistic for each singleton.
  const belief: Record<Hyp, number> = {};
  const plausibility: Record<Hyp, number> = {};
  const pignistic: Record<Hyp, number> = {};
  for (const h of sortedFrame) {
    let bel = 0;
    let pl = 0;
    let bet = 0;
    for (const [k, v] of Object.entries(acc)) {
      const focal = parseKey(k);
      if (isSubsetOf(focal, [h])) bel += v;
      if (focal.includes(h)) {
        pl += v;
        bet += v / focal.length;
      }
    }
    belief[h] = bel;
    plausibility[h] = pl;
    pignistic[h] = bet;
  }

  return {
    frame: sortedFrame,
    combined: acc,
    belief,
    plausibility,
    pignistic,
    conflict: totalK,
    rule: actualRule,
    steps,
  };
}

/** Convenience: collapse a DS result down to a single posterior probability
 *  for one focal hypothesis using the pignistic transformation (Smets' BetP).
 *  This is the value to feed into a Bayes-style posterior comparison. */
export function pignisticOf(result: DSResult, h: Hyp): number {
  return result.pignistic[h] ?? 0;
}
