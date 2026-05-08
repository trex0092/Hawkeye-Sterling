// Hawkeye Sterling — shared category-aware default apply.
//
// Replaces the dead `score:0, verdict:inconclusive, rationale:[stub]`
// pattern that pollutes every wave4-12 mode. The default still runs but
// now actually inspects the BrainContext: it looks at the mode's
// declared category + faculties to decide which evidence channels to
// inspect, and emits a finding that contributes to fusion when there
// is something to say (rather than a hard zero that fusion has to
// filter out).
//
// Bespoke modes can still override this default; this is the safety
// net so the brain never returns a no-op for a registered mode.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory,
} from '../types.js';

// Categories whose default behaviour is "scan jurisdiction chain".
const JURISDICTION_CATEGORIES = new Set<ReasoningCategory>([
  'compliance_framework', 'predicate_crime', 'proliferation', 'ftz_risk',
  'regulatory_aml', 'geopolitical_risk', 'systemic_risk',
]);

// Categories that lean on transactions / amounts.
const TRANSACTION_CATEGORIES = new Set<ReasoningCategory>([
  'forensic', 'forensic_accounting', 'behavioral_signals',
  'behavioral_economics', 'behavioral_science', 'market_integrity',
  'professional_ml', 'hawala_ivt', 'correspondent_banking',
  'quantitative_analysis',
  // Wave-5/6 additions: financial-data-driven modes.
  'asset_recovery',        // traces assets through transaction chains
  'cryptoasset_forensics', // on-chain transaction forensics
  'conduct_risk',          // incentive / financial conduct pattern analysis
]);

// Categories that operate on UBO graph.
const NETWORK_CATEGORIES = new Set<ReasoningCategory>([
  'graph_analysis', 'network_science', 'sectoral_typology',
  'corporate_intelligence',
]);

// Categories that scan free-text / narrative.
const TEXT_CATEGORIES = new Set<ReasoningCategory>([
  'osint', 'threat_modeling', 'cognitive_science',
  'psychological_profiling', 'epistemic_quality',
  // Wave-5/12 additions: narrative-signal-driven modes.
  'identity_fraud',   // document and narrative identity analysis
  'digital_economy',  // platform and API abuse narrative signals
  'human_rights',     // labour-exploitation narrative patterns
  'insider_threat',   // behavioural / access narrative signals
  'legal_reasoning',  // regulatory document and text analysis
]);

// Categories that cross-check existing prior findings.
const META_CATEGORIES = new Set<ReasoningCategory>([
  'logic', 'decision_theory', 'causal', 'statistical',
  'intelligence_fusion', 'common_sense', 'formal_reasoning',
  // Wave-5/12 additions: synthesis over prior findings.
  'strategic',    // game-theoretic / strategic reasoning over findings
  'governance',   // governance gate checks over prior compliance findings
  'data_quality', // data-quality assessment of the prior finding set
]);

const FATF_HIGH_RISK = new Set(['IR', 'KP', 'MM']);
const FATF_INC_MONITORING = new Set([
  'AF', 'CD', 'NG', 'SD', 'YE', 'BG', 'BF', 'KH', 'CM', 'HR', 'HT', 'KE',
  'LA', 'LB', 'MY', 'ML', 'MZ', 'NA', 'NE', 'SN', 'SS', 'SY', 'TZ', 'TR',
  'VE', 'VN',
]);

function jurisdictionsOf(ctx: BrainContext): string[] {
  const out = new Set<string>();
  if (ctx.subject.jurisdiction) out.add(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) out.add(ctx.subject.nationality.toUpperCase());
  const ubo = ctx.evidence.uboChain;
  if (Array.isArray(ubo)) {
    for (const e of ubo) {
      if (e && typeof e === 'object') {
        const j =
          (e as Record<string, unknown>)['jurisdiction'] ??
          (e as Record<string, unknown>)['country'];
        if (typeof j === 'string') out.add(j.toUpperCase());
      }
    }
  }
  return [...out];
}

function amountsOf(ctx: BrainContext): number[] {
  const out: number[] = [];
  const txs = ctx.evidence.transactions;
  if (Array.isArray(txs)) {
    for (const t of txs) {
      if (t && typeof t === 'object' && 'amount' in t) {
        const a = (t as { amount: unknown }).amount;
        if (typeof a === 'number' && a > 0) out.push(a);
        else if (typeof a === 'string' && /^[\d.,]+$/.test(a)) {
          const n = Number(a.replace(/,/g, ''));
          if (Number.isFinite(n) && n > 0) out.push(n);
        }
      }
    }
  }
  return out;
}

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

/** Build a default-apply function that does category-aware inspection
 *  and emits a contributing Finding when relevant evidence exists. */
export function defaultApply(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): (ctx: BrainContext) => Promise<Finding> {
  return async (ctx: BrainContext): Promise<Finding> => {
    const now = Date.now();
    const base = { modeId, category, faculties, producedAt: now } as const;

    // Jurisdiction-driven categories
    if (JURISDICTION_CATEGORIES.has(category)) {
      const js = jurisdictionsOf(ctx);
      const calls = js.filter((j) => FATF_HIGH_RISK.has(j));
      const grey = js.filter((j) => FATF_INC_MONITORING.has(j));
      if (js.length === 0) {
        return {
          ...base,
          score: 0,
          confidence: 0.3,
          verdict: 'inconclusive',
          rationale: `${description} — no jurisdiction in chain to evaluate.`,
          evidence: [],
        };
      }
      const score = calls.length ? 0.85 : grey.length ? 0.45 : 0.1;
      return {
        ...base,
        score,
        confidence: 0.7,
        verdict: calls.length ? 'escalate' : grey.length ? 'flag' : 'clear',
        rationale: `${description} — chain ${js.join('→')}: ${calls.length} CFA, ${grey.length} grey.`,
        evidence: [
          `chain=${js.join('→')}`,
          ...calls.map((j) => `cfa=${j}`),
          ...grey.map((j) => `grey=${j}`),
        ],
      };
    }

    // Transaction-driven categories
    if (TRANSACTION_CATEGORIES.has(category)) {
      const amts = amountsOf(ctx);
      if (amts.length === 0) {
        return {
          ...base,
          score: 0,
          confidence: 0.3,
          verdict: 'inconclusive',
          rationale: `${description} — no transactions available to analyse.`,
          evidence: [],
        };
      }
      const sum = amts.reduce((a, b) => a + b, 0);
      const max = Math.max(...amts);
      const mean = sum / amts.length;
      const conc = max / sum; // single-tx concentration
      const score = conc > 0.5 ? 0.55 : conc > 0.25 ? 0.3 : 0.15;
      return {
        ...base,
        score,
        confidence: 0.6,
        verdict: conc > 0.5 ? 'flag' : 'clear',
        rationale: `${description} — n=${amts.length}, Σ=${sum.toFixed(2)}, max=${max.toFixed(2)} (${(conc * 100).toFixed(1)}% of total).`,
        evidence: [`n=${amts.length}`, `mean=${mean.toFixed(2)}`, `max=${max.toFixed(2)}`, `concentration=${conc.toFixed(2)}`],
      };
    }

    // Network-driven categories
    if (NETWORK_CATEGORIES.has(category)) {
      const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
      if (ubo.length === 0) {
        return {
          ...base,
          score: 0,
          confidence: 0.3,
          verdict: 'inconclusive',
          rationale: `${description} — no UBO chain available to traverse.`,
          evidence: [],
        };
      }
      const depth = ubo.length;
      const score = depth >= 5 ? 0.6 : depth >= 3 ? 0.35 : 0.15;
      return {
        ...base,
        score,
        confidence: 0.65,
        verdict: depth >= 5 ? 'flag' : 'clear',
        rationale: `${description} — UBO chain depth=${depth}.`,
        evidence: [`ubo_depth=${depth}`],
      };
    }

    // Text-driven categories
    if (TEXT_CATEGORIES.has(category)) {
      const text = freeTextOf(ctx);
      if (text.length < 32) {
        return {
          ...base,
          score: 0,
          confidence: 0.3,
          verdict: 'inconclusive',
          rationale: `${description} — narrative too thin (${text.length} chars).`,
          evidence: [`text_chars=${text.length}`],
        };
      }
      // Heuristic: count "concern words" in the narrative.
      const concernKW = ['fraud', 'launder', 'sanction', 'terror', 'bribe', 'corrupt', 'evasion', 'conceal', 'suspicious', 'illicit'];
      const hits = concernKW.filter((k) => text.includes(k));
      const score = Math.min(0.7, hits.length * 0.15);
      return {
        ...base,
        score,
        confidence: 0.5,
        verdict: hits.length >= 3 ? 'flag' : 'clear',
        rationale: `${description} — ${hits.length} concern keyword${hits.length === 1 ? '' : 's'} in narrative.`,
        evidence: hits.length ? hits.map((h) => `kw=${h}`) : [`text_chars=${text.length}`],
      };
    }

    // Meta-reasoning categories — depend on prior findings.
    if (META_CATEGORIES.has(category)) {
      const usable = ctx.priorFindings.filter(
        (f) => !f.rationale.startsWith('[stub]') && f.confidence > 0.2,
      );
      if (usable.length < 2) {
        return {
          ...base,
          score: 0,
          confidence: 0.3,
          verdict: 'inconclusive',
          rationale: `${description} — need ≥2 confident priors (got ${usable.length}).`,
          evidence: [`prior_count=${usable.length}`],
        };
      }
      const meanScore = usable.reduce((a, b) => a + b.score, 0) / usable.length;
      const variance =
        usable.reduce((a, b) => a + (b.score - meanScore) ** 2, 0) / usable.length;
      return {
        ...base,
        score: meanScore,
        confidence: Math.max(0.4, 0.9 - variance),
        verdict: meanScore >= 0.6 ? 'escalate' : meanScore >= 0.3 ? 'flag' : 'clear',
        rationale: `${description} — meta over ${usable.length} priors: μ=${meanScore.toFixed(2)}, σ²=${variance.toFixed(3)}.`,
        evidence: [`prior_count=${usable.length}`, `mean=${meanScore.toFixed(2)}`, `variance=${variance.toFixed(3)}`],
        tags: ['meta'],
      };
    }

    // Catch-all — emit an evidence-aware inconclusive that cites what
    // channels were examined so an auditor knows the mode actually ran.
    const ev = ctx.evidence;
    const channels = [
      ['sanctions', Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0],
      ['pep', Array.isArray(ev.pepHits) ? ev.pepHits.length : 0],
      ['adverse_media', Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0],
      ['ubo', Array.isArray(ev.uboChain) ? ev.uboChain.length : 0],
      ['transactions', Array.isArray(ev.transactions) ? ev.transactions.length : 0],
      ['documents', Array.isArray(ev.documents) ? ev.documents.length : 0],
    ] as const;
    const populated = channels.filter(([, n]) => n > 0);
    return {
      ...base,
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `${description} — mode executed but no category-specific apply registered. Evidence channels populated: ${populated.map(([n, c]) => `${n}=${c}`).join(', ') || 'none'}.`,
      evidence: populated.map(([n, c]) => `channel:${n}=${c}`),
    };
  };
}
